"""Create (or update) the specialist sub-agents: sights, food, football.

Each specialist gets a narrow system prompt, the agent toolset with web search/fetch on,
and (via upload_skills.py) its own skill. IDs go to .state/specialist_ids.json.

Re-running updates the existing agents in place (new version, same ID), so you can tune
prompts without creating duplicates. After a change, re-run create_coordinator.py so
the coordinator's roster picks up the new versions.

Usage (from backend/):
    uv run python -m setup.create_specialists
"""

from common import (
    METADATA,
    SPECIALIST_MODEL,
    SPECIALIST_NAMES,
    client,
    read_json_state,
    write_json_state,
)

COMMON_RULES = """
# Rules
- Follow your skill. It has the research steps and the exact output format.
- Stay in your lane. Anything outside it belongs to another specialist.
- Every factual item needs a source_url where possible. A missing fact beats an invented one.
- Your final reply to the coordinator is SpecialistResult JSON only: no prose, no code fences.
"""

SPECIALISTS = {
    "sights": {
        "description": "Finds must-see attractions, viewpoints and neighbourhoods for a destination and date range, with opening hours.",
        "system": (
            "You are the Sights Scout in a travel-planning swarm. You own attractions, "
            "viewpoints, museums and neighbourhoods worth walking, including opening hours "
            "on the trip dates. You do NOT plan meals or football.\n" + COMMON_RULES
        ),
    },
    "food": {
        "description": "Finds local dishes to try and 1-2 real restaurants or bars per day, with price level.",
        "system": (
            "You are the Food Scout in a travel-planning swarm. You own local dishes to try "
            "and 1-2 real restaurants or bars per trip day, with rough price level. "
            "You never invent restaurants. You do NOT plan sights or football.\n"
            + COMMON_RULES
        ),
    },
    "football": {
        "description": "Finds football matches within the trip dates, stadium tours and football bars. Never invents fixtures.",
        "system": (
            "You are the Football Scout in a travel-planning swarm. You own football matches in "
            "or near the destination WITHIN the trip dates, stadium tours and football bars. "
            "You never invent fixtures: if there is no match, return no match items and say so "
            "in highlights.\n" + COMMON_RULES
        ),
    },
}

TOOLS = [
    {
        "type": "agent_toolset_20260401",
        # auto: the server approves routine calls; app/swarm.py denies anything that pauses.
        "default_config": {"enabled": True, "permission_policy": {"type": "auto"}},
    }
]


def main() -> None:
    c = client()
    ids = read_json_state("specialist_ids.json")

    for key, spec in SPECIALISTS.items():
        fields = {
            "name": SPECIALIST_NAMES[key],
            "description": spec["description"],
            "model": SPECIALIST_MODEL,
            "system": spec["system"],
            "tools": TOOLS,
            "metadata": {**METADATA, "role": key},
        }
        if key in ids:
            current = c.beta.agents.retrieve(ids[key])
            agent = c.beta.agents.update(ids[key], version=current.version, **fields)
            print(f"  Updated {fields['name']:16s} -> {agent.id} (v{agent.version})")
        else:
            agent = c.beta.agents.create(**fields)
            ids[key] = agent.id
            print(f"  Created {fields['name']:16s} -> {agent.id}")

    write_json_state("specialist_ids.json", ids)
    print(f"\nSaved {len(ids)} specialist IDs to .state/specialist_ids.json")
    print("Next: uv run python -m setup.upload_skills")


if __name__ == "__main__":
    main()
