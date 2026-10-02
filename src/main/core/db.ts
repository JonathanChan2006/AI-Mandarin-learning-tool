import Database from 'better-sqlite3'

export type Db = Database.Database

/**
 * One entry per schema version. `PRAGMA user_version` records how many have run,
 * so adding a migration means appending a string here.
 */
const MIGRATIONS: readonly string[] = [
  `
  CREATE TABLE items (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    type           TEXT    NOT NULL DEFAULT 'vocab',
    hanzi          TEXT    NOT NULL,
    pinyin         TEXT    NOT NULL DEFAULT '',
    gloss          TEXT    NOT NULL DEFAULT '',
    example        TEXT    NOT NULL DEFAULT '',
    tags           TEXT    NOT NULL DEFAULT '',
    extra          TEXT    NOT NULL DEFAULT '{}',
    due            INTEGER NOT NULL,
    stability      REAL    NOT NULL DEFAULT 0,
    difficulty     REAL    NOT NULL DEFAULT 0,
    elapsed_days   INTEGER NOT NULL DEFAULT 0,
    scheduled_days INTEGER NOT NULL DEFAULT 0,
    learning_steps INTEGER NOT NULL DEFAULT 0,
    reps           INTEGER NOT NULL DEFAULT 0,
    lapses         INTEGER NOT NULL DEFAULT 0,
    state          INTEGER NOT NULL DEFAULT 0,
    last_review    INTEGER,
    created_at     INTEGER NOT NULL,
    UNIQUE(hanzi, type)
  );
  CREATE TABLE reviews (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id           INTEGER NOT NULL REFERENCES items(id),
    ts                INTEGER NOT NULL,
    rating            INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 4),
    state             INTEGER,
    due               INTEGER,
    stability         REAL,
    difficulty        REAL,
    elapsed_days      INTEGER,
    last_elapsed_days INTEGER,
    scheduled_days    INTEGER,
    learning_steps    INTEGER
  );
  CREATE TABLE mistakes (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id    INTEGER REFERENCES items(id),
    ts         INTEGER NOT NULL,
    source     TEXT    NOT NULL CHECK (source IN ('flashcard', 'conversation')),
    error_type TEXT    NOT NULL DEFAULT 'recall',
    user_said  TEXT    NOT NULL DEFAULT '',
    expected   TEXT    NOT NULL DEFAULT '',
    context    TEXT    NOT NULL DEFAULT '',
    note       TEXT    NOT NULL DEFAULT ''
  );
  CREATE INDEX idx_items_due ON items(due);
  CREATE INDEX idx_reviews_item ON reviews(item_id);
  CREATE INDEX idx_mistakes_item ON mistakes(item_id);
  `
]

export const SCHEMA_VERSION = MIGRATIONS.length

export function openDatabase(path: string): Db {
  const db = new Database(path)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  migrate(db)
  return db
}

export function migrate(db: Db): void {
  const current = db.pragma('user_version', { simple: true }) as number
  for (let version = current; version < MIGRATIONS.length; version++) {
    db.transaction(() => {
      db.exec(MIGRATIONS[version])
      db.pragma(`user_version = ${version + 1}`)
    })()
  }
}

export function closeDatabase(db: Db): void {
  db.close()
}
