-- =============================================================================
-- EVENTS TABLE (Core Details)
-- Basic event metadata, organizer, mode, and workflow status
-- =============================================================================

CREATE TABLE IF NOT EXISTS events (
    id VARCHAR(64) PRIMARY KEY,
    event_name VARCHAR(255) NOT NULL,
    description TEXT,
    organized_by VARCHAR(255),
    mode_of_event VARCHAR(20) NOT NULL DEFAULT 'offline' CHECK (mode_of_event IN ('offline', 'online', 'hybrid')),
    website_url TEXT,
    created_by VARCHAR(64) REFERENCES users(id) ON DELETE SET NULL,
    creator_role VARCHAR(20) NOT NULL DEFAULT 'user',
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'accepted', 'rejected')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_events_status ON events(status);
CREATE INDEX IF NOT EXISTS idx_events_created_by ON events(created_by);
CREATE INDEX IF NOT EXISTS idx_events_created_at ON events(created_at DESC);

-- Full-text search index across event name, description, and organizer
CREATE INDEX IF NOT EXISTS idx_events_search ON events USING GIN (
    to_tsvector('english', coalesce(event_name, '') || ' ' || coalesce(description, '') || ' ' || coalesce(organized_by, ''))
);
