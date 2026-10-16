-- =============================================================================
-- EVENT PREFERENCES TABLE
-- Taxonomies, categories, skills, event types, and interest areas with GIN indexes
-- =============================================================================

CREATE TABLE IF NOT EXISTS event_preferences (
    event_id VARCHAR(64) PRIMARY KEY REFERENCES events(id) ON DELETE CASCADE,
    categories JSONB NOT NULL DEFAULT '[]'::jsonb,
    skills JSONB NOT NULL DEFAULT '[]'::jsonb,
    event_types JSONB NOT NULL DEFAULT '[]'::jsonb,
    interest_areas JSONB NOT NULL DEFAULT '[]'::jsonb,
    raw_preferences JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_event_prefs_raw ON event_preferences USING GIN (raw_preferences);
CREATE INDEX IF NOT EXISTS idx_event_prefs_categories ON event_preferences USING GIN (categories);
CREATE INDEX IF NOT EXISTS idx_event_prefs_skills ON event_preferences USING GIN (skills);
CREATE INDEX IF NOT EXISTS idx_event_prefs_event_types ON event_preferences USING GIN (event_types);
CREATE INDEX IF NOT EXISTS idx_event_prefs_interest ON event_preferences USING GIN (interest_areas);
