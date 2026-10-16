-- =============================================================================
-- EVENT LOCATIONS TABLE
-- Venue details, physical address, Google Maps URL, and geographic preferences
-- =============================================================================

CREATE TABLE IF NOT EXISTS event_locations (
    event_id VARCHAR(64) PRIMARY KEY REFERENCES events(id) ON DELETE CASCADE,
    venue_name VARCHAR(255),
    address TEXT,
    maps_url TEXT,
    location_preferences JSONB NOT NULL DEFAULT '{}'::jsonb, -- selectedStates, selectedDistricts
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_event_locations_prefs ON event_locations USING GIN (location_preferences);
CREATE INDEX IF NOT EXISTS idx_event_locations_venue ON event_locations(venue_name);
