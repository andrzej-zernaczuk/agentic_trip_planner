# Heist Crew

A hackathon project: you type a target ("rob the office snack drawer"), four AI crew members plan and run the heist, and **one of them is secretly the traitor**. The audience votes on who the rat is before the reveal.

**Time budget:** about 55 minutes total. Speed beats polish. Cut features before cutting the demo.

---

## For AI agents reading this file

You are helping **two humans** build this project in parallel, each on their own laptop with their own AI session.

- **Person A** owns `server/` (backend, agents, prompts, game logic).
- **Person B** owns `web/` (frontend, demo script).
- **Do not edit files outside your person's folder** without being asked. If you need a change in the other folder, say so and let the human tell their teammate.
- `CONTRACT.md` is the single source of truth for the API and event format. Build to it. If it must change, tell the human first so both sides update together.
- Keep code simple and working. Prefer one small working slice over a big unfinished design.
- Do not add dependencies, frameworks, or build steps unless they save time. No database. No auth.
- After each working change, **commit it** with a short message (see Git workflow). Do not batch up large uncommitted changes.

---

## The game in one minute

1. User enters a target.
2. The **Game Master** builds the scenario: 3 security obstacles, some loot, and secretly picks the traitor and their motive.
3. **Planning:** the Mastermind proposes a plan, the others critique it (2 rounds).
4. **Execution:** 3 stages (entry, objective, escape). Each stage rolls dice **in code**. The traitor's sabotage applies a penalty. The Game Master narrates the outcome.
5. **Reveal:** the traitor is exposed, their private thoughts are shown next to what they said out loud, and a shareable result card appears.

## The crew (5 agents)

| Agent | Role | Voice |
|---|---|---|
| Mastermind | Plans, assigns jobs | Overconfident, loves codenames |
| Hacker | Tech and security obstacles | Jargon, a little smug |
| Charmer | Distractions, social engineering | Smooth, flatters everyone |
| Muscle | Physical obstacles, escape | Blunt, three words per sentence |
| Game Master | Scenario, narration, resolving stages | Movie-trailer voice |

The traitor is **not** a sixth agent. One crew member is randomly flagged at game start and gets a secret extra brief. The other agents never see it. The Game Master knows who it is.

Each agent returns JSON: `{ "public": "what they say out loud", "private": "what they really think" }`. Only `public` goes into the shared log. `private` is stored and shown at the reveal.

Keep speeches to 2 to 3 sentences.

---

## Suggested stack (change it if you prefer)

- **Backend:** Python + FastAPI, Server-Sent Events for streaming. In-memory game state.
- **Frontend:** a single `index.html` with plain JS and `EventSource`. No build step.
- **Models:** a fast, cheap model for the crew and a stronger one for the Game Master.
- **Secrets:** API key in a `.env` file, never committed.

## Repo layout

```
heist-crew/
  README.md        this file
  CONTRACT.md      API and event format (shared, edit together)
  server/          Person A
  web/             Person B
  demo/            recorded fallback run + demo script (Person B)
  .env.example     placeholder for the API key
```

---

## Team and ownership

| | Person A | Person B |
|---|---|---|
| Owns | `server/` | `web/`, `demo/` |
| Builds | Orchestrator, dice, agent calls, prompts, traitor logic | Cards, speech bubbles, heat/loot meters, vote buttons, reveal screen |
| Tests with | `curl` / a terminal script | A fake event stream from the contract |

Person B builds against a **fake stream** that replays hard-coded events from `CONTRACT.md`. When Person A's server is ready, B switches the URL.

---

## Git workflow

- One repo, work on `main`. Because you edit separate folders, conflicts should be rare.
- **Commit after every working change**, even small ones. Example messages: `server: add dice roll`, `web: reveal screen`.
- **Pull before you push**: `git pull --rebase`, then `git push`.
- If you hit a conflict, ask a human before resolving it.
- Never commit `.env`.

---

## Timeline (55 min)

| Minutes | What |
|---|---|
| 0 to 5 | Fill in `CONTRACT.md` together, create the repo |
| 5 to 25 | A: orchestrator and agents. B: UI on the fake stream |
| 25 to 35 | Integrate, fix mismatches |
| 35 to 48 | A: tune prompts, make the traitor subtle. B: reveal animation, polish |
| 48 to 55 | Test 2 or 3 full heists, pick the demo case, rehearse. **No new features.** |

**Cut order if behind at minute 35:** audience voting first, then extra polish. Keep the reveal.

## Risks and fallbacks

- **Live API slow or flaky:** keep a recorded good run in `demo/` and replay it on stage.
- **Traitor too obvious:** tell the traitor to sabotage only occasionally and stay cooperative in public speech.
- **Crew all sound alike:** strengthen the voice lines in the prompts.
- **Slow turns:** run the planning critiques in parallel.

## Definition of done

- A full heist runs end to end from a typed target to the reveal.
- The reveal shows the traitor's private thoughts.
- A recorded fallback run exists.
- Both people have pushed their last commits.
