-- =============================================================================
-- USER PROFILES TABLE
-- Linked 1:1 with users, storing event and location preferences
-- =============================================================================

CREATE TABLE IF NOT EXISTS user_profiles (
    user_id VARCHAR(64) PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    preferences JSONB NOT NULL DEFAULT '{}'::jsonb,
    location_preferences JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_user_profiles_prefs ON user_profiles USING GIN (preferences);
CREATE INDEX IF NOT EXISTS idx_user_profiles_loc_prefs ON user_profiles USING GIN (location_preferences);
