"""CLI smoke test: run one trip through the swarm and print the events.

Usage (from backend/):
    uv run python run_trip.py "Valencia, Spain" 2026-11-20 2026-11-22
    uv run python run_trip.py "Valencia, Spain" 2026-11-20 2026-11-22 --interests food football --docx
"""

import argparse
import json
import uuid

from app.swarm import TripRequest, run_swarm
from common import OUTPUT_DIR
from download_deliverable import download_session_files


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("destination")
    p.add_argument("start_date")
    p.add_argument("end_date")
    p.add_argument("--interests", nargs="+", default=["sights", "food", "football"])
    p.add_argument("--notes")
    p.add_argument("--docx", action="store_true", help="also ask for trip.docx")
    args = p.parse_args()

    req = TripRequest(
        destination=args.destination,
        start_date=args.start_date,
        end_date=args.end_date,
        interests=args.interests,
        notes=args.notes,
        want_docx=args.docx,
    )
    plan_id = uuid.uuid4().hex[:6]

    def emit(event: dict) -> None:
        print(
            f"  [{event['type']:14s}] {event.get('agent', ''):12s} {event.get('message', '')}",
            flush=True,
        )

    print(f"=== Swarm events (plan {plan_id}) ===")
    result = run_swarm(req, plan_id, emit)

    OUTPUT_DIR.mkdir(exist_ok=True)
    if result.plan is not None:
        out = OUTPUT_DIR / "trip-plan.json"
        out.write_text(json.dumps(result.plan, indent=2, ensure_ascii=False))
        print(f"\nTripPlan saved to {out}")
    else:
        out = OUTPUT_DIR / "coordinator-raw.txt"
        out.write_text(result.raw_text)
        print(f"\nNo valid TripPlan JSON. Raw coordinator output saved to {out}")
    for w in result.warnings:
        print(f"  warning: {w}")

    if args.docx:
        download_session_files(result.session_id)
    print(f"\nSession trace: https://platform.claude.com/sessions/{result.session_id}")


if __name__ == "__main__":
    main()
