#!/usr/bin/env python3
"""Create verified online SQLite snapshots without mutating the source files."""
from __future__ import annotations

import sqlite3
import sys
from pathlib import Path

DB_NAMES = ("federation.sqlite", "queue.sqlite", "rate-limit.sqlite")


def snapshot(source_dir: Path, destination_dir: Path) -> None:
    if not source_dir.is_dir() or source_dir.is_symlink():
        raise ValueError("Source directory missing or symlinked")
    if destination_dir.exists():
        raise ValueError("Snapshot destination must not exist")
    destination_dir.mkdir(mode=0o700)
    for name in DB_NAMES:
        src = source_dir / name
        dst = destination_dir / name
        if not src.is_file() or src.is_symlink():
            raise ValueError(f"Required SQLite file missing or symlinked: {name}")

        # URI mode=ro prevents accidental creation or mutation of the source DB.
        live = sqlite3.connect(src.resolve(strict=True).as_uri() + "?mode=ro", uri=True, timeout=15)
        try:
            # Distinguish the irreplaceable identity DB from an empty, valid queue DB.
            if name == "federation.sqlite":
                count = live.execute("SELECT COUNT(*) FROM sqlite_master WHERE type='table'").fetchone()[0]
                if count < 1:
                    raise ValueError("Federation database has no tables; refusing empty identity backup")

            copy = sqlite3.connect(dst, timeout=15)
            try:
                live.backup(copy, pages=128, sleep=0.2)
                result = copy.execute("PRAGMA integrity_check").fetchone()
                if result != ("ok",):
                    raise ValueError(f"Integrity check failed for {name}: {result!r}")
            finally:
                copy.close()
            dst.chmod(0o600)
            print(f"SNAPSHOT_OK {name} bytes={dst.stat().st_size}")
        finally:
            live.close()


def main() -> int:
    if len(sys.argv) != 3:
        print("Usage: backup_sqlite.py SOURCE_DIRECTORY NEW_SNAPSHOT_DIRECTORY", file=sys.stderr)
        return 2
    try:
        snapshot(Path(sys.argv[1]), Path(sys.argv[2]))
        return 0
    except (OSError, ValueError, sqlite3.Error) as exc:
        print(f"SNAPSHOT_FAILED: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
