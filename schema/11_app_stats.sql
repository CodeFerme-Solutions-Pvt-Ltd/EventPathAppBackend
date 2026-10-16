-- =============================================================================
-- APP STATS TABLE
-- Global platform metrics & atomic counters
-- =============================================================================

CREATE TABLE IF NOT EXISTS app_stats (
    metric_name VARCHAR(100) PRIMARY KEY,
    count BIGINT NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Seed initial stats counters if not present
INSERT INTO app_stats (metric_name, count) VALUES
    ('user_count', 0),
    ('total_events_registered', 0),
    ('pending_event_count', 0)
ON CONFLICT (metric_name) DO NOTHING;
