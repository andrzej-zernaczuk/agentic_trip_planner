# Wanderswarm: Travel Agent Swarm

> Hackathon POC (Track 03, Specialist Swarm Agent). Time budget: **1 hour**.
> The user names a destination and dates. A **coordinator agent** hands the work to
> **specialist sub-agents** (sights, food, football, ...). Each specialist owns one part
> of the trip. The coordinator merges their results into a single day-by-day plan.

This README is the shared contract between the **backend** and **frontend** halves of the team.
Paste it into your Claude session as context. If the contract changes, update this file first.

---

## 1. How it works

The swarm runs on **Claude Managed Agents** (multi-agent). The agents, their skills and the cloud
environment are created **once** by setup scripts and live in the Anthropic workspace. The backend only
opens a session per trip request and translates the session's event stream into our SSE events.

```
 ┌──────────────┐   POST /api/plan    ┌────────────────────────────────────────────┐
 │   FRONTEND   │ ──────────────────▶ │  BACKEND (FastAPI)                         │
 │  form + UI   │                     │    opens a Managed Agents session ──┐      │
 │              │ ◀── SSE events ──── │    maps session events → SSE        │      │
 │  progress +  │ ◀── TripPlan JSON ─ └─────────────────────────────────────┼──────┘
 │  itinerary   │                                                           ▼
 └──────────────┘                     ┌────────────────────────────────────────────┐
                                      │  ANTHROPIC (Managed Agents, cloud env)     │
                                      │            Coordinator agent               │
                                      │      ┌────────────┼────────────┐           │
                                      │      ▼            ▼            ▼           │
                                      │   Sights        Food        Football       │
                                      │   + skill       + skill     + skill        │
                                      │      └────────────┼────────────┘           │
                                      │                   ▼                        │
                                      │        merged TripPlan (JSON)              │
                                      └────────────────────────────────────────────┘
```

1. The user enters a destination, dates and interests.
2. The backend opens a session against the **coordinator**. The coordinator sends a brief to each relevant specialist, **in parallel** (each one runs in its own thread).
3. Each specialist researches its own area with web search, following its **skill**. It returns candidate items as JSON.
4. The coordinator builds a realistic day-by-day schedule and returns one `TripPlan` JSON.
5. The frontend shows live progress ("Food agent working…") and then renders the itinerary.

**The brief requires at least two agents.** The coordinator plus one specialist is enough. Add more specialists if time allows.

---

## 2. Agents

| Agent | Owns | Tools | Must not |
|---|---|---|---|
| `coordinator` | Reads the request, picks specialists, merges results, resolves time clashes, writes the final `TripPlan` | `agent_toolset_20260401` + `multiagent: coordinator` roster | Do research itself |
| `sights` | Must-see attractions, viewpoints, neighbourhoods, opening hours | `agent_toolset_20260401` (web search/fetch) + `sights-scout` skill | Plan meals |
| `food` | Local dishes to try, 1–2 restaurants/bars per day, rough price level | `agent_toolset_20260401` + `food-scout` skill | Invent restaurants |
| `football` | Matches in the city/region **within the trip dates**, stadium tours, football bars | `agent_toolset_20260401` + `football-scout` skill | Invent fixtures. If none are found, return an empty list and say so |
| *(stretch)* `critic` | Reviews the draft plan before it's returned (`stretch_critic_subagent.py`) | `agent_toolset_20260401` | Rewrite the plan itself |
| *(stretch)* `nightlife` / `weather` / `logistics` | Evening plans / forecast-aware swaps / transport between spots | same as specialists | — |

**Rules for all specialists:**
- Return **JSON only**, matching `SpecialistResult` (section 5).
- Every factual item gets a `source_url` where possible. A missing fact is better than a made-up one.
- Stay inside your own area. The coordinator handles everything that crosses areas.

**The roster is fixed at creation time.** The coordinator's `multiagent.agents` list contains every
specialist. `interests` in the request only changes the user message ("use only: food, football"). It does
not change the roster.

---

## 3. Repo layout

