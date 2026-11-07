"""Run one trip through the Managed Agents swarm and translate its events (README 6.3).

Synchronous on purpose (same shape as the old run_deal_desk.py loop). From FastAPI, call
it with `await asyncio.to_thread(run_swarm, req, plan_id, emit)` and have `emit` push into
the plan's asyncio.Queue with `loop.call_soon_threadsafe`.
"""

import json
import re
import time
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import date
from typing import Any

from common import AGENT_KEYS, client, require_state

Emit = Callable[[dict[str, Any]], None]

TIMEOUT_S = 300
SESSION_BUDGET = {
    "type": "limit",
    "max_list_cost": {"amount": "500", "currency": "USD"},
}  # $5.00

RETRY_MESSAGE = (
    "Your last output was not valid TripPlan JSON. Reply with ONLY the JSON."
)


@dataclass
class TripRequest:
    destination: str
    start_date: str
    end_date: str
    interests: list[str]
    notes: str | None = None
    want_docx: bool = False


@dataclass
class SwarmResult:
    session_id: str
    plan: dict | None
    raw_text: str
    warnings: list[str] = field(default_factory=list)


def build_user_message(req: TripRequest, plan_id: str) -> str:
    days = (
        date.fromisoformat(req.end_date) - date.fromisoformat(req.start_date)
    ).days + 1
    msg = (
        f"Plan a trip to {req.destination} from {req.start_date} to {req.end_date}"
        f" ({days} days, both dates inclusive). Tell each specialist it is {days} days.\n"
        f"Use ONLY these specialists, in parallel: {', '.join(req.interests)}.\n"
        f"Notes: {req.notes or 'none'}.\n"
        f'Return ONLY the TripPlan JSON with plan_id "{plan_id}".'
    )
    if req.want_docx:
        msg += "\nAlso write the plan as a Word document to /mnt/session/outputs/trip.docx."
    return msg


def extract_json(text: str) -> dict | None:
    """Parse the TripPlan out of the coordinator's final text (tolerates fences/prose)."""
    text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text.strip())
    start, end = text.find("{"), text.rfind("}")
    if start == -1 or end <= start:
        return None
    try:
        value = json.loads(text[start : end + 1])
    except json.JSONDecodeError:
        return None
    return value if isinstance(value, dict) else None


def _agent_key(name: str | None) -> str:
    return AGENT_KEYS.get(name or "", name or "unknown")


def _started_message(key: str, req: TripRequest) -> str:
    city = req.destination.split(",")[0]
    return {
        "sights": f"Finding must-see spots in {city}",
        "food": f"Finding local dishes and places to eat in {city}",
        "football": f"Checking fixtures {req.start_date} to {req.end_date}",
    }.get(key, f"Researching {city}")


FOUND_NOUN = {
    "sights": "places to see",
    "food": "places to eat",
    "football": "football picks",
}


def _parse_result(key: str, content: list) -> dict | None:
    """The specialist's SpecialistResult (README 5), or None if its reply isn't one."""
    text = "".join(b.text for b in content if getattr(b, "type", None) == "text")
    result = extract_json(text)
    if result is None or not isinstance(result.get("items"), list):
        return None
    items = [i for i in result["items"] if isinstance(i, dict) and i.get("title")]
    return {
        "agent": key,
        "items": items,
        "highlights": [h for h in result.get("highlights") or [] if isinstance(h, str)],
        "warnings": [w for w in result.get("warnings") or [] if isinstance(w, str)],
    }


def _finished_message(key: str, result: dict) -> str:
    """Summarise a SpecialistResult reply, e.g. "Found 6 places to eat (2 warnings)"."""
    n = len(result["items"])
    noun = FOUND_NOUN.get(key, "items")
    msg = f"Found {n} {noun}" if n else f"No {noun} found for these dates"
    if w := len(result.get("warnings") or []):
        msg += f" ({w} warning{'s' * (w > 1)})"
    return msg


def _waiting_message(pending: list[str]) -> str:
    if pending:
        return f"Waiting for {', '.join(pending)}"
    return "All specialists reported; building the day-by-day plan"


