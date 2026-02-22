"use client"

import { useState, useCallback } from "react"
import {
  Dialog,
  DialogPopup,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogPanel,
  DialogFooter,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Spinner } from "@/components/ui/spinner"
import { Plus } from "lucide-react"

const FIELD_TYPES = [
  { value: "text", label: "Text" },
  { value: "number", label: "Number" },
  { value: "date", label: "Date" },
  { value: "currency", label: "Currency" },
  { value: "checkbox", label: "Checkbox" },
] as const

export interface CreateFieldDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  objectSlug: string
  objectLabel: string
  onCreated: (field: {
    slug: string
    title: string
    type: string
    objectSlug: string
  }) => void
}

/**
 * Dialog to create a new Attio attribute inline during field mapping.
 * Calls POST to create the attribute via existing `createAttribute()` in the Attio client.
 */
export function CreateFieldDialog({
  open,
  onOpenChange,
  objectSlug,
  objectLabel,
  onCreated,
}: CreateFieldDialogProps) {
  const [fieldName, setFieldName] = useState("")
  const [fieldType, setFieldType] = useState("text")
  const [isCreating, setIsCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reset = useCallback(() => {
    setFieldName("")
    setFieldType("text")
    setError(null)
    setIsCreating(false)
  }, [])

  const handleCreate = async () => {
    const name = fieldName.trim()
    if (!name) {
      setError("Field name is required")
      return
    }

    // Generate a slug from the name
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "")

    if (!slug) {
      setError("Field name must contain at least one letter or number")
      return
    }

    setIsCreating(true)
    setError(null)

    try {
      const res = await fetch(`/api/integrations/attio/attributes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          object: objectSlug,
          title: name,
          api_slug: slug,
          type: fieldType,
        }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.error || "Failed to create field")
      }

      const data = await res.json()
      onCreated({
        slug: data.attribute?.slug || slug,
        title: data.attribute?.title || name,
        type: data.attribute?.type || fieldType,
        objectSlug,
      })
      reset()
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create field")
    } finally {
      setIsCreating(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(open) => {
        if (!open) reset()
        onOpenChange(open)
      }}
    >
      <DialogPopup className="max-w-md">
        <DialogHeader>
          <DialogTitle>Create Attio Field</DialogTitle>
          <DialogDescription>
            Add a new field to the <strong>{objectLabel}</strong> object in Attio.
          </DialogDescription>
        </DialogHeader>

        <DialogPanel>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="field-name">Field Name</Label>
              <Input
                id="field-name"
                value={fieldName}
                onChange={(e) => setFieldName(e.target.value)}
                placeholder="e.g., Health Score"
                disabled={isCreating}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="field-type">Field Type</Label>
              <select
                id="field-type"
                value={fieldType}
                onChange={(e) => setFieldType(e.target.value)}
                disabled={isCreating}
                className="w-full px-3 py-2 border-2 border-foreground/20 bg-background text-sm"
              >
                {FIELD_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>

            {error && (
              <Alert variant="error">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </div>
        </DialogPanel>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isCreating}
          >
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={isCreating || !fieldName.trim()}>
            {isCreating ? (
              <>
                <Spinner className="h-4 w-4" />
                Creating...
              </>
            ) : (
              <>
                <Plus className="h-4 w-4" />
                Create Field
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  )
}