```
heist_crew/                       (repo; project name: Wanderswarm)
├── README.md                     ← this file (the contract)
├── pyproject.toml / uv.lock      ← one uv project for the backend (Python 3.13, anthropic>=2.6)
├── .env                          ← ANTHROPIC_API_KEY (gitignored)
├── shared/                       ← TODO
│   ├── trip_plan.schema.json     ← JSON Schema for TripPlan
│   └── mock_plan.json            ← realistic mock response (frontend works off this)
├── backend/                      ← BACKEND TEAM. Run every command from this folder.
│   ├── common.py                 ← client, models, agent names, .state/ helpers
│   ├── setup/                    ← one-off provisioning (re-runnable: updates in place)
│   │   ├── setup_environment.py  ← cloud environment          → .state/environment_id
│   │   ├── create_specialists.py ← sights / food / football    → .state/specialist_ids.json
│   │   ├── upload_skills.py      ← uploads skills/, attaches   → .state/skill_ids.json
│   │   ├── create_coordinator.py ← coordinator + roster        → .state/coordinator_id
│   │   └── stretch_critic_subagent.py  ← (stretch) adds a critic to the roster
│   ├── skills/                   ← custom skills, uploaded via the Skills API
│   │   ├── sights-scout/SKILL.md
│   │   ├── food-scout/SKILL.md
│   │   └── football-scout/SKILL.md
│   ├── app/
│   │   ├── swarm.py              ← run_swarm(): opens a session, maps events → SSE dicts, parses TripPlan
│   │   ├── main.py               ← TODO: FastAPI app, routes, CORS, SSE, MOCK=1
│   │   └── models.py             ← TODO: Pydantic models (mirror section 5)
│   ├── run_trip.py               ← CLI smoke test: one trip, events printed, plan → outputs/
│   ├── download_deliverable.py   ← pulls files (e.g. trip.docx) from a session
│   ├── .state/                   ← generated IDs (gitignored)
│   └── outputs/                  ← run outputs (gitignored)
└── frontend/                     ← FRONTEND TEAM (TODO)
    ├── package.json
    └── src/
        ├── api.ts                ← fetch + EventSource, switches mock/real via env
        ├── types.ts              ← TS types (mirror section 5)
        ├── agents.ts             ← label / icon / colour per agent and category
        ├── components/
        │   ├── TripForm.tsx
        │   ├── AgentProgress.tsx
        │   └── Itinerary.tsx
        └── mock/plan.json        ← copy of shared/mock_plan.json
```

The backend scripts started out as the Deal Desk starter kit (Managed Agents swarm for RFPs). They have
been ported to this use case. The old root-level scripts, RFP data and the Heist Crew plan are deleted.

---

## 4. API contract (backend ⇄ frontend)

Base URL: `http://localhost:8000`. The backend allows CORS from `http://localhost:5173`.

### 4.1 `POST /api/plan`: start a plan (**MUST HAVE**)

Request:
```json
{
  "destination": "Valencia, Spain",
  "start_date": "2026-11-20",
  "end_date": "2026-11-22",
  "interests": ["sights", "food", "football"],
  "notes": "Budget-friendly, we like walking"
}
```
- `interests` picks which specialists run. Allowed: `sights`, `food`, `football` (and stretch agents).
- `notes` is optional free text that goes to the coordinator.

Response `202`:
```json
{ "plan_id": "a1b2c3" }
```

### 4.2 `GET /api/plan/{plan_id}/events`: live progress (**MUST HAVE**, SSE)

A Server-Sent Events stream. Each `data:` line is one JSON event:

```json
{ "type": "agent_started",  "agent": "food",   "message": "Looking for local dishes in Valencia" }
{ "type": "agent_finished", "agent": "food",   "message": "Found 6 places" }
{ "type": "log",            "agent": "coordinator", "message": "Merging results into 3 days" }
{ "type": "result",         "plan": { ...TripPlan... } }
{ "type": "error",          "message": "Football agent timed out" }
```
- The stream closes after a `result` or `error` event.
- The frontend lights up an agent card on `agent_started` and ticks it on `agent_finished`.

### 4.3 `GET /api/plan/{plan_id}`: final result (fallback, polling)

- `200` → `TripPlan` when done
- `202` → `{ "status": "running" }`
- `404` → unknown id

### 4.4 `GET /api/plan/{plan_id}/docx`: branded export (*stretch*)

Returns `application/vnd.openxmlformats-officedocument.wordprocessingml.document`.
The coordinator writes `trip.docx` in the session container with the pre-built **docx skill**. The backend
fetches it with the `download_deliverable.py` logic (`client.beta.files.list(scope_id=session_id)`).
`404` if the session produced no file.

### 4.5 Mock mode

