-- =============================================================================
-- EVENT MEDIA TABLE
-- Multi-poster images, banners, and documents stored in Lightsail Storage Bucket
-- =============================================================================

CREATE TABLE IF NOT EXISTS event_media (
    id SERIAL PRIMARY KEY,
    event_id VARCHAR(64) NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    storage_key TEXT,
    media_type VARCHAR(20) NOT NULL DEFAULT 'poster' CHECK (media_type IN ('poster', 'banner', 'document')),
    display_order INT NOT NULL DEFAULT 0,
    is_primary BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_event_media_event ON event_media(event_id, is_primary);
