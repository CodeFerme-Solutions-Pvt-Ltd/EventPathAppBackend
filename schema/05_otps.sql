-- =============================================================================
-- OTPS TABLE
-- Ephemeral verification codes with rate-limiting and expiry
-- =============================================================================

CREATE TABLE IF NOT EXISTS otps (
    mobile_number VARCHAR(25) PRIMARY KEY,
    otp_hash VARCHAR(64) NOT NULL,
    attempts INT NOT NULL DEFAULT 0,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_otps_expiry ON otps(expires_at);