- Backend: `MOCK=1` returns `shared/mock_plan.json` and fake events spaced about 1 s apart. **Build this first** so the frontend can integrate early.
- Frontend: `VITE_USE_MOCK=true` reads `src/mock/plan.json` and simulates the events locally.

---

## 5. Data model

### `TripPlan` (final output, what the frontend renders)

```json
{
  "plan_id": "a1b2c3",
  "destination": "Valencia, Spain",
  "start_date": "2026-11-20",
  "end_date": "2026-11-22",
  "summary": "Three days of old town, paella by the sea and a night at Mestalla.",
  "agents_used": ["sights", "food", "football"],
  "days": [
    {
      "date": "2026-11-20",
      "title": "Old town & first paella",
      "items": [
        {
          "time": "10:00",
          "duration_min": 120,
          "title": "Ciutat Vella walking loop",
          "description": "Cathedral, Miguelete tower, La Lonja, Central Market.",
          "category": "sights",
          "agent": "sights",
          "location": "Ciutat Vella",
          "price_level": "€",
          "source_url": "https://example.com"
        }
      ]
    }
  ],
  "highlights": {
    "sights":   ["..."],
    "food":     ["Try: paella valenciana, horchata with fartons"],
    "football": ["No home matches found in these dates; stadium tour added instead"]
  },
  "warnings": ["Opening hours not verified for Sunday"]
}
```

| Field | Type | Notes |
|---|---|---|
| `time` | `"HH:MM"` or `null` | `null` = flexible |
| `category` | `"sights" \| "food" \| "football" \| "other"` | drives icon/colour in UI |
| `agent` | string | which specialist produced it (shown as a badge, the point of the demo) |
| `price_level` | `"€" \| "€€" \| "€€€" \| null` | |
| `source_url` | string or `null` | |

### `SpecialistResult` (internal: specialist → coordinator)

```json
{
  "agent": "football",
  "items": [
    {
      "title": "Valencia CF vs ??? (La Liga)",
      "description": "Kick-off time TBC by league",
      "preferred_date": "2026-11-21",
      "preferred_time": "21:00",
      "duration_min": 150,
      "location": "Estadio de Mestalla",
      "price_level": "€€",
      "source_url": "https://..."
    }
  ],
  "highlights": ["..."],
  "warnings": ["Fixture time not yet confirmed"]
}
```

The frontend never sees `SpecialistResult`. Only the backend and the agents use it.

---

## 6. Backend guide

**Stack:** Python 3.13, `uv`, FastAPI + uvicorn, `anthropic>=2.6` (Managed Agents beta), `python-dotenv`, Pydantic.
These are already in the root `pyproject.toml`. Add `sse-starlette` if you don't want to hand-roll a `StreamingResponse`.

```bash
uv sync                                    # from repo root
echo 'ANTHROPIC_API_KEY=sk-ant-...' > .env
cd backend

# one-off provisioning, in this order. Each step writes its IDs into .state/
uv run python -m setup.setup_environment
uv run python -m setup.create_specialists
uv run python -m setup.upload_skills       # needs specialist IDs
uv run python -m setup.create_coordinator  # last: the roster pins the specialists' current versions

uv run python run_trip.py "Valencia, Spain" 2026-11-20 2026-11-22   # smoke test (add --docx for the Word export)
MOCK=1 uv run uvicorn app.main:app --reload --port 8000             # API in mock mode
uv run uvicorn app.main:app --reload --port 8000                    # API against the real swarm
```

Your workspace needs Managed Agents multi-agent access. If `agents.create` returns 403, ask the organisers.

### 6.1 Provisioning scripts

All setup scripts are **re-runnable**. If an ID is already in `.state/`, the script updates that agent in
place (new version, same ID) instead of creating a duplicate. To iterate on prompts:

| You changed… | Re-run |
|---|---|
| a specialist prompt (`create_specialists.py`) | `setup.create_specialists`, then `setup.create_coordinator` |
| a `SKILL.md` | `setup.upload_skills` (new skill version; agents use `latest`) |
| the coordinator prompt | `setup.create_coordinator` |

Why the coordinator goes last: a roster entry without a version pins the specialist's latest version
**at the moment the coordinator is saved**. Re-saving the coordinator picks up new specialist versions.

