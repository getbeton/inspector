# Encryption Key Management & Rotation Strategy

This document covers the management, rotation, and recovery procedures for the `ENCRYPTION_KEY` used by Beton Inspector to encrypt integration credentials.

## Overview

Beton Inspector uses **AES-256-GCM** encryption with **scrypt** key derivation to protect stored API keys (PostHog, Attio, etc.). The master key is stored as the `ENCRYPTION_KEY` environment variable.

### Encryption Format

Each encrypted value uses the format: `salt:iv:tag:ciphertext` (hex-encoded).

- **Salt**: 128-bit random salt (unique per encryption)
- **IV**: 96-bit random initialization vector
- **Tag**: 128-bit GCM authentication tag
- **Ciphertext**: AES-256-GCM encrypted data

---

## Key Requirements

| Property | Value |
|----------|-------|
| Algorithm | AES-256-GCM |
| Key Derivation | scrypt (async) |
| Key Length | 256 bits (64 hex characters) |
| Format | Hexadecimal string |

### Generating a Key

```bash
# Generate a secure 256-bit key
openssl rand -hex 32
```

---

## Environment Separation

**Each environment MUST have its own unique `ENCRYPTION_KEY`.**

| Environment | Key Source | Managed In |
|-------------|-----------|------------|
| Production | Unique key | Vercel env vars |
| Staging | Unique key | Vercel env vars |
| Preview | Same as staging | Inherited from staging |
| Local dev | Unique key | `.env.local` |

### Why Separate Keys?

- Prevents credential leakage across environments
- If a staging key is compromised, production credentials remain safe
- Allows independent key rotation per environment

---

## Key Loss & Recovery

### What Happens If the Key Is Lost

**All encrypted credentials become permanently unrecoverable.**

The `ENCRYPTION_KEY` is the master secret. Without it:
- Integration API keys cannot be decrypted
- Users must re-enter credentials for all integrations
- No backdoor or recovery mechanism exists (by design)

### Preventing Key Loss

1. **Store the key in a password manager** (e.g., 1Password, Bitwarden)
2. **Document who has access** to the key
3. **Never store the key in code** or version control
4. **Use Vercel's built-in secret management** for deployments

### Recovery After Key Loss

If the key is lost:

1. Generate a new `ENCRYPTION_KEY`
2. Update the environment variable in Vercel
3. All existing integration configs will fail to decrypt
4. Users will see "disconnected" status for integrations
5. Users must re-validate (re-enter API keys) for each integration
6. The re-validation flow will encrypt with the new key

---

## Key Rotation Procedure

### When to Rotate

- On a regular schedule (e.g., annually)
- After a team member with access leaves
- If you suspect the key may be compromised
- After a security audit recommendation

### Rotation Steps

Key rotation requires re-encrypting all credentials with the new key. This is a **zero-downtime** operation when done correctly.

#### Step 1: Generate New Key

```bash
export NEW_KEY=$(openssl rand -hex 32)
echo "New key: $NEW_KEY"
# Save this key securely!
```

#### Step 2: Run Migration Script

Use the credential re-encryption script (see `BETON-179`):

```bash
# Set both old and new keys
export OLD_ENCRYPTION_KEY=<current-key>
export NEW_ENCRYPTION_KEY=<new-key>

# Run the migration
npx tsx scripts/rotate-encryption-key.ts
```

The script will:
1. Read all `integration_configs` from the database
2. Decrypt each credential with the old key
3. Re-encrypt with the new key
4. Update the database row

#### Step 3: Update Environment Variable

```bash
# Update in Vercel
vercel env rm ENCRYPTION_KEY
vercel env add ENCRYPTION_KEY
# Enter the new key when prompted
```

#### Step 4: Redeploy

```bash
# Trigger a new deployment to pick up the new key
vercel deploy --prod
```

#### Step 5: Verify

1. Check application logs for decryption errors
2. Verify integrations still show "connected" status
3. Test a validation flow to ensure encryption works

#### Step 6: Decommission Old Key

1. Remove the old key from any documentation or backups
2. Confirm the new key is saved in a password manager
3. Update access documentation

---

## Future Considerations

### Encryption Format Versioning

If the encryption algorithm needs to change in the future (e.g., switching from scrypt to Argon2):

1. Add a version prefix to encrypted values: `v1:salt:iv:tag:ciphertext`
2. Detect version during decryption
3. Support multiple versions during migration
4. Migrate all credentials to new version

### Hardware Security Module (HSM)

For higher security requirements:
- Use AWS KMS or GCP Cloud KMS for key management
- Wrap the `ENCRYPTION_KEY` with a KMS key
- Add key access logging through the KMS audit trail

---

## Access Control

### Who Should Have Access

| Role | Access Level |
|------|-------------|
| CTO / Lead Engineer | Full access to production key |
| DevOps / Platform | Full access for deployment |
| Developers | Local dev key only |
| Support | No direct key access |

### Audit Trail

Track key access by:
1. Using Vercel's audit log for env var access
2. Documenting key rotation dates
3. Recording who performed rotations
