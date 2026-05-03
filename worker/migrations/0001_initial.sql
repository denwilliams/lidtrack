CREATE TABLE ranges (
  id           TEXT PRIMARY KEY,
  device_id    TEXT NOT NULL,
  local_date   TEXT NOT NULL,
  started_at   INTEGER NOT NULL,
  ended_at     INTEGER NOT NULL,
  bundle_id    TEXT,
  app_name     TEXT,
  ssid         TEXT,
  lid_open     INTEGER NOT NULL,
  active_count INTEGER NOT NULL,
  idle_count   INTEGER NOT NULL
);

CREATE INDEX idx_ranges_device_date ON ranges(device_id, local_date);
CREATE INDEX idx_ranges_started     ON ranges(started_at);

CREATE TABLE events (
  id          TEXT PRIMARY KEY,
  device_id   TEXT NOT NULL,
  local_date  TEXT NOT NULL,
  type        TEXT NOT NULL,
  occurred_at INTEGER NOT NULL,
  payload     TEXT NOT NULL
);

CREATE INDEX idx_events_device_date ON events(device_id, local_date);

CREATE TABLE devices (
  device_id TEXT PRIMARY KEY,
  name      TEXT NOT NULL,
  tz        TEXT NOT NULL,
  last_seen INTEGER NOT NULL
);

CREATE TABLE synced_days (
  device_id  TEXT NOT NULL,
  local_date TEXT NOT NULL,
  synced_at  INTEGER NOT NULL,
  PRIMARY KEY (device_id, local_date)
);
