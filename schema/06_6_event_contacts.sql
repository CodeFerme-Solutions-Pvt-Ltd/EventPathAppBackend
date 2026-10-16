-- =============================================================================
-- EVENT CONTACTS TABLE
-- Contact persons and custom event details/rules
-- =============================================================================

CREATE TABLE IF NOT EXISTS event_contacts (
    event_id VARCHAR(64) PRIMARY KEY REFERENCES events(id) ON DELETE CASCADE,
    contacts JSONB NOT NULL DEFAULT '[]'::jsonb,
    additional_details JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
