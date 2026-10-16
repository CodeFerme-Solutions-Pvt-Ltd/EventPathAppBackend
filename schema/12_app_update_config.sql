-- =============================================================================
-- APP UPDATE CONFIG TABLE
-- Application versioning & update configuration
-- Structured according to UpdateScreen in frontend eventpath
-- =============================================================================

CREATE TABLE IF NOT EXISTS app_update_config (
    id VARCHAR(50) PRIMARY KEY DEFAULT 'default',
    title VARCHAR(255) NOT NULL DEFAULT 'Newer Version Available',
    update_link TEXT NOT NULL DEFAULT 'https://play.google.com/store/apps/details?id=com.codeferme.eventpath',
    about_update TEXT NOT NULL DEFAULT 'New performance improvements and bug fixes. A newer version is available. Update and continue the usage.',
    latest_version VARCHAR(50) NOT NULL DEFAULT '3.10.3',
    is_update_available BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Seed initial app update config if not present
INSERT INTO app_update_config (
    id,
    title,
    update_link,
    about_update,
    latest_version,
    is_update_available
) VALUES (
    'default',
    'Newer Version Available',
    'https://play.google.com/store/apps/details?id=com.codeferme.eventpath',
    'New performance improvements and bug fixes. A newer version is available. Update and continue the usage.',
    '3.10.3',
    false
)
ON CONFLICT (id) DO NOTHING;

-- Helper view exposing camelCase column aliases matching UpdateScreen in frontend
CREATE OR REPLACE VIEW app_update_config_view AS
SELECT 
    id,
    title,
    update_link AS "updateLink",
    about_update AS "aboutUpdate",
    latest_version AS "latestVersion",
    is_update_available AS "isUpdateAvailable",
    created_at,
    updated_at
FROM app_update_config;
