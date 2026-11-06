"""Create the cloud environment the Wanderswarm sessions run in.

Safe to re-run: reuses .state/environment_id if it exists.

Usage (from backend/):
    uv run python -m setup.setup_environment
"""

from common import client, read_state, write_state


def main() -> None:
    existing = read_state("environment_id")
    if existing:
        print(f"Environment already exists: {existing}")
        print("(delete .state/environment_id to provision a new one)")
        return

    environment = client().beta.environments.create(
        name="wanderswarm-env",
        # Specialists research on the open web.
        config={"type": "cloud", "networking": {"type": "unrestricted"}},
    )
    write_state("environment_id", environment.id)
    print(f"Environment created: {environment.id}")
    print("Next: uv run python -m setup.create_specialists")


if __name__ == "__main__":
    main()
