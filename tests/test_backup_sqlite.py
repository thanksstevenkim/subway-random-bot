"""Offline validation of SQLite snapshots; never accesses production or R2."""
import importlib.util
import sqlite3
import tempfile
import unittest
from pathlib import Path

SRC = Path(__file__).resolve().parents[1] / 'deploy' / 'backup_sqlite.py'
SPEC = importlib.util.spec_from_file_location('backup_sqlite', SRC)
mod = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(mod)


class BackupSqliteTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.dbdir = self.root / 'live'
        self.dbdir.mkdir()
        self.live = sqlite3.connect(self.dbdir / 'federation.sqlite')
        self.addCleanup(self.live.close)
        self.live.execute('CREATE TABLE actor_keys (keyid TEXT NOT NULL)')
        self.live.execute('INSERT INTO actor_keys VALUES (?)', ('permanent-account-key',))
        self.live.commit()
        (self.dbdir / 'queue.sqlite').touch()  # Real bot can have an unused 0-byte queue DB.
        rate = sqlite3.connect(self.dbdir / 'rate-limit.sqlite')
        rate.execute('CREATE TABLE accepted_mentions (message_id TEXT)')
        rate.execute('INSERT INTO accepted_mentions VALUES (?)', ('123',))
        rate.commit()
        rate.close()

    def test_hot_database_consistent_and_no_source_mutation(self):
        # Running source connection remains open throughout backup.
        origin = {name: (self.dbdir / name).read_bytes() for name in mod.DB_NAMES}
        target = self.root / 'snap'
        mod.snapshot(self.dbdir, target)
        for name in mod.DB_NAMES:
            self.assertEqual((self.dbdir / name).read_bytes(), origin[name])
            with sqlite3.connect(target / name) as db:
                self.assertEqual(db.execute('PRAGMA integrity_check').fetchone()[0], 'ok')
            self.assertEqual((target / name).stat().st_mode & 0o777, 0o600)
        with sqlite3.connect(target / 'federation.sqlite') as db:
            self.assertEqual(db.execute('SELECT keyid FROM actor_keys').fetchone(), ('permanent-account-key',))
        self.assertGreater((target / 'queue.sqlite').stat().st_size, 0)
        self.assertEqual((self.dbdir / 'queue.sqlite').stat().st_size, 0)

    def test_missing_file_fails_closed(self):
        (self.dbdir / 'rate-limit.sqlite').unlink()
        with self.assertRaisesRegex(ValueError, 'Required SQLite file missing'):
            mod.snapshot(self.dbdir, self.root / 'snap')

    def test_invalid_empty_identity_db_fails_closed(self):
        self.live.close()
        (self.dbdir / 'federation.sqlite').unlink()
        (self.dbdir / 'federation.sqlite').touch()
        with self.assertRaisesRegex(ValueError, 'no tables'):
            mod.snapshot(self.dbdir, self.root / 'snap')

    def test_symlink_source_file_fails_closed(self):
        (self.dbdir / 'rate-limit.sqlite').unlink()
        (self.dbdir / 'rate-limit.sqlite').symlink_to(self.dbdir / 'federation.sqlite')
        with self.assertRaisesRegex(ValueError, 'symlinked'):
            mod.snapshot(self.dbdir, self.root / 'snap')

    def test_existing_destination_fails_closed(self):
        target = self.root / 'snap'
        target.mkdir()
        with self.assertRaisesRegex(ValueError, 'must not exist'):
            mod.snapshot(self.dbdir, target)


if __name__ == '__main__':
    unittest.main()
