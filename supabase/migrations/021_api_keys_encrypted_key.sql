-- Add encrypted_key column for retrievable API key storage (AES-256-GCM)
-- Existing keys will have NULL (created before encrypted storage was added)
alter table api_keys
  add column if not exists encrypted_key text;

comment on column api_keys.encrypted_key is
  'AES-256-GCM encrypted plaintext key (salt:iv:tag:ciphertext). NULL for legacy keys created before encrypted storage.';
