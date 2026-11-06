"""Stretch: add an Itinerary Critic to the coordinator's roster.

Creates (or updates) the critic, saves .state/critic_id, then re-saves the coordinator,
which adds the critic to its roster and its system prompt.

Usage (from backend/):
    uv run python -m setup.stretch_critic_subagent
"""

from common import (
    CRITIC_NAME,
    METADATA,
    SPECIALIST_MODEL,
    client,
    read_state,
    write_state,
)
from setup import create_coordinator

CRITIC_SYSTEM = """\
You are the Itinerary Critic. You don't write plans; you review them.

You receive a draft TripPlan JSON. Check:
1. Time clashes, or items that don't fit their duration in the day.
2. More than 5 items on any day.
3. Football fixtures or restaurants with no source_url (possible inventions).
4. Items outside the trip dates.
5. Days zig-zagging across the city instead of grouping by neighbourhood.

Lead with VERDICT: SHIP IT or VERDICT: REVISE. For REVISE, list at most 5 concrete
fixes. Be sceptical: your value is the pushback.
"""


def main() -> None:
    c = client()
    fields = {
        "name": CRITIC_NAME,
        "description": "Reviews a draft TripPlan for clashes, overload and invented items. Replies SHIP IT or REVISE.",
        "model": SPECIALIST_MODEL,
        "system": CRITIC_SYSTEM,
        "tools": [
            {
                "type": "agent_toolset_20260401",
                "default_config": {
                    "enabled": True,
                    "permission_policy": {"type": "auto"},
                },
            }
        ],
        "metadata": {**METADATA, "role": "critic"},
    }
    critic_id = read_state("critic_id")
    if critic_id:
        current = c.beta.agents.retrieve(critic_id)
        c.beta.agents.update(critic_id, version=current.version, **fields)
        print(f"Critic updated: {critic_id}")
    else:
        critic_id = c.beta.agents.create(**fields).id
        write_state("critic_id", critic_id)
        print(f"Critic created: {critic_id}")

    create_coordinator.main()


if __name__ == "__main__":
    main()
