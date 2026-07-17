DROP TABLE IF EXISTS points;
CREATE TABLE points (
  point_id TEXT PRIMARY KEY,
  city TEXT,
  city_slug TEXT,
  district TEXT,
  district_slug TEXT,
  village TEXT,
  point_name TEXT,
  address TEXT,
  lat REAL,
  lng REAL,
  schedule TEXT,
  recycling_schedule TEXT,
  collection_type TEXT,
  notes TEXT,
  source TEXT,
  fetched_at TEXT
);
CREATE INDEX idx_points_district ON points(city_slug, district_slug);
