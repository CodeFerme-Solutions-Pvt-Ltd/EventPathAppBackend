-- =============================================================================
-- EVENT REGISTRATIONS TABLE
-- Pricing models, fee types (free/normal/slab), amounts, deadlines, and notes
-- =============================================================================

CREATE TABLE IF NOT EXISTS event_registrations (
    event_id VARCHAR(64) PRIMARY KEY REFERENCES events(id) ON DELETE CASCADE,
    has_registration BOOLEAN NOT NULL DEFAULT false,
    fee_type VARCHAR(20) NOT NULL DEFAULT 'normal' CHECK (fee_type IN ('normal', 'slab')),
    amount NUMERIC(10, 2) NOT NULL DEFAULT 0,
    slabs JSONB NOT NULL DEFAULT '[]'::jsonb,
    slab_image_url TEXT,
    slab_image_path TEXT,
    last_date_to_register DATE,
    additional_note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_event_reg_has ON event_registrations(has_registration);
CREATE INDEX IF NOT EXISTS idx_event_reg_amount ON event_registrations(amount);
