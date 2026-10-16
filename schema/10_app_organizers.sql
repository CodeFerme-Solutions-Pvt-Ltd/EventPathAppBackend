-- =============================================================================
-- APP ORGANIZERS TABLE
-- Validated list of registered organizations for ambassador verification
-- =============================================================================

CREATE TABLE IF NOT EXISTS app_organizers (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) UNIQUE NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_app_organizers_name ON app_organizers(name);
