"""FastAPI app: README section 4.

uv run uvicorn app.main:app --reload --port 8000           # real swarm
MOCK=1 uv run uvicorn app.main:app --reload --port 8000    # shared/mock_plan.json + fake events
"""

import asyncio
import json
import os
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from pydantic import ValidationError

from app.models import PlanCreated, PlanRequest, TripPlan
from app.swarm import TripRequest, run_swarm
from common import BACKEND_DIR, OUTPUT_DIR
from download_deliverable import download_session_files

MOCK = os.getenv("MOCK") == "1"
MOCK_PLAN = BACKEND_DIR.parent / "shared" / "mock_plan.json"
DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"


@dataclass
class PlanState:
    """One trip. Events are kept (not consumed) so late or reconnecting SSE clients replay them."""

    events: list[dict[str, Any]] = field(default_factory=list)
    changed: asyncio.Event = field(default_factory=asyncio.Event)
    plan: dict | None = None
    error: str | None = None
    session_id: str | None = None
    docx: Path | None = None

    @property
    def done(self) -> bool:
        return self.plan is not None or self.error is not None

    def push(self, event: dict[str, Any]) -> None:
        if event["type"] == "result":
            self.plan = event["plan"]
        elif event["type"] == "error":
            self.error = event["message"]
        self.events.append(event)
        self.changed.set()


plans: dict[str, PlanState] = {}
tasks: set[asyncio.Task] = set()  # keep references so background tasks aren't GC'd

app = FastAPI(title="Wanderswarm")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def validate_plan(raw: dict, plan_id: str) -> dict:
    """Normalise the coordinator's JSON to TripPlan. Fills in plan_id; never drops a plan."""
    raw = {**raw, "plan_id": plan_id}
    try:
        return TripPlan.model_validate(raw).model_dump()
    except ValidationError as e:
        raw.setdefault("warnings", []).append(
            f"Plan did not fully match the schema ({e.error_count()} issues)"
        )
        return raw


async def run_real(state: PlanState, req: PlanRequest, plan_id: str) -> None:
    loop = asyncio.get_running_loop()

    def emit(event: dict[str, Any]) -> None:
        loop.call_soon_threadsafe(state.push, event)

    trip = TripRequest(**req.model_dump())
    try:
        result = await asyncio.to_thread(run_swarm, trip, plan_id, emit)
    # Any failure must reach the client, or the SSE stream waits forever.
    # require_state() raises SystemExit.
    except (Exception, SystemExit) as e:  # noqa: BLE001
        state.push({"type": "error", "message": f"Swarm failed: {e}"})
        return
    await asyncio.sleep(0)  # let queued emit() callbacks land before the final event
    state.session_id = result.session_id
    print(
        f"[{plan_id}] session https://platform.claude.com/sessions/{result.session_id}",
        flush=True,
    )
    if result.plan is None:
        state.push(
            {"type": "error", "message": "Coordinator returned no valid TripPlan"}
        )
        return
    if req.want_docx:
        files = await asyncio.to_thread(
            download_session_files, result.session_id, OUTPUT_DIR / plan_id
        )
        state.docx = next((f for f in files if f.suffix == ".docx"), None)
    state.push({"type": "result", "plan": validate_plan(result.plan, plan_id)})


async def run_mock(state: PlanState, req: PlanRequest, plan_id: str) -> None:
    plan = json.loads(MOCK_PLAN.read_text())
    events: list[dict[str, Any]] = [
        {
            "type": "agent_started",
            "agent": "coordinator",
            "message": f"Planning {req.destination}",
        },
        *(
            {"type": "log", "agent": "coordinator", "message": f"Briefing {a}"}
            for a in req.interests
        ),
        *(
            {"type": "agent_started", "agent": a, "message": f"Researching {a}"}
            for a in req.interests
        ),
        *(
            {"type": "agent_finished", "agent": a, "message": "Done (mock)"}
            for a in req.interests
        ),
        {
            "type": "log",
            "agent": "coordinator",
            "message": f"Merging results into {len(plan['days'])} days",
        },
        {"type": "agent_finished", "agent": "coordinator", "message": "Plan ready"},
    ]
    for e in events:
        await asyncio.sleep(1)
        state.push(e)
    state.push({"type": "result", "plan": validate_plan(plan, plan_id)})


@app.post("/api/plan", status_code=202, response_model=PlanCreated)
async def create_plan(req: PlanRequest) -> PlanCreated:
    plan_id = uuid.uuid4().hex[:6]
    state = plans[plan_id] = PlanState()
    task = asyncio.create_task((run_mock if MOCK else run_real)(state, req, plan_id))
    tasks.add(task)
    task.add_done_callback(tasks.discard)
    return PlanCreated(plan_id=plan_id)


def get_state(plan_id: str) -> PlanState:
    if plan_id not in plans:
        raise HTTPException(404, f"Unknown plan {plan_id}")
    return plans[plan_id]


@app.get("/api/plan/{plan_id}/events")
async def plan_events(plan_id: str) -> StreamingResponse:
    state = get_state(plan_id)

    async def stream():
        sent = 0
        while True:
            state.changed.clear()
            while sent < len(state.events):
                yield f"data: {json.dumps(state.events[sent], ensure_ascii=False)}\n\n"
                sent += 1
            if state.done:
                return
            try:
                await asyncio.wait_for(state.changed.wait(), timeout=15)
            except TimeoutError:
                yield ": keep-alive\n\n"

    return StreamingResponse(
        stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.get("/api/plan/{plan_id}")
async def plan_result(plan_id: str) -> JSONResponse:
    state = get_state(plan_id)
    if state.plan is not None:
        return JSONResponse(state.plan)
    if state.error is not None:
        return JSONResponse(
            {"status": "error", "message": state.error}, status_code=500
        )
    return JSONResponse({"status": "running"}, status_code=202)


@app.get("/api/plan/{plan_id}/docx")
async def plan_docx(plan_id: str) -> FileResponse:
    state = get_state(plan_id)
    if state.docx is None or not state.docx.exists():
        raise HTTPException(404, "This plan has no .docx")
    return FileResponse(
        state.docx, media_type=DOCX_MIME, filename=f"wanderswarm-{plan_id}.docx"
    )
