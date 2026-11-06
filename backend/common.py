"""Shared helpers for the setup scripts, run_trip.py and the FastAPI app.

Every script runs from backend/ (`uv run python -m setup.<name>`), so `import common` works.
Generated IDs live in backend/.state/ (gitignored).
"""

import json
from pathlib import Path

from anthropic import Anthropic
from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parent
STATE_DIR = BACKEND_DIR / ".state"
SKILLS_DIR = BACKEND_DIR / "skills"
OUTPUT_DIR = BACKEND_DIR / "outputs"

load_dotenv(BACKEND_DIR.parent / ".env")
load_dotenv(BACKEND_DIR / ".env")

COORDINATOR_MODEL = "claude-opus-5-5"
SPECIALIST_MODEL = "claude-sonnet-5-5"

# Role key -> agent name. The names are what session events report (`agent_name`),
# so app/swarm.py maps events back to role keys with this table.
SPECIALIST_NAMES = {
    "sights": "Sights Scout",
    "food": "Food Scout",
    "football": "Football Scout",
}
CRITIC_NAME = "Itinerary Critic"
COORDINATOR_NAME = "Wanderswarm Coordinator"
AGENT_KEYS = {name: key for key, name in SPECIALIST_NAMES.items()} | {
    CRITIC_NAME: "critic",
    COORDINATOR_NAME: "coordinator",
}

METADATA = {"hackathon": "partner-basecamp-2026", "track": "wanderswarm"}


def client() -> Anthropic:
    # Credentials: ANTHROPIC_API_KEY from .env, or an `ant auth login` profile.
    # The SDK sets the managed-agents beta header on client.beta.{agents,sessions,environments}.*
    return Anthropic()


def read_state(name: str) -> str | None:
    path = STATE_DIR / name
    return path.read_text().strip() if path.exists() else None


def write_state(name: str, value: str) -> None:
    STATE_DIR.mkdir(exist_ok=True)
    (STATE_DIR / name).write_text(value)


def read_json_state(name: str) -> dict:
    raw = read_state(name)
    return json.loads(raw) if raw else {}


def write_json_state(name: str, value: dict) -> None:
    write_state(name, json.dumps(value, indent=2))


def require_state(name: str, hint: str) -> str:
    value = read_state(name)
    if not value:
        raise SystemExit(f"Missing .state/{name}. Run {hint} first.")
    return value
