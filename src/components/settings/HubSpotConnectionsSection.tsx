"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Spinner } from "@/components/ui/spinner"
import { toastManager } from "@/components/ui/toast"
import {
  Dialog,
  DialogTrigger,
  DialogPopup,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog"
import { Plus, Trash2, RefreshCw, Key, Shield } from "lucide-react"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface HubSpotConnection {
  id: string
  name: string
  auth_type: "oauth" | "private_app"
  hub_id: string | null
  hub_domain: string | null
  account_name: string | null
  status: string
  is_active: boolean
  is_primary: boolean
  last_validated_at: string | null
  last_error: string | null
  created_at: string
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function HubSpotConnectionsSection() {
  const [connections, setConnections] = useState<HubSpotConnection[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [testingId, setTestingId] = useState<string | null>(null)

  // Load connections
  useEffect(() => {
    async function loadConnections() {
      try {
        const res = await fetch("/api/integrations/hubspot/connections", {
          credentials: "include",
        })
        if (!res.ok) {
          setConnections([])
          return
        }
        const data = await res.json()
        setConnections(data.connections || [])
      } catch {
        setConnections([])
      } finally {
        setIsLoading(false)
      }
    }
    loadConnections()
  }, [])

  const handleDelete = async (id: string) => {
    setDeletingId(id)
    try {
      const res = await fetch(`/api/integrations/hubspot/connections/${id}`, {
        method: "DELETE",
        credentials: "include",
      })
      if (!res.ok) throw new Error("Delete failed")
      setConnections((prev) => prev.filter((c) => c.id !== id))
      toastManager.add({ type: "success", title: "Connection removed" })
    } catch {
      toastManager.add({ type: "error", title: "Failed to remove connection" })
    } finally {
      setDeletingId(null)
    }
  }

  const handleTest = async (id: string) => {
    setTestingId(id)
    try {
      const res = await fetch(`/api/integrations/hubspot/connections/${id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "test" }),
      })
      const data = await res.json()
      if (data.success || res.ok) {
        toastManager.add({ type: "success", title: "HubSpot connection is healthy" })
        // Update status
        setConnections((prev) =>
          prev.map((c) =>
            c.id === id ? { ...c, status: "connected", last_error: null } : c
          )
        )
      } else {
        toastManager.add({
          type: "error",
          title: data.error || "Connection test failed",
        })
      }
    } catch {
      toastManager.add({ type: "error", title: "Connection test failed" })
    } finally {
      setTestingId(null)
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
            HubSpot Connections
          </h3>
        </div>
        <div className="flex items-center justify-center py-4">
          <Spinner className="size-4" />
        </div>
      </div>
    )
  }

  if (connections.length === 0) return null

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
          HubSpot Connections
        </h3>
        <Button
          variant="outline"
          size="sm"
          onClick={() => (window.location.href = "/setup")}
          className="h-7 text-xs"
        >
          <Plus className="h-3 w-3 mr-1" />
          Add
        </Button>
      </div>

      <div className="space-y-2">
        {connections.map((conn) => (
          <div
            key={conn.id}
            className="flex items-center justify-between rounded-lg border-2 border-border p-3"
          >
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded bg-[#FF7A59]/10 flex items-center justify-center">
                <div className="h-4 w-4 rounded-sm bg-[#FF7A59] flex items-center justify-center">
                  <span className="text-white text-[8px] font-bold">H</span>
                </div>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium">{conn.name}</p>
                  {conn.is_primary && (
                    <Badge size="sm" variant="outline">
                      Primary
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  {conn.auth_type === "oauth" ? (
                    <Shield className="h-3 w-3" />
                  ) : (
                    <Key className="h-3 w-3" />
                  )}
                  <span>
                    {conn.auth_type === "oauth" ? "OAuth" : "Private App"}
                    {conn.hub_id ? ` - Portal ${conn.hub_id}` : ""}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {conn.status === "connected" ? (
                <Badge className="bg-success/10 text-success border-success/20">
                  Connected
                </Badge>
              ) : conn.status === "error" ? (
                <Badge className="bg-destructive/10 text-destructive border-destructive/20">
                  Error
                </Badge>
              ) : (
                <Badge variant="outline" className="text-muted-foreground">
                  {conn.status}
                </Badge>
              )}

              <Button
                variant="outline"
                size="sm"
                onClick={() => handleTest(conn.id)}
                disabled={testingId === conn.id}
                className="h-7 text-xs"
              >
                {testingId === conn.id ? (
                  <Spinner className="h-3 w-3" />
                ) : (
                  <RefreshCw className="h-3 w-3" />
                )}
                Test
              </Button>

              <Dialog>
                <DialogTrigger
                  render={
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs text-destructive hover:text-destructive"
                      disabled={deletingId === conn.id}
                    >
                      {deletingId === conn.id ? (
                        <Spinner className="h-3 w-3" />
                      ) : (
                        <Trash2 className="h-3 w-3" />
                      )}
                    </Button>
                  }
                />
                <DialogPopup>
                  <DialogHeader>
                    <DialogTitle>Remove HubSpot Connection?</DialogTitle>
                    <DialogDescription>
                      This will remove the connection &quot;{conn.name}&quot; and
                      stop syncing data. Existing synced data will not be
                      deleted.
                    </DialogDescription>
                  </DialogHeader>
                  <DialogFooter>
                    <DialogClose
                      render={<Button variant="outline">Cancel</Button>}
                    />
                    <DialogClose
                      render={
                        <Button
                          variant="destructive"
                          onClick={() => handleDelete(conn.id)}
                        >
                          Remove
                        </Button>
                      }
                    />
                  </DialogFooter>
                </DialogPopup>
              </Dialog>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
