// ---------------------------------------------------------------------------
// API client for /api/auth/keys endpoints
// ---------------------------------------------------------------------------

export interface ApiKeyMeta {
  id: string
  name: string
  last_used_at: string | null
  expires_at: string
  created_at: string
  has_encrypted_key: boolean
}

export interface ApiKeyCreateResponse {
  key: string
  id: string
  name: string
  expires_at: string
  created_at: string
  message: string
}

/** List all API keys (metadata only, no secrets). */
export async function listApiKeys(): Promise<ApiKeyMeta[]> {
  const res = await fetch('/api/auth/keys', { credentials: 'include' })
  if (!res.ok) throw new Error('Failed to fetch API keys')
  const json = await res.json()
  return json.keys as ApiKeyMeta[]
}

/** Generate a new API key. Returns the plaintext once. */
export async function createApiKey(name = 'MCP Key'): Promise<ApiKeyCreateResponse> {
  const res = await fetch('/api/auth/keys', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  })
  if (!res.ok) throw new Error('Failed to create API key')
  return res.json() as Promise<ApiKeyCreateResponse>
}

/** Reveal (decrypt) an API key by ID. Only works for keys with encrypted storage. */
export async function revealApiKey(id: string): Promise<string> {
  const res = await fetch(`/api/auth/keys/${id}/reveal`, { credentials: 'include' })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || 'Failed to reveal key')
  }
  const json = await res.json()
  return json.key as string
}

/** Delete (revoke) an API key by ID. */
export async function deleteApiKey(id: string): Promise<void> {
  const res = await fetch(`/api/auth/keys/${id}`, {
    method: 'DELETE',
    credentials: 'include',
  })
  if (!res.ok) throw new Error('Failed to delete API key')
}
