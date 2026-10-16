-- =============================================================================
-- APP PREFERENCES TABLES
-- Event taxonomies and geographic preferences with native display ordering
-- =============================================================================

-- 1. Event Preferences (Categories, Skills, Technical Events, Sports, etc.)
CREATE TABLE IF NOT EXISTS app_event_preferences (
    id SERIAL PRIMARY KEY,
    preference_key VARCHAR(100) UNIQUE NOT NULL, -- e.g. 'eventTypes', 'Technical Events', 'skills', 'categories'
    display_title VARCHAR(150),
    values JSONB NOT NULL DEFAULT '[]'::jsonb,   -- Array of string values
    display_order INT NOT NULL DEFAULT 0,        -- Eliminates Firestore _order workaround
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_app_event_prefs_order ON app_event_preferences(display_order ASC);

-- 2. Location Preferences (State -> Districts map)
CREATE TABLE IF NOT EXISTS app_location_preferences (
    id SERIAL PRIMARY KEY,
    state_name VARCHAR(100) UNIQUE NOT NULL,     -- e.g. 'Tamil Nadu', 'Kerala'
    districts JSONB NOT NULL DEFAULT '[]'::jsonb, -- Array of district names
    display_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_app_loc_prefs_order ON app_location_preferences(display_order ASC);
