-- =============================================================================
-- HIRING ALERTS TABLE
-- Stores company hiring alerts, roles, descriptions, locations, and contacts
-- =============================================================================

CREATE TABLE IF NOT EXISTS hiring_alerts (
    id VARCHAR(64) PRIMARY KEY,
    company_name VARCHAR(255) NOT NULL,
    position_name VARCHAR(255) NOT NULL,
    description TEXT,
    apply_link TEXT,
    location TEXT,                       -- own text field (e.g. 'Bengaluru, Hybrid', 'Remote', etc.)
    contact_name VARCHAR(150),
    contact_info VARCHAR(255),           -- phone or email
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_hiring_alerts_created_at ON hiring_alerts(created_at DESC);
