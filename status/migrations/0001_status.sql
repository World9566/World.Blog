CREATE TABLE components (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  failures INTEGER NOT NULL DEFAULT 0,
  successes INTEGER NOT NULL DEFAULT 0,
  checked_at INTEGER NOT NULL,
  changed_at INTEGER NOT NULL,
  bucket INTEGER NOT NULL,
  latency_ms INTEGER
);
CREATE TABLE daily (
  component TEXT NOT NULL,
  day TEXT NOT NULL,
  passed INTEGER NOT NULL,
  total INTEGER NOT NULL,
  last_bucket INTEGER NOT NULL,
  PRIMARY KEY (component, day)
);
CREATE TABLE incidents (
  id INTEGER PRIMARY KEY,
  component TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  resolved_at INTEGER
);
CREATE UNIQUE INDEX one_open_incident ON incidents(component) WHERE resolved_at IS NULL;
CREATE INDEX incident_time ON incidents(started_at);
