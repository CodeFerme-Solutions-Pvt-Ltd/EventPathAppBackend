-- =============================================================================
-- EVENT SCHEDULES TABLE
-- Date ranges, start/end times, and multi-day custom date/time slots
-- =============================================================================

CREATE TABLE IF NOT EXISTS event_schedules (
    event_id VARCHAR(64) PRIMARY KEY REFERENCES events(id) ON DELETE CASCADE,
    start_date DATE NOT NULL,
    end_date DATE,
    start_time VARCHAR(30),
    end_time VARCHAR(30),
    no_of_days INT NOT NULL DEFAULT 1,
    is_custom_dates BOOLEAN NOT NULL DEFAULT false,
    event_dates JSONB NOT NULL DEFAULT '[]'::jsonb,
    event_timings JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_event_schedules_start_date ON event_schedules(start_date DESC);