**Configuration:**
- **Models:** coordinator, specialists and critic all `claude-sonnet-5-5` (`common.py`). The coordinator was switched from `claude-opus-5-5` for a faster merge; switch it back there if plan quality drops.
- **Tools:** specialists get the full agent toolset, including web search and fetch. The coordinator has web tools **off** (it must not research) and the pre-built `docx` skill for the stretch export.
- **Permissions:** all tools run under the `auto` policy. `swarm.py` **denies** any call that pauses for approval, because nobody is watching.
- **Multi-agent config:** `multiagent_20261001` with the specialists as the only roster (`inline_agents` disabled).
  - **Dynamic workflows are on** but limited to the same roster. The coordinator prompt allows a workflow run only for trips longer than 7 days or with several cities. Workflows cost extra tokens. To turn them off, set `"workflows": {"type": "disabled"}` in `create_coordinator.py`.
  - If the org doesn't have the new type yet, the script falls back to the older `{"type": "coordinator", "agents": [...]}` form, which has no workflows.
- **Budget:** every session is capped at $5 list cost (`SESSION_BUDGET` in `swarm.py`).

### 6.2 Prompts

- **Coordinator:** `COORDINATOR_SYSTEM` in `setup/create_coordinator.py`. It delegates to the named specialists in one turn, merges (fixed times first, max 5 items a day), and outputs TripPlan JSON only.
- **Specialists:** `SPECIALISTS` in `setup/create_specialists.py`. Short role prompts; the research steps and output format live in the skills (6.4).
- **Per-trip user message:** `build_user_message()` in `app/swarm.py`. It names the destination, dates and notes, lists only the requested specialists (`interests`), and passes the `plan_id`.

### 6.3 Session → SSE (`app/swarm.py`)

`run_swarm(req, plan_id, emit) -> SwarmResult(session_id, plan, raw_text, warnings)` is synchronous.
`emit` receives dicts that already match the SSE events in 4.2. Wiring it into FastAPI (`app/main.py`):

```python
loop = asyncio.get_running_loop()
queue: asyncio.Queue = plans[plan_id]["queue"]
emit = lambda e: loop.call_soon_threadsafe(queue.put_nowait, e)
result = await asyncio.to_thread(run_swarm, req, plan_id, emit)
plans[plan_id]["session_id"] = result.session_id      # for /docx
await queue.put({"type": "result", "plan": result.plan} if result.plan
                else {"type": "error", "message": "Coordinator returned no valid TripPlan"})
```

| Managed Agents event | Our SSE event |
|---|---|
| (session created) | `agent_started` for `coordinator` |
| `session.thread_created` | `agent_started` (`agent` = role key, mapped from `agent_name` via `AGENT_KEYS` in `common.py`) |
| `agent.thread_message_sent` | `log` from `coordinator`: "Briefed {agent}. Waiting for {pending}" |
| `agent.thread_message_received` | `agent_finished` for the agent that reported back, with a count from its `SpecialistResult` ("Found 6 places to eat (2 warnings)"), then a coordinator `log` ("Waiting for …" / "All specialists reported…") |
| `agent.message` | the last text block becomes the final output (no SSE event) |
| `session.status_idle` (not `requires_action`) | parse the output; `agent_finished` for `coordinator` |

- **Parsing:** `extract_json()` strips code fences and stray prose. If the output isn't valid JSON, the same session gets one retry message. Validate the result against your Pydantic `TripPlan` in `main.py`.
- **Timeout:** 300 s (`TIMEOUT_S`). A 3-day, 3-specialist trip takes about 3.5 min: specialists 1–2.5 min in parallel, coordinator merge about 50 s. On timeout the session is interrupted and a warning is added.
- **Docx (4.4):** `download_deliverable.download_session_files(session_id)`. Set `TripRequest.want_docx=True` so the coordinator writes `/mnt/session/outputs/trip.docx`.
- **Debugging:** open `https://platform.claude.com/sessions/{session_id}` to see every thread.

### 6.4 Skills (`backend/skills/<name>/SKILL.md`)

Skills hold each specialist's know-how and the `SpecialistResult` format, so prompts stay short. The agents
can't read this README, so the schema is repeated in each skill. `upload_skills.py` packages each folder
with `files_from_dir` and attaches it to the matching specialist. Each `SKILL.md` needs `name` and
`description` frontmatter. Excerpt from `football-scout`:

```markdown
---
name: football-scout
description: How to find and report football matches, stadium tours and football bars for a trip.
---
1. Search the official league/club fixture pages for the exact trip dates.
2. Include matches within ~1.5 h travel of the destination; note the competition.
3. If kick-off time is unconfirmed, say "TBC" and add a warning.
4. If no matches: suggest a stadium tour or museum and a football bar showing games.
5. Never invent fixtures. Every match needs a source_url.
6. Output SpecialistResult JSON only (schema in README section 5).
```

