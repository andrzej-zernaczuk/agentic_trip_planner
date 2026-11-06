"""Upload each skill in skills/ and attach it to the matching specialist.

Re-runnable: an existing skill (matched by display name) gets a new version instead of a
duplicate, and a skill already attached to an agent is not attached twice. Attached
skills use version "latest", so editing a SKILL.md and re-running this is enough.

Usage (from backend/):
    uv run python -m setup.upload_skills
"""

from anthropic.lib import files_from_dir

from common import SKILLS_DIR, client, read_json_state, write_json_state

SKILL_TO_SPECIALIST = {
    "sights-scout": "sights",
    "food-scout": "food",
    "football-scout": "football",
}


def main() -> None:
    specialist_ids = read_json_state("specialist_ids.json")
    if not specialist_ids:
        raise SystemExit("Run setup.create_specialists first.")

    c = client()
    existing = {s.display_name: s.id for s in c.skills.list(source="custom")}
    uploaded: dict[str, str] = {}

    for skill_name, specialist_key in SKILL_TO_SPECIALIST.items():
        skill_dir = SKILLS_DIR / skill_name
        if not (skill_dir / "SKILL.md").exists():
            print(f"  Skipping {skill_name}: no SKILL.md")
            continue
        if specialist_key not in specialist_ids:
            print(f"  Skipping {skill_name}: no `{specialist_key}` specialist")
            continue

        display_name = skill_name.replace("-", " ").title()
        files = files_from_dir(str(skill_dir))
        if display_name in existing:
            skill_id = existing[display_name]
            c.skills.versions.create(skill_id, files=files)
            print(f"New version of {skill_name} ({skill_id})")
        else:
            skill_id = c.skills.create(display_name=display_name, files=files).id
            print(f"Uploaded {skill_name} -> {skill_id}")
        uploaded[skill_name] = skill_id

        agent_id = specialist_ids[specialist_key]
        current = c.beta.agents.retrieve(agent_id)
        current_skills = [
            s.model_dump(exclude_none=True) for s in (current.skills or [])
        ]
        if any(s.get("skill_id") == skill_id for s in current_skills):
            print(f"  already attached to `{specialist_key}`")
            continue
        c.beta.agents.update(
            agent_id,
            version=current.version,
            skills=current_skills
            + [{"type": "custom", "skill_id": skill_id, "version": "latest"}],
        )
        print(f"  attached to `{specialist_key}` ({agent_id})")

    write_json_state("skill_ids.json", uploaded)
    print(f"\n{len(uploaded)} skills uploaded and attached.")
    print("Next: uv run python -m setup.create_coordinator")


if __name__ == "__main__":
    main()
