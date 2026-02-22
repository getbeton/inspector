"use client"

import { cn } from "@/lib/utils"
import { resolveTemplate } from "../fields/TemplateInput"
import type { SampleData } from "@/lib/setup/sample-data"

interface SlackNotificationPreviewProps {
  dealNameTemplate: string
  notificationText: string
  sampleData: SampleData
  /** PostHog host URL for building the user deep link (e.g., "https://us.posthog.com") */
  posthogHost?: string | null
  className?: string
}

/**
 * Slack notification mockup for the preview panel.
 * Shows what a Beton signal notification looks like in Slack.
 * Resolves template variables against sample data.
 *
 * Displays company domain, user email, and PostHog deep link icon.
 */
export function SlackNotificationPreview({
  dealNameTemplate,
  notificationText,
  sampleData,
  posthogHost,
  className,
}: SlackNotificationPreviewProps) {
  const resolvedName = resolveTemplate(dealNameTemplate || "New Signal Detected", sampleData)
  const resolvedNotification = resolveTemplate(notificationText || "New deal signal detected", sampleData)

  return (
    <div className={cn("rounded-lg border-2 border-foreground/10 bg-white overflow-hidden", className)}>
      {/* Slack header */}
      <div className="flex items-center gap-2 px-4 py-2.5 bg-[#4A154B]">
        <svg className="h-4 w-4 text-white" viewBox="0 0 24 24" fill="currentColor">
          <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z" />
        </svg>
        <span className="text-white text-xs font-medium">#sales-signals</span>
      </div>

      {/* Message body */}
      <div className="p-4 space-y-3">
        {/* Bot info */}
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded bg-foreground flex items-center justify-center">
            <span className="text-background font-bold text-xs">B</span>
          </div>
          <div>
            <span className="text-sm font-bold text-gray-900">Beton Inspector</span>
            <span className="text-xs text-gray-500 ml-1">APP</span>
            <span className="text-xs text-gray-400 ml-2">Just now</span>
          </div>
        </div>

        {/* Signal notification — resolved from user-editable template */}
        <div className="text-sm text-gray-800">
          {resolvedNotification}
        </div>

        {/* Embedded deal card */}
        <div className="border-l-4 border-primary rounded bg-gray-50 p-3 space-y-2">
          <div className="font-semibold text-sm text-gray-900">{resolvedName}</div>
          <div className="space-y-1">
            {/* Company with domain */}
            <div className="flex items-center gap-2 text-xs">
              <span className="text-gray-500 w-20">Company</span>
              <span className="text-gray-800 font-medium">{sampleData.company_name}</span>
              <span className="text-gray-400 font-mono text-[10px]">{sampleData.company_domain}</span>
            </div>
            {/* User with email + PostHog icon */}
            <div className="flex items-center gap-2 text-xs">
              <span className="text-gray-500 w-20">User</span>
              <span className="text-gray-800 font-mono text-[10px]">{sampleData.user_email}</span>
              {posthogHost ? (
                <a
                  href={posthogHost}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center text-muted-foreground hover:text-foreground transition-colors"
                  title="View in PostHog"
                >
                  <picture>
                    <source
                      srcSet="https://cdn.brandfetch.io/id2veLU_gI/theme/dark/symbol.svg"
                      media="(prefers-color-scheme: dark)"
                    />
                    <img
                      src="https://cdn.brandfetch.io/id2veLU_gI/theme/light/symbol.svg"
                      alt="PostHog"
                      className="h-4 w-4"
                    />
                  </picture>
                </a>
              ) : (
                <span className="inline-flex items-center opacity-40" title="Connect PostHog to enable deep links">
                  <picture>
                    <source
                      srcSet="https://cdn.brandfetch.io/id2veLU_gI/theme/dark/symbol.svg"
                      media="(prefers-color-scheme: dark)"
                    />
                    <img
                      src="https://cdn.brandfetch.io/id2veLU_gI/theme/light/symbol.svg"
                      alt=""
                      className="h-4 w-4"
                    />
                  </picture>
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="text-gray-500 w-20">Signal</span>
              <span className="text-gray-800">{sampleData.signal_name}</span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="text-gray-500 w-20">Health</span>
              <span className="text-gray-800">{sampleData.health_score}/100</span>
            </div>
          </div>
        </div>

        {/* Action buttons (decorative — part of the Slack mockup) */}
        <div className="flex gap-2" aria-hidden="true">
          <span className="px-3 py-1 text-xs font-medium border border-gray-300 rounded bg-white text-gray-700">
            View in Attio
          </span>
          <span className="px-3 py-1 text-xs font-medium border border-gray-300 rounded bg-white text-gray-700">
            View Signal
          </span>
        </div>
      </div>
    </div>
  )
}
