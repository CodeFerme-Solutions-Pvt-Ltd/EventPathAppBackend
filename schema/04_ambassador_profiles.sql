-- =============================================================================
-- AMBASSADOR PROFILES TABLE
-- Linked 1:1 with users, tracking organization and verification status
-- =============================================================================

CREATE TABLE IF NOT EXISTS ambassador_profiles (
    user_id VARCHAR(64) PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    organization_name VARCHAR(255) NOT NULL,
    picture_url TEXT,
    picture_path TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    is_approved BOOLEAN NOT NULL DEFAULT false,
    valid_till TIMESTAMPTZ NOT NULL DEFAULT (CURRENT_TIMESTAMP + INTERVAL '1 year'),
    certificate_issued BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ambassador_status ON ambassador_profiles(status, is_approved);
CREATE INDEX IF NOT EXISTS idx_ambassador_org ON ambassador_profiles(organization_name);
