"""Download every file a session wrote to /mnt/session/outputs/ (e.g. trip.docx).

Usage (from backend/):
    uv run python download_deliverable.py sesn_01ABC...
"""

import sys
import time
from pathlib import Path

from common import OUTPUT_DIR, client


def download_session_files(session_id: str, out_dir: Path = OUTPUT_DIR) -> list[Path]:
    c = client()
    files = []
    # Files show up in the list 1-3 s after the session goes idle.
    for _ in range(3):
        files = c.beta.files.list(
            scope_id=session_id, betas=["managed-agents-2026-04-01"]
        ).data
        if files:
            break
        time.sleep(2)

    out_dir.mkdir(exist_ok=True)
    saved = []
    for f in files:
        path = out_dir / f.filename
        c.beta.files.download(f.id).write_to_file(str(path))
        print(f"  {f.filename} -> {path}")
        saved.append(path)
    if not saved:
        print(f"No files on session {session_id}.")
    return saved


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("Usage: uv run python download_deliverable.py <session_id>")
    download_session_files(sys.argv[1].strip())
