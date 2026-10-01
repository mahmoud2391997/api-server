-- Deactivate the default school that was created with the known API key
-- This is a security measure to prevent the default key from being used in production

-- Calculate the hash of the known default API key
-- sk-default-school-api-key-change-me hashed with SHA256
DO $$
DECLARE
  default_key_hash TEXT := encode(digest('sk-default-school-api-key-change-me', 'sha256'), 'hex');
BEGIN
  -- Deactivate any school that has the default API key hash
  UPDATE schools
  SET is_active = FALSE
  WHERE api_key_hash = default_key_hash;

  -- If no schools were deactivated, the key was already rotated or the school was deleted
  -- This is idempotent and safe to run multiple times
END $$;
