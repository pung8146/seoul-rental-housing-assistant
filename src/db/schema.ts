export const schemaSql = `
CREATE TABLE IF NOT EXISTS notices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL,
  source_id TEXT NOT NULL,
  title TEXT NOT NULL,
  stable_key TEXT NOT NULL,
  change_hash TEXT NOT NULL,
  status TEXT,
  region TEXT,
  target_tags TEXT NOT NULL,
  posted_at TEXT,
  application_start_at TEXT,
  application_end_at TEXT,
  source_url TEXT,
  metadata_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(source, source_id),
  UNIQUE(stable_key)
);

CREATE TABLE IF NOT EXISTS listings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL,
  notice_source_id TEXT NOT NULL,
  title TEXT NOT NULL,
  stable_key TEXT NOT NULL,
  change_hash TEXT NOT NULL,
  supply_type TEXT,
  region TEXT,
  target_tags TEXT NOT NULL,
  deposit REAL,
  monthly_rent REAL,
  floor_area_m2 REAL,
  status TEXT,
  metadata_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(stable_key)
);

CREATE TABLE IF NOT EXISTS listing_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  listing_stable_key TEXT NOT NULL,
  change_hash TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS source_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT NOT NULL,
  status TEXT NOT NULL,
  message TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS notification_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  channel TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  sent_at TEXT NOT NULL,
  UNIQUE(channel, payload_hash)
);

CREATE TABLE IF NOT EXISTS personal_profile (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  birth_year INTEGER,
  is_homeless INTEGER,
  residence_region TEXT,
  household_size INTEGER,
  monthly_income REAL,
  total_assets REAL,
  vehicle_value REAL,
  subscription_account_months INTEGER,
  subscription_payment_count INTEGER,
  interest_tags TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_notices_source_posted_at ON notices(source, posted_at);
CREATE INDEX IF NOT EXISTS idx_listings_notice_source_id ON listings(source, notice_source_id);
CREATE INDEX IF NOT EXISTS idx_listing_snapshots_stable_key ON listing_snapshots(listing_stable_key);
CREATE INDEX IF NOT EXISTS idx_source_runs_source_started_at ON source_runs(source, started_at);
`;