def _stream_turn(
    c, session_id: str, text: str, req: TripRequest, emit: Emit, deadline: float
) -> tuple[str, list[str]]:
    """Send one user.message, stream until the session settles; return last agent text."""
    last_text: list[str] = []
    warnings: list[str] = []
    pending: list[str] = []  # briefed specialists that haven't reported back yet
    with c.beta.sessions.events.stream(session_id) as stream:
        c.beta.sessions.events.send(
            session_id,
            events=[
                {"type": "user.message", "content": [{"type": "text", "text": text}]}
            ],
        )
        for event in stream:
            t = event.type
            if time.monotonic() > deadline:
                warnings.append(
                    f"Swarm timed out after {TIMEOUT_S}s; plan may be incomplete."
                )
                c.beta.sessions.events.send(
                    session_id, events=[{"type": "user.interrupt"}]
                )
                break

            if t == "session.thread_created":
                key = _agent_key(getattr(event, "agent_name", None))
                if key != "coordinator" and not key.startswith("anthropic."):
                    emit(
                        {
                            "type": "agent_started",
                            "agent": key,
                            "message": _started_message(key, req),
                        }
                    )
            elif t == "agent.thread_message_sent":
                key = _agent_key(event.to_agent_name)
                if key not in pending:
                    pending.append(key)
                emit(
                    {
                        "type": "log",
                        "agent": "coordinator",
                        "message": f"Briefed {key}. {_waiting_message(pending)}",
                    }
                )
            elif t == "agent.thread_message_received":
                key = _agent_key(event.from_agent_name)
                result = _parse_result(key, event.content)
                # Specialists often send a progress note before their result; only the
                # SpecialistResult itself counts as finished.
                if result is not None and not key.startswith("anthropic."):
                    emit(
                        {
                            "type": "agent_finished",
                            "agent": key,
                            "message": _finished_message(key, result),
                        }
                    )
                    # Lets the UI show this agent's picks before the merge (README 4.2).
                    emit({"type": "agent_result", "agent": key, "result": result})
                    if key in pending:
                        pending.remove(key)
                        emit(
                            {
                                "type": "log",
                                "agent": "coordinator",
                                "message": _waiting_message(pending),
                            }
                        )
            elif t == "agent.message":
                parts = [
                    b.text for b in event.content if getattr(b, "type", None) == "text"
                ]
                if parts:
                    last_text = parts
            elif t in ("agent.tool_use", "agent.mcp_tool_use"):
                # Unattended: deny anything the auto policy paused for a human.
                if getattr(event, "evaluated_permission", None) == "ask":
                    c.beta.sessions.events.send(
                        session_id,
                        events=[
                            {
                                "type": "user.tool_confirmation",
                                "tool_use_id": event.id,
                                "result": "deny",
                            }
                        ],
                    )
            elif t == "session.status_idle":
                reason = event.stop_reason.type
                if reason == "requires_action":
                    continue
                if reason == "budget_reached":
                    warnings.append("Session budget reached; plan may be incomplete.")
                break
            elif t == "session.status_terminated":
                warnings.append("Session terminated early.")
                break
    for key in pending:  # briefed but never sent a readable SpecialistResult
        emit(
            {
                "type": "agent_finished",
                "agent": key,
                "message": "Finished without a readable result",
            }
        )
    return "".join(last_text), warnings


def run_swarm(req: TripRequest, plan_id: str, emit: Emit) -> SwarmResult:
    c = client()
    session = c.beta.sessions.create(
        agent=require_state("coordinator_id", "setup.create_coordinator"),
        environment_id=require_state("environment_id", "setup.setup_environment"),
        title=f"Wanderswarm: {req.destination} {req.start_date}",
        budget=SESSION_BUDGET,
    )
    emit(
        {
            "type": "agent_started",
            "agent": "coordinator",
            "message": f"Planning {req.destination}",
        }
    )

    deadline = time.monotonic() + TIMEOUT_S
    text, warnings = _stream_turn(
        c, session.id, build_user_message(req, plan_id), req, emit, deadline
    )
    plan = extract_json(text)
    if plan is None and time.monotonic() < deadline:
        emit({"type": "log", "agent": "coordinator", "message": "Fixing JSON output"})
        text, more = _stream_turn(c, session.id, RETRY_MESSAGE, req, emit, deadline)
        warnings += more
        plan = extract_json(text)

    if plan is not None:
        plan.setdefault("warnings", []).extend(warnings)
        emit(
            {"type": "agent_finished", "agent": "coordinator", "message": "Plan ready"}
        )
    return SwarmResult(
        session_id=session.id, plan=plan, raw_text=text, warnings=warnings
    )
