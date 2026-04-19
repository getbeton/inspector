import { cva, type VariantProps } from "class-variance-authority"
import type * as React from "react"

import { cn } from "@/lib/utils"

/**
 * Neobrutalist stat card — the 4-column grid used on Home/Signals/Identities.
 * Fixed color pairings per role (neutral/primary/success/warning/destructive).
 *
 * Pattern: border-2 border-foreground/20 + hard-offset block shadow.
 * Value color is the only thing that changes between tones.
 */
const statValueVariants = cva(
  "mt-1.5 text-3xl font-bold leading-none",
  {
    defaultVariants: { tone: "neutral" },
    variants: {
      tone: {
        neutral: "text-foreground",
        primary: "text-primary",
        success: "text-success",
        warning: "text-warning-foreground",
        destructive: "text-destructive",
      },
    },
  },
)

type StatTone = VariantProps<typeof statValueVariants>["tone"]

interface StatCardProps extends React.HTMLAttributes<HTMLDivElement> {
  label: string
  value: React.ReactNode
  meta?: React.ReactNode
  tone?: StatTone
}

function StatCard({
  label,
  value,
  meta,
  tone,
  className,
  ...props
}: StatCardProps) {
  return (
    <div
      className={cn(
        "flex flex-col border-2 border-foreground/20 bg-card p-5 shadow-[var(--shadow-card)]",
        className,
      )}
      data-slot="stat-card"
      {...props}
    >
      <span className="font-heading text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <span className={statValueVariants({ tone })}>{value}</span>
      {meta ? (
        <span className="mt-1.5 text-xs text-muted-foreground">{meta}</span>
      ) : null}
    </div>
  )
}

function StatCardGrid({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  )
}

export { StatCard, StatCardGrid, type StatCardProps, type StatTone }
