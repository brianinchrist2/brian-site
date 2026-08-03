# Migration Notes (D1 / SQLite)

## Destructive migrations require `PRAGMA foreign_keys = OFF`

D1 (SQLite) cannot `ALTER TABLE` to drop columns or change constraints. Table
rebuilds (`CREATE _new` → `INSERT ... SELECT` → `DROP` → `RENAME`) are the only
way. During the rebuild, referenced tables' FK checks can reject the `DROP` or
mid-state writes; run destructive migrations with foreign keys disabled:

```sql
PRAGMA foreign_keys = OFF;          -- applies to the current connection
-- ... rebuild: CREATE TABLE _x_new ...; INSERT INTO _x_new SELECT ...; DROP TABLE IF EXISTS x; ALTER TABLE _x_new RENAME TO x;
PRAGMA foreign_keys = ON;
```

`PRAGMA foreign_keys` is per-connection — put it in the migration file itself so
the same connection that executes the rebuild is covered. In a transaction, the
pragma cannot be toggled; keep destructive sections outside explicit
transactions.

## Conventions

- **Backup before applying** (especially data migrations):
  `wrangler d1 export <DB> --output backup-<date>.sql`
- **Idempotency**: every `DROP TABLE` uses `DROP TABLE IF EXISTS`; every
  (re)created table uses `CREATE TABLE IF NOT EXISTS`. Data-migration
  `UPDATE`s guard with `WHERE ... <> ''` and conditions that make re-runs
  no-ops.
- **Rebuild pattern** (from 011/012/013): `_<table>_new` staging table → copy
  data → `DROP TABLE IF EXISTS` → `ALTER TABLE ... RENAME TO`. Preserve column
  definitions and defaults exactly.
- **FK policy**: column-level FKs default to `NO ACTION` unless an
  `ON DELETE` clause is given. Changing a NOT NULL FK to `ON DELETE SET NULL`
  requires making the column nullable — i.e., another table rebuild. See
  `.memory/decisions/` for the 014 FK assessment.
- **Timestamps**: canonical format is ISO 8601 (`2026-08-01T12:00:00.000Z`).
  `datetime('now')` defaults produce space-format values; migration 014 unifies
  legacy rows. New columns must default to ISO, not `datetime('now')`.
