"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { toastManager } from "@/components/ui/toast";
import { Select, SelectTrigger, SelectPopup, SelectItem } from "@/components/ui/select";
import { Check, SkipForward } from "lucide-react";
import { useSlackConfig, useSlackChannels, useUpdateSlackChannel } from "@/lib/hooks/use-slack";

export interface SlackSetupStepProps {
  onSuccess: () => void;
  onSkip: () => void;
  className?: string;
}

/**
 * Setup wizard step for connecting Slack.
 *
 * Flow:
 * 1. Not connected → "Add to Slack" button → OAuth flow → redirects back
 * 2. Connected → channel picker inline
 * 3. Channel selected → "Continue" button
 */
export function SlackSetupStep({ onSuccess, onSkip }: SlackSetupStepProps) {
  const { data: config, isLoading: configLoading, refetch } = useSlackConfig();
  const [fetchChannels, setFetchChannels] = useState(false);
  const { data: channels, isLoading: channelsLoading } = useSlackChannels(fetchChannels);
  const updateChannel = useUpdateSlackChannel();

  const isConnected = config?.connected === true;
  const hasChannel = !!config?.channelId;

  // Detect return from OAuth
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("slack") === "connected") {
      toastManager.add({ type: "success", title: "Slack connected successfully" });
      // Clean URL params
      const url = new URL(window.location.href);
      url.searchParams.delete("slack");
      window.history.replaceState({}, "", url.toString());
      // Refetch config to pick up new connection
      refetch();
    }
  }, [refetch]);

  // Auto-fetch channels when connected but no channel yet
  useEffect(() => {
    if (isConnected && !hasChannel) {
      setFetchChannels(true);
    }
  }, [isConnected, hasChannel]);

  const handleSelectChannel = async (channelId: string | null) => {
    if (!channelId) return;
    const channel = channels?.find((c) => c.id === channelId);
    if (!channel) return;

    try {
      await updateChannel.mutateAsync({
        channelId: channel.id,
        channelName: channel.name,
      });
      toastManager.add({ type: "success", title: `Channel set to #${channel.name}` });
      refetch();
    } catch {
      toastManager.add({ type: "error", title: "Failed to save channel" });
    }
  };

  if (configLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Spinner className="size-5" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <div className="h-5 w-5 rounded flex items-center justify-center">
          <SlackIcon className="h-5 w-5" />
        </div>
        <span className="font-medium">Connect Slack</span>
        <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">(Optional)</span>
      </div>

      <p className="text-sm text-muted-foreground">
        Get real-time signal notifications in your team&apos;s Slack channel.
      </p>

      {/* State: Not connected */}
      {!isConnected && (
        <div className="space-y-3">
          <a href="/api/integrations/slack/install?return_to=setup">
            <Button className="bg-[#4A154B] hover:bg-[#3a1139] text-white">
              <SlackIcon className="mr-2 size-4" />
              Add to Slack
            </Button>
          </a>
          <div>
            <button
              type="button"
              onClick={onSkip}
              className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <SkipForward className="size-3.5" />
              Skip for now
            </button>
          </div>
        </div>
      )}

      {/* State: Connected, picking channel */}
      {isConnected && !hasChannel && (
        <div className="space-y-3">
          <div className="rounded-lg border border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/30 p-3">
            <p className="text-sm text-green-800 dark:text-green-200 font-medium flex items-center gap-1.5">
              <Check className="size-4" />
              Connected to {config?.teamName}
            </p>
          </div>

          <div>
            <label className="text-sm font-medium block mb-1.5">
              Select a channel for notifications
            </label>
            {channelsLoading ? (
              <div className="flex items-center gap-2 py-2">
                <Spinner className="size-4" />
                <span className="text-sm text-muted-foreground">Loading channels...</span>
              </div>
            ) : (
              <Select value="" onValueChange={handleSelectChannel}>
                <SelectTrigger disabled={updateChannel.isPending}>
                  <span className="truncate text-muted-foreground">Choose a channel...</span>
                </SelectTrigger>
                <SelectPopup className="max-h-60 overflow-y-auto">
                  {channels?.map((ch) => (
                    <SelectItem key={ch.id} value={ch.id}>
                      <span className="flex items-center gap-2">
                        {ch.is_private ? (
                          <svg className="size-3.5 text-muted-foreground" viewBox="0 0 16 16" fill="currentColor">
                            <path d="M4 6V4a4 4 0 1 1 8 0v2h1a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h1zm2 0h4V4a2 2 0 1 0-4 0v2z" />
                          </svg>
                        ) : (
                          <span className="text-muted-foreground">#</span>
                        )}
                        <span>{ch.name}</span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectPopup>
              </Select>
            )}
          </div>

          <button
            type="button"
            onClick={onSkip}
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <SkipForward className="size-3.5" />
            Skip for now
          </button>
        </div>
      )}

      {/* State: Fully configured */}
      {isConnected && hasChannel && (
        <div className="space-y-3">
          <div className="rounded-lg border border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/30 p-3">
            <p className="text-sm text-green-800 dark:text-green-200 font-medium flex items-center gap-1.5">
              <Check className="size-4" />
              Connected to {config?.teamName}
            </p>
            <p className="text-xs text-green-600 dark:text-green-400 mt-1">
              Notifications will be sent to #{config?.channelName}
            </p>
          </div>

          <Button onClick={onSuccess}>Continue</Button>
        </div>
      )}
    </div>
  );
}

// ── Slack Icon ──────────────────────────────────────────────────

function SlackIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z" />
    </svg>
  );
}