---

## 7. Frontend guide

**Stack (default):** Vite + React + TypeScript (+ Tailwind if fast for you). Plain HTML + JS is fine too. The contract is all that matters.

```bash
npm create vite@latest frontend -- --template react-ts
cd frontend && npm i
echo "VITE_API_URL=http://localhost:8000" > .env
echo "VITE_USE_MOCK=true" >> .env
npm run dev
```

### Screens / components

1. **`TripForm`**: destination, start and end dates, interest checkboxes (sights / food / football), notes. On submit, `POST /api/plan` and open the event stream.
2. **`AgentProgress`** (the demo moment): one card per agent, with states `idle → working → done / error`. Show the latest `message`. Coordinator card on top, specialists in a row below, mirroring the diagram.
3. **`Itinerary`**: tabs or columns per day. Each item shows time, title, description, a category icon, the **agent badge**, price level and a source link. Highlights and warnings go in a side panel.
4. *(stretch)* "Download .docx" button → `/api/plan/{id}/docx`. A map of item locations.

### `api.ts` sketch

```ts
export async function startPlan(req: PlanRequest): Promise<string> {
  const r = await fetch(`${API}/api/plan`, { method: "POST",
    headers: { "Content-Type": "application/json" }, body: JSON.stringify(req) });
  return (await r.json()).plan_id;
}

export function streamPlan(id: string, onEvent: (e: SwarmEvent) => void) {
  const es = new EventSource(`${API}/api/plan/${id}/events`);
  es.onmessage = (m) => {
    const e = JSON.parse(m.data) as SwarmEvent;
    onEvent(e);
    if (e.type === "result" || e.type === "error") es.close();
  };
  return () => es.close();
}
```

In mock mode, replay events from a local array with `setTimeout`, then emit the `result` with `mock/plan.json`.

---

## 8. Work split & timeline (60 min)

| Time | Backend | Frontend |
|---|---|---|
| 0–5 | Everyone reads this README and agrees on sections 4–5. Create `shared/mock_plan.json` | same |
| 5–20 | **B1:** FastAPI routes + `MOCK=1` + SSE. **B2:** provision (6), get `run_trip.py` working end to end, check the football skill doesn't invent fixtures | **F1:** `TripForm` + `api.ts` (mock). **F2:** `Itinerary` rendering `mock/plan.json` |
| 20–35 | B2: tune prompts and skills (re-run per the 6.1 table). B1: call `run_swarm` from the routes via `asyncio.to_thread` (6.3) | F1: `AgentProgress` driven by mock events. F2: polish, agent badges, warnings panel |
| 35–45 | **Integration:** frontend switches to `VITE_USE_MOCK=false` against the real backend | same |
| 45–55 | Run 2–3 real destinations and tune prompts and skills (watch for invented fixtures). After a prompt change, update the agent; don't create a new one | Fix rendering edge cases (empty football, `null` times) |
| 55–60 | Demo prep. Keep a cached real result as a backup in case wifi or the API is slow | same |

**Cut order if behind:** docx → critic → extra specialists → SSE (fall back to polling `GET /api/plan/{id}`) → keep coordinator + 1 specialist.

---

## 9. Demo script (2 min)

1. "Plan 3 days in &lt;city with a home match that weekend&gt;, sights + food + football."
2. Show the agent cards lighting up **in parallel**. Explain that each one owns one job and one skill.
3. Show the itinerary. Point at the agent badges and how the coordinator scheduled the match first and built meals around it.
4. *(stretch)* Download the branded .docx.
5. Run a city with no match in the dates. The football agent says so instead of inventing one.

---

## 10. Conventions for Claude sessions

- This README is the source of truth. Don't change the API or data model without updating sections 4–5 here.
- Backend: Python, `uv`, Ruff, type hints, Pydantic models mirroring section 5. Managed Agents via the `anthropic` SDK's `client.beta.*` (agents, skills, environments, sessions, files). Don't switch to the Claude Agent SDK.
- Agents and skills are provisioned by the `setup/` scripts, never at request time. IDs live in `backend/.state/` and are gitignored.
- Frontend: TypeScript types in `types.ts` mirroring section 5. No backend logic in the UI.
- Scope is a POC: no auth, no database (an in-memory `dict[plan_id, state]` is fine), no deployment.
