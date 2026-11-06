"""Create (or update) the coordinator and its specialist roster.

Run AFTER create_specialists.py and upload_skills.py: a roster entry pins the specialist's
latest version at the moment the coordinator is saved. Re-run this whenever a specialist
changes, so the roster picks up its new version.

If .state/critic_id exists (stretch_critic_subagent.py), the critic joins the roster.

Usage (from backend/):
    uv run python -m setup.create_coordinator
"""

import anthropic

from common import (
    COORDINATOR_MODEL,
    COORDINATOR_NAME,
    METADATA,
    client,
    read_json_state,
    read_state,
    write_state,
)

COORDINATOR_SYSTEM = """\
You are the Wanderswarm travel coordinator. A traveller gives you a destination, dates,
interests and notes. You turn that into one realistic day-by-day TripPlan.

# Delegation
- Never research yourself. Specialists do all research.
- Use ONLY the specialists the user message names. Brief all of them in the same turn so
  they run in parallel.
- Each specialist sees none of your conversation. Every brief must carry: destination,
  exact start and end dates, the traveller's notes, and "reply with SpecialistResult JSON only".
- Start a workflow run only for trips longer than 7 days or covering several cities.
  For a normal trip, brief the specialists directly.

# Merging
- Fixed times first (football matches), then meals around midday and evening, then
  sights to fill the gaps. At most 5 items a day, grouped by neighbourhood.
- Keep each item's `agent` set to the specialist that found it.
- Never invent items the specialists did not return.

# Highlights and warnings (the traveller reads these at a glance)
- `summary`: at most 2 sentences.
- `highlights`: at most 3 per agent, each under 20 words.
- `warnings`: at most 5, most important first, each one sentence under 25 words.
  Keep only what could change the traveller's plans (unconfirmed fixtures, closures,
  bookings needed). Merge duplicates. Drop generic caveats such as "prices are estimates".
  Put detail in the item's `description`, not in warnings.

# Output
Your final message is ONLY the TripPlan JSON: no prose, no code fences. Shape:
{"plan_id", "destination", "start_date", "end_date", "summary", "agents_used",
 "days": [{"date", "title", "items": [{"time" ("HH:MM" or null), "duration_min", "title",
 "description", "category" ("sights"|"food"|"football"|"other"), "agent", "location",
 "price_level" ("€"|"€€"|"€€€"|null), "source_url"}]}],
 "highlights": {"<agent>": ["..."]}, "warnings": ["..."]}

If the user message asks for a Word document, also write it with the docx skill to
/mnt/session/outputs/trip.docx before your final message.
"""

CRITIC_SECTION = """
# Critic
Before your final message, send the draft TripPlan to the Itinerary Critic.
- SHIP IT: return the plan.
- REVISE: fix the listed issues and send it again, at most twice.
"""


def main() -> None:
    specialist_ids = read_json_state("specialist_ids.json")
    if not specialist_ids:
        raise SystemExit("Run setup.create_specialists and setup.upload_skills first.")

    roster_ids = list(specialist_ids.values())
    system = COORDINATOR_SYSTEM
    critic_id = read_state("critic_id")
    if critic_id:
        roster_ids.append(critic_id)
        system += CRITIC_SECTION

    roster = [{"type": "agent", "id": agent_id} for agent_id in roster_ids]
    fields = {
        "name": COORDINATOR_NAME,
        "model": COORDINATOR_MODEL,
        "system": system,
        "tools": [
            {
                "type": "agent_toolset_20260401",
                "default_config": {
                    "enabled": True,
                    "permission_policy": {"type": "auto"},
                },
                # The coordinator delegates research; it only needs files (for the docx).
                "configs": [
                    {"name": "web_search", "enabled": False},
                    {"name": "web_fetch", "enabled": False},
                ],
            }
        ],
        "skills": [{"type": "anthropic", "skill_id": "docx"}],
        "metadata": {**METADATA, "role": "coordinator"},
    }
    multiagent = {
        "type": "multiagent_20261001",
        "subagents": {
            "type": "enabled",
            "predefined_agents": roster,
            "inline_agents": {"type": "disabled"},
        },
        "workflows": {
            "type": "enabled",
            "predefined_agents": roster,
            "inline_agents": {"type": "disabled"},
        },
    }
    # Older orgs only accept the `coordinator` type (no workflows).
    legacy_multiagent = {"type": "coordinator", "agents": roster}

    c = client()
    coordinator_id = read_state("coordinator_id")

    def save(ma: dict):
        if coordinator_id:
            current = c.beta.agents.retrieve(coordinator_id)
            return c.beta.agents.update(
                coordinator_id, version=current.version, multiagent=ma, **fields
            )
        return c.beta.agents.create(multiagent=ma, **fields)

    try:
        coordinator = save(multiagent)
    except anthropic.BadRequestError as e:
        if "multiagent" not in str(e):
            raise
        print(
            f"multiagent_20261001 rejected ({e.message}); falling back to the `coordinator` type."
        )
        coordinator = save(legacy_multiagent)

    write_state("coordinator_id", coordinator.id)
    verb = "Updated" if coordinator_id else "Created"
    print(f"{verb} coordinator: {coordinator.id} (v{coordinator.version})")
    print(f"Roster: {list(specialist_ids)}{' + critic' if critic_id else ''}")
    print('\nNext: uv run python run_trip.py "Valencia, Spain" 2026-11-20 2026-11-22')


if __name__ == "__main__":
    main()
