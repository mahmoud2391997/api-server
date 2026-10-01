-- Ensure pgcrypto extension is available for digest() function
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Store only one-way hashes of school API keys.
ALTER TABLE schools ADD COLUMN IF NOT EXISTS api_key_hash TEXT NOT NULL DEFAULT '';
ALTER TABLE schools ADD COLUMN IF NOT EXISTS api_key_prefix TEXT NOT NULL DEFAULT '';

-- Preserve existing keys during rollout, then clear plaintext storage. Existing deployments
-- should rotate keys after applying this migration because plaintext keys cannot be recovered here.
UPDATE schools
SET api_key_hash = encode(digest(api_key, 'sha256'), 'hex'),
    api_key_prefix = left(api_key, 11)
WHERE api_key IS NOT NULL AND api_key_hash = '';

ALTER TABLE schools ALTER COLUMN api_key DROP NOT NULL;
ALTER TABLE schools DROP CONSTRAINT IF EXISTS schools_api_key_key;
DROP INDEX IF EXISTS schools_api_key_key;
UPDATE schools SET api_key = NULL WHERE api_key IS NOT NULL;
