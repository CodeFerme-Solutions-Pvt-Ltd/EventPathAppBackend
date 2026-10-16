-- =============================================================================
-- AMBASSADOR REQUESTS TABLE
-- Tracks requests from normal users applying to become Campus Ambassadors
-- =============================================================================

CREATE TABLE IF NOT EXISTS ambassador_requests (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    organization_name VARCHAR(255) NOT NULL,
    department VARCHAR(255),
    picture_url TEXT,
    picture_path TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ambassador_requests_user ON ambassador_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_ambassador_requests_status ON ambassador_requests(status);
