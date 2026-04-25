'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSession } from '@/components/auth/session-provider'
import { GuestSignInPrompt } from '@/components/auth/GuestSignInPrompt'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils/cn'

// ─── Types ───────────────────────────────────────────────────────────────────

interface Member {
  userId: string
  email: string
  name: string
  role: string
  joinedAt: string
}

interface Invite {
  id: string
  email: string | null
  role: string
  token: string
  invite_type: string
  expires_at: string
  use_count: number
  max_uses: number | null
  accepted_at: string | null
}

interface Domain {
  id: string
  domain: string
  created_at: string
}

// ─── Role Badge ──────────────────────────────────────────────────────────────

function RoleBadge({ role }: { role: string }) {
  const variant = role === 'owner' ? 'warning' : role === 'admin' ? 'info' : 'draft'
  return <Badge variant={variant}>{role}</Badge>
}

// ─── Spinner ─────────────────────────────────────────────────────────────────

function Spinner() {
  return <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
}

function SectionSpinner() {
  return (
    <div className="flex items-center justify-center py-8">
      <Spinner />
    </div>
  )
}

// ─── Members Section ─────────────────────────────────────────────────────────

function MembersSection({ currentUserId, currentUserRole }: { currentUserId: string; currentUserRole: string }) {
  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  const fetchMembers = useCallback(async () => {
    try {
      const res = await fetch('/api/workspace/members', { credentials: 'include' })
      if (!res.ok) throw new Error('Failed to fetch members')
      const data = await res.json()
      setMembers(data.members || [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load members')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchMembers() }, [fetchMembers])

  const handleChangeRole = async (userId: string, newRole: string) => {
    setActionLoading(userId)
    try {
      const res = await fetch(`/api/workspace/members/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ role: newRole }),
      })
      if (!res.ok) {
        const data = await res.json()
        alert(data.error || 'Failed to change role')
      } else {
        await fetchMembers()
      }
    } catch {
      alert('Failed to change role')
    } finally {
      setActionLoading(null)
    }
  }

  const handleRemoveMember = async (userId: string, memberName: string) => {
    if (!confirm(`Remove ${memberName} from this workspace?`)) return
    setActionLoading(userId)
    try {
      const res = await fetch(`/api/workspace/members/${userId}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      if (!res.ok && res.status !== 204) {
        const data = await res.json()
        alert(data.error || 'Failed to remove member')
      } else {
        await fetchMembers()
      }
    } catch {
      alert('Failed to remove member')
    } finally {
      setActionLoading(null)
    }
  }

  if (loading) return <SectionSpinner />
  if (error) return <p className="text-sm text-destructive py-4">{error}</p>

  const isOwner = currentUserRole === 'owner'
  const isAdminOrOwner = currentUserRole === 'owner' || currentUserRole === 'admin'

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-muted-foreground">
            <th className="pb-2 pr-4 font-medium">Name</th>
            <th className="pb-2 pr-4 font-medium">Email</th>
            <th className="pb-2 pr-4 font-medium">Role</th>
            <th className="pb-2 pr-4 font-medium">Joined</th>
            {isAdminOrOwner && <th className="pb-2 font-medium">Actions</th>}
          </tr>
        </thead>
        <tbody>
          {members.map((member) => {
            const isCurrentUser = member.userId === currentUserId
            const isMemberOwner = member.role === 'owner'
            return (
              <tr key={member.userId} className="border-b border-border/50 last:border-0">
                <td className="py-3 pr-4">
                  <span className="font-medium">{member.name || 'Unknown'}</span>
                  {isCurrentUser && (
                    <span className="ml-1.5 text-xs text-muted-foreground">(you)</span>
                  )}
                </td>
                <td className="py-3 pr-4 text-muted-foreground">{member.email}</td>
                <td className="py-3 pr-4">
                  <RoleBadge role={member.role} />
                </td>
                <td className="py-3 pr-4 text-muted-foreground">
                  {new Date(member.joinedAt).toLocaleDateString()}
                </td>
                {isAdminOrOwner && (
                  <td className="py-3">
                    {isCurrentUser || isMemberOwner ? (
                      <span className="text-xs text-muted-foreground">--</span>
                    ) : (
                      <div className="flex items-center gap-2">
                        {isOwner && (
                          <select
                            value={member.role}
                            onChange={(e) => handleChangeRole(member.userId, e.target.value)}
                            disabled={actionLoading === member.userId}
                            className="h-7 text-xs px-2"
                          >
                            <option value="admin">admin</option>
                            <option value="member">member</option>
                          </select>
                        )}
                        <button
                          onClick={() => handleRemoveMember(member.userId, member.name || member.email)}
                          disabled={actionLoading === member.userId}
                          className="text-xs text-destructive hover:text-destructive/80 disabled:opacity-50 transition-colors"
                        >
                          Remove
                        </button>
                        {actionLoading === member.userId && <Spinner />}
                      </div>
                    )}
                  </td>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>
      {members.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-4">No members found.</p>
      )}
    </div>
  )
}

// ─── Invites Section ─────────────────────────────────────────────────────────

function InvitesSection({ currentUserRole }: { currentUserRole: string }) {
  const [invites, setInvites] = useState<Invite[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [copiedToken, setCopiedToken] = useState<string | null>(null)

  const fetchInvites = useCallback(async () => {
    try {
      const res = await fetch('/api/workspace/invites', { credentials: 'include' })
      if (!res.ok) throw new Error('Failed to fetch invites')
      const data = await res.json()
      setInvites(data.invites || [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load invites')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchInvites() }, [fetchInvites])

  const handleRevoke = async (inviteId: string) => {
    if (!confirm('Revoke this invite?')) return
    setActionLoading(inviteId)
    try {
      const res = await fetch(`/api/workspace/invites/${inviteId}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      if (!res.ok && res.status !== 204) {
        const data = await res.json()
        alert(data.error || 'Failed to revoke invite')
      } else {
        await fetchInvites()
      }
    } catch {
      alert('Failed to revoke invite')
    } finally {
      setActionLoading(null)
    }
  }

  const handleCopyLink = async (token: string) => {
    const url = `${window.location.origin}/invite/${token}`
    try {
      await navigator.clipboard.writeText(url)
      setCopiedToken(token)
      setTimeout(() => setCopiedToken(null), 2000)
    } catch {
      // Fallback
      prompt('Copy this invite link:', url)
    }
  }

  const isAdminOrOwner = currentUserRole === 'owner' || currentUserRole === 'admin'

  if (loading) return <SectionSpinner />
  if (error) return <p className="text-sm text-destructive py-4">{error}</p>

  if (invites.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-4">No pending invites.</p>
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-muted-foreground">
            <th className="pb-2 pr-4 font-medium">Recipient</th>
            <th className="pb-2 pr-4 font-medium">Role</th>
            <th className="pb-2 pr-4 font-medium">Expires</th>
            <th className="pb-2 pr-4 font-medium">Status</th>
            {isAdminOrOwner && <th className="pb-2 font-medium">Actions</th>}
          </tr>
        </thead>
        <tbody>
          {invites.map((invite) => {
            const isExpired = new Date(invite.expires_at) < new Date()
            const isUsed = invite.max_uses !== null && invite.use_count >= invite.max_uses
            const status = invite.accepted_at ? 'accepted' : isExpired ? 'expired' : isUsed ? 'used' : 'pending'
            return (
              <tr key={invite.id} className="border-b border-border/50 last:border-0">
                <td className="py-3 pr-4">
                  {invite.email ? (
                    <span>{invite.email}</span>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground italic">Link invite</span>
                      <button
                        onClick={() => handleCopyLink(invite.token)}
                        className="text-xs text-primary hover:text-primary/80 transition-colors"
                      >
                        {copiedToken === invite.token ? 'Copied!' : 'Copy link'}
                      </button>
                    </div>
                  )}
                </td>
                <td className="py-3 pr-4">
                  <RoleBadge role={invite.role} />
                </td>
                <td className="py-3 pr-4 text-muted-foreground">
                  {new Date(invite.expires_at).toLocaleDateString()}
                </td>
                <td className="py-3 pr-4">
                  <Badge
                    variant={
                      status === 'pending' ? 'warning'
                      : status === 'accepted' ? 'active'
                      : 'draft'
                    }
                  >
                    {status}
                  </Badge>
                </td>
                {isAdminOrOwner && (
                  <td className="py-3">
                    {status === 'pending' ? (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleRevoke(invite.id)}
                          disabled={actionLoading === invite.id}
                          className="text-xs text-destructive hover:text-destructive/80 disabled:opacity-50 transition-colors"
                        >
                          Revoke
                        </button>
                        {actionLoading === invite.id && <Spinner />}
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">--</span>
                    )}
                  </td>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ─── Invite Form ─────────────────────────────────────────────────────────────

function InviteForm({ onInviteSent }: { onInviteSent: () => void }) {
  const [mode, setMode] = useState<'email' | 'link'>('email')
  const [emailInput, setEmailInput] = useState('')
  const [role, setRole] = useState<'member' | 'admin'>('member')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [generatedLink, setGeneratedLink] = useState<string | null>(null)
  const [copiedLink, setCopiedLink] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccess(null)
    setGeneratedLink(null)
    setSending(true)

    try {
      if (mode === 'email') {
        const emails = emailInput
          .split(',')
          .map(e => e.trim())
          .filter(e => e.length > 0)

        if (emails.length === 0) {
          setError('Enter at least one email address')
          setSending(false)
          return
        }

        const res = await fetch('/api/workspace/invites', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ emails, type: 'email', role }),
        })

        if (!res.ok) {
          const data = await res.json()
          throw new Error(data.error || 'Failed to send invites')
        }

        setSuccess(`Sent ${emails.length} invite${emails.length > 1 ? 's' : ''}`)
        setEmailInput('')
      } else {
        const res = await fetch('/api/workspace/invites', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ type: 'link', role }),
        })

        if (!res.ok) {
          const data = await res.json()
          throw new Error(data.error || 'Failed to generate invite link')
        }

        const data = await res.json()
        const link = `${window.location.origin}/invite/${data.invite.token}`
        setGeneratedLink(link)
        setSuccess('Invite link generated')
      }

      onInviteSent()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create invite')
    } finally {
      setSending(false)
    }
  }

  const handleCopyGenerated = async () => {
    if (!generatedLink) return
    try {
      await navigator.clipboard.writeText(generatedLink)
      setCopiedLink(true)
      setTimeout(() => setCopiedLink(false), 2000)
    } catch {
      prompt('Copy this invite link:', generatedLink)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Mode toggle — segmented control with neobrutalist borders */}
      <div className="inline-flex border-2 border-foreground/20 w-fit">
        <button
          type="button"
          onClick={() => { setMode('email'); setGeneratedLink(null); setError(null); setSuccess(null) }}
          className={cn(
            'h-8 px-3 text-xs font-heading font-bold uppercase tracking-wider border-r-2 border-foreground/20 transition-colors',
            mode === 'email'
              ? 'bg-primary text-primary-foreground'
              : 'bg-background text-muted-foreground hover:bg-muted hover:text-foreground'
          )}
        >
          Email invite
        </button>
        <button
          type="button"
          onClick={() => { setMode('link'); setGeneratedLink(null); setError(null); setSuccess(null) }}
          className={cn(
            'h-8 px-3 text-xs font-heading font-bold uppercase tracking-wider transition-colors',
            mode === 'link'
              ? 'bg-primary text-primary-foreground'
              : 'bg-background text-muted-foreground hover:bg-muted hover:text-foreground'
          )}
        >
          Generate link
        </button>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        {mode === 'email' && (
          <input
            type="text"
            value={emailInput}
            onChange={(e) => setEmailInput(e.target.value)}
            placeholder="alice@company.com, bob@company.com"
            className="flex-1 h-9 px-3 text-sm border-2 border-foreground/20 bg-background text-foreground placeholder:text-muted-foreground transition-all focus:outline-none focus:border-foreground focus:shadow-[2px_2px_0_var(--color-foreground)]"
          />
        )}

        <select
          value={role}
          onChange={(e) => setRole(e.target.value as 'member' | 'admin')}
          className="h-9 px-3 text-sm"
        >
          <option value="member">Member</option>
          <option value="admin">Admin</option>
        </select>

        <Button type="submit" disabled={sending} className="whitespace-nowrap">
          {sending
            ? 'Sending...'
            : mode === 'email'
              ? 'Send Invites'
              : 'Generate Link'
          }
        </Button>
      </div>

      {/* Generated link display */}
      {generatedLink && (
        <div className="flex items-center gap-2 p-2 border-2 border-foreground/20 bg-muted">
          <code className="flex-1 text-xs truncate">{generatedLink}</code>
          <button
            type="button"
            onClick={handleCopyGenerated}
            className="text-xs text-primary hover:text-primary/80 font-medium whitespace-nowrap transition-colors underline underline-offset-2"
          >
            {copiedLink ? 'Copied!' : 'Copy'}
          </button>
        </div>
      )}

      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}
      {success && !generatedLink && (
        <p className="text-sm text-success">{success}</p>
      )}
    </form>
  )
}

// ─── Domains Section ─────────────────────────────────────────────────────────

function DomainsSection() {
  const [domains, setDomains] = useState<Domain[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [newDomain, setNewDomain] = useState('')
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)

  const fetchDomains = useCallback(async () => {
    try {
      const res = await fetch('/api/workspace/domains', { credentials: 'include' })
      if (!res.ok) throw new Error('Failed to fetch domains')
      const data = await res.json()
      setDomains(data.domains || [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load domains')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchDomains() }, [fetchDomains])

  const handleAddDomain = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newDomain.trim()) return
    setAdding(true)
    setAddError(null)

    try {
      const res = await fetch('/api/workspace/domains', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ domain: newDomain.trim() }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to claim domain')
      }

      setNewDomain('')
      await fetchDomains()
    } catch (e) {
      setAddError(e instanceof Error ? e.message : 'Failed to claim domain')
    } finally {
      setAdding(false)
    }
  }

  if (loading) return <SectionSpinner />
  if (error) return <p className="text-sm text-destructive py-4">{error}</p>

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        When a new user signs up with an email from a claimed domain, they will be suggested to join this workspace automatically.
      </p>

      {/* Domain list */}
      {domains.length > 0 ? (
        <div className="space-y-2">
          {domains.map((d) => (
            <div key={d.id} className="flex items-center justify-between py-2 px-3 border-2 border-foreground/20 bg-background">
              <span className="text-sm font-mono">{d.domain}</span>
              <span className="text-xs text-muted-foreground">
                Added {new Date(d.created_at).toLocaleDateString()}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground text-center py-2">No claimed domains yet.</p>
      )}

      {/* Add domain form */}
      <form onSubmit={handleAddDomain} className="flex gap-2">
        <input
          type="text"
          value={newDomain}
          onChange={(e) => setNewDomain(e.target.value)}
          placeholder="example.com"
          className="flex-1 h-9 px-3 text-sm border-2 border-foreground/20 bg-background text-foreground placeholder:text-muted-foreground transition-all focus:outline-none focus:border-foreground focus:shadow-[2px_2px_0_var(--color-foreground)]"
        />
        <Button type="submit" disabled={adding || !newDomain.trim()}>
          {adding ? 'Claiming...' : 'Claim Domain'}
        </Button>
      </form>
      {addError && (
        <p className="text-sm text-destructive">{addError}</p>
      )}
    </div>
  )
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function SettingsWorkspacePage() {
  const { session, loading } = useSession()
  const [inviteKey, setInviteKey] = useState(0)

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!session) return <GuestSignInPrompt message="Sign in to manage workspace settings" />

  const currentUserId = session.sub
  const currentUserRole = session.role || 'member'
  const isOwner = currentUserRole === 'owner'
  const isAdminOrOwner = currentUserRole === 'owner' || currentUserRole === 'admin'

  return (
    <div className="max-w-4xl space-y-8">
      {/* Page subtitle — layout renders the <h1>Settings</h1> header; this
          scopes the page to the workspace subsection without duplicating h1. */}
      <p className="text-sm text-muted-foreground">
        Workspace · manage team members, invitations, and configuration.
      </p>

      {/* Members section */}
      <section className="border-2 border-foreground/20 bg-card shadow-card">
        <div className="px-6 py-4 border-b-2 border-foreground/20">
          <h2 className="text-lg font-semibold">Members</h2>
          <p className="text-sm text-muted-foreground mt-0.5">People who have access to this workspace.</p>
        </div>
        <div className="p-6">
          <MembersSection currentUserId={currentUserId} currentUserRole={currentUserRole} />
        </div>
      </section>

      {/* Invite form section (admin+ only) */}
      {isAdminOrOwner && (
        <section className="border-2 border-foreground/20 bg-card shadow-card">
          <div className="px-6 py-4 border-b-2 border-foreground/20">
            <h2 className="text-lg font-semibold">Invite People</h2>
            <p className="text-sm text-muted-foreground mt-0.5">Send email invites or generate a shareable link.</p>
          </div>
          <div className="p-6">
            <InviteForm onInviteSent={() => setInviteKey(k => k + 1)} />
          </div>
        </section>
      )}

      {/* Pending invites section */}
      <section className="border-2 border-foreground/20 bg-card shadow-card">
        <div className="px-6 py-4 border-b-2 border-foreground/20">
          <h2 className="text-lg font-semibold">Pending Invites</h2>
          <p className="text-sm text-muted-foreground mt-0.5">Invitations that have not yet been accepted.</p>
        </div>
        <div className="p-6">
          <InvitesSection key={inviteKey} currentUserRole={currentUserRole} />
        </div>
      </section>

      {/* Domain claims section (owner only) */}
      {isOwner && (
        <section className="border-2 border-foreground/20 bg-card shadow-card">
          <div className="px-6 py-4 border-b-2 border-foreground/20">
            <h2 className="text-lg font-semibold">Domain Claims</h2>
            <p className="text-sm text-muted-foreground mt-0.5">Claim your company domain so new sign-ups are auto-suggested to join this workspace.</p>
          </div>
          <div className="p-6">
            <DomainsSection />
          </div>
        </section>
      )}
    </div>
  )
}
