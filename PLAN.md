# Heist Crew — Backend Plan (Person A, `server/`)

## Context

The repo root holds a leftover hackathon skeleton ("Deal Desk" specialist swarm on **Claude Managed Agents**: `create_specialists.py`, `create_coordinator.py`, `setup_environment.py`, `run_deal_desk.py`, skills, synthetic RFP data). We keep its Managed Agents architecture and code patterns, strip the Deal Desk use case, and rebuild it as the Heist Crew backend described in `README.md`: FastAPI + SSE, in-memory state, Game Master as **coordinator**, four crew members as **sub-agents**, dice and traitor logic in Python. `CONTRACT.md` does not exist yet — the backend drafts it so Person B can build against it.

## Architecture

```
web (EventSource) ──SSE──> server/main.py (FastAPI)
                               │
                        server/orchestrator.py   ← drives phases, rolls dice, owns state
                               │  one Managed Agents session per game
                               ▼
                 Game Master (coordinator agent, stronger model)
                    ├── Mastermind ─┐
                    ├── Hacker      │ sub-agents (fast model),
                    ├── Charmer     │ each replies {"public","private"[,"sabotage"]}
                    └── Muscle     ─┘
```

**Control rule:** the orchestrator, not the Game Master, decides phase order. For each phase it sends the GM session one `user.message` ("Phase: planning round 1 — ask Mastermind for a plan, then collect critiques, return JSON …"). Dice results are computed in Python *before* the execution message and injected into it, so the GM narrates the outcome rather than deciding it. The GM knows the traitor and passes the secret brief **only** in its delegation to that crew member's thread.

## Files

### Delete (old use case)
`create_specialists.py`, `create_coordinator.py`, `upload_skills.py`, `run_deal_desk.py`, `download_deliverable.py`, `stretch_critic_subagent.py`, `README_specialist_swarm.md`, `scenario-cards.md`, `stretch-goals.md`, `skills/`, `synthetic-data/`. (Root-level files: give Person B a heads-up first.)

### Move and adapt (reuse)
| New file | From | Changes |
|---|---|---|
| `server/setup_environment.py` | `setup_environment.py` | rename env to `heist-crew-env`, write ID to `server/.state/environment_id`, load `.env` via `python-dotenv` |
| `server/create_agents.py` | `create_specialists.py` + `create_coordinator.py` | `SPECIALISTS` → `CREW` (4 roles + voices from README); GM created with `multiagent={"type":"coordinator", ...}` listing crew IDs; save `server/.state/agent_ids.json`; idempotent (reuse IDs if file exists) |
| `server/orchestrator.py` (event loop) | `run_deal_desk.py` streaming loop | map `agent.thread_message_received` / `agent.message` / `session.status_idle` to contract events instead of printing |

Models: GM `claude-sonnet-5-5` (or `claude-opus-5-5` if latency is fine), crew `claude-haiku-5-5`. Drop the agent toolset for crew if the API allows (no file/web tools needed → faster).

### New
- **`server/prompts.py`** — crew system prompts (role, voice, "2–3 sentences", "reply ONLY with JSON `{public, private}`"); GM system prompt (movie-trailer voice, phase protocol, return JSON per phase, never reveal traitor); `traitor_brief(motive)` text ("sabotage subtly, at most 1–2 stages, stay cooperative in public, add `"sabotage": true|false` during execution"); per-phase message templates.
- **`server/game.py`** — `Game` dataclass (id, target, traitor, motive, obstacles, loot, heat, log of `{agent, phase, public, private}`, votes); `pick_traitor()` (random crew member + motive from a short list); `roll_stage(stage, assignee, sabotaged)` → d20 + 3 if assignee's specialty matches obstacle, −5 if sabotaged, vs DC 12; success adds loot, failure adds heat; failed escape = "busted" ending.
- **`server/orchestrator.py`** — `async def run_game(game) -> AsyncIterator[dict]`: setup → scenario → planning ×2 → execution ×3 → vote_open → reveal → result_card. Parses agent JSON defensively (fallback: whole text as `public`). Appends every event to `game.events` and to `server/recordings/<game_id>.jsonl`.
- **`server/main.py`** — FastAPI app, CORS `*`:
  - `POST /games {target}` → `{game_id}` (starts orchestrator task)
  - `GET /games/{id}/stream` → SSE (replays past events, then live)
  - `POST /games/{id}/vote {suspect}` → tallies
  - `GET /replay/{name}` → SSE replay of a recording (demo fallback)
  - Run: `uv run uvicorn server.main:app --reload --port 8000`
- **`CONTRACT.md`** (shared, draft then agree with Person B) — event types:
  `game_started{game_id,target,crew}`, `scenario{obstacles[3],loot}`, `speech{agent,phase,round,text}`, `stage_result{stage,obstacle,assignee,roll,modifier,dc,success,narration,heat,loot}`, `vote_open{}`, `reveal{traitor,motive,sabotaged_stages,log:[{agent,phase,public,private}]}`, `result_card{title,outcome,loot,heat,traitor,votes}`, `done{}`, `error{message}`. SSE `event:` = type, `data:` = JSON.
- **`.env.example`** (`ANTHROPIC_API_KEY=`) and `.gitignore` additions: `server/.state/`, `outputs/`.

## Timeline (README's 55 min)

| Min | Task | Commit |
|---|---|---|
| 0–5 | Write `CONTRACT.md` with B; delete old files; move setup script | `server: remove deal desk, add contract` |
| 5–12 | `prompts.py`, `create_agents.py`; run setup + create agents once | `server: create heist agents` |
| 12–18 | `game.py` (traitor, dice) + quick unit check in a REPL | `server: dice and traitor` |
| 18–25 | `orchestrator.py` + `main.py`; one full heist via curl | `server: orchestrator + SSE` |
| 25–35 | Integrate with B's UI, fix contract mismatches | `server: contract fixes` |
| 35–48 | Tune prompts (subtle traitor, distinct voices); record a good run to `server/recordings/`, hand to B for `demo/` | `server: prompt tuning, recording` |
| 48–55 | No new features. 2–3 test heists, rehearse | — |

**Cut order:** votes endpoint → result_card extras. Never cut reveal or the recording.

## Risks & fallbacks
- **Coordinator ignores phase protocol / slow:** fall back to the orchestrator opening one Managed Agents session per crew agent and messaging them directly (same agents, same prompts, more control). Decide by minute 20.
- **Traitor brief leaks to others:** GM prompt forbids it; verify by grepping other agents' threads in a test run.
- **Bad JSON from agents:** defensive parse, never crash the stream.
- **API flaky on stage:** `/replay/<recording>`.
- **Multi-agent beta access missing on workspace:** check at minute 5 by running `create_agents.py`; if denied, use the per-agent-session fallback immediately.

## Verification
1. `uv run python server/setup_environment.py && uv run python server/create_agents.py` → IDs saved.
2. `uv run uvicorn server.main:app --port 8000`
3. `curl -X POST localhost:8000/games -H 'content-type: application/json' -d '{"target":"rob the office snack drawer"}'`
4. `curl -N localhost:8000/games/<id>/stream` → see every contract event in order, ending with `reveal` containing private thoughts and `done`.
5. `curl -N localhost:8000/replay/<recording>` replays the saved run.
6. Run 2–3 heists: traitor varies, at least one sabotaged stage shows in `reveal`, no crash on malformed agent output.
