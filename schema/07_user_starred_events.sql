-- =============================================================================
-- USER STARRED / BOOKMARKED EVENTS TABLE
-- Relational junction table linking users and their saved events
-- =============================================================================

CREATE TABLE IF NOT EXISTS user_starred_events (
    user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    event_id VARCHAR(64) NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, event_id)
);

CREATE INDEX IF NOT EXISTS idx_starred_user ON user_starred_events(user_id);
CREATE INDEX IF NOT EXISTS idx_starred_event ON user_starred_events(event_id);
