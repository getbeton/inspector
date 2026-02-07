'use client';

/**
 * Threshold Warning Banner
 *
 * Displays warning banners when workspace is approaching or has exceeded
 * the free tier MTU limit. Shows different messages based on threshold level.
 *
 * Levels:
 * - warning_90: 90% of free tier used - yellow warning
 * - warning_95: 95% of free tier used - orange urgent warning
 * - exceeded: Over 100% - red critical warning with access restricted message
 */

import { useState } from 'react';
import { AlertTriangle, X, CreditCard } from 'lucide-react';
import { Alert, AlertTitle, AlertDescription, AlertAction } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useBillingStatus, useThresholdLevel } from '@/lib/hooks/use-billing';
import { CardLinkingModal } from './card-linking-modal';

// ============================================
// Types
// ============================================

type ThresholdLevel = 'normal' | 'warning_90' | 'warning_95' | 'exceeded';

interface ThresholdWarningBannerProps {
  /**
   * Override the threshold level (useful for testing or forced display).
   */
  forceLevel?: ThresholdLevel;
  /**
   * Callback when card is added successfully.
   */
  onCardAdded?: () => void;
  /**
   * Allow user to dismiss the banner for this session.
   */
  dismissible?: boolean;
  /**
   * Compact mode for smaller displays.
   */
  compact?: boolean;
}

// ============================================
// Content Configuration
// ============================================

interface ThresholdContent {
  variant: 'warning' | 'error';
  title: string;
  description: string;
  ctaText: string;
  showProgress?: boolean;
}

function getThresholdContent(
  level: ThresholdLevel,
  mtuCurrent: number,
  mtuLimit: number
): ThresholdContent | null {
  const remaining = Math.max(0, mtuLimit - mtuCurrent);

  switch (level) {
    case 'warning_90':
      return {
        variant: 'warning',
        title: '90% of free tier used',
        description: `You've used ${mtuCurrent.toLocaleString()} of your ${mtuLimit.toLocaleString()} free MTUs this month. Add a payment method to avoid service interruption.`,
        ctaText: 'Add Payment Method',
        showProgress: true,
      };

    case 'warning_95':
      return {
        variant: 'warning',
        title: '95% of free tier used – Action required',
        description: `Only ${remaining.toLocaleString()} MTUs remaining. Add a payment method now to continue using Beton Inspector without interruption.`,
        ctaText: 'Add Payment Method',
        showProgress: true,
      };

    case 'exceeded':
      return {
        variant: 'error',
        title: 'Free tier limit exceeded',
        description: `You've exceeded your ${mtuLimit.toLocaleString()} free MTU limit. Add a payment method to restore full access. You'll only be charged for usage above the free tier.`,
        ctaText: 'Restore Access',
        showProgress: false,
      };

    case 'normal':
    default:
      return null;
  }
}

// ============================================
// Main Component
// ============================================

export function ThresholdWarningBanner({
  forceLevel,
  onCardAdded,
  dismissible = true,
  compact = false,
}: ThresholdWarningBannerProps) {
  const [dismissed, setDismissed] = useState(false);
  const { level: detectedLevel, isLoading: levelLoading } = useThresholdLevel();
  const { data: billingStatus, isLoading: statusLoading } = useBillingStatus();

  // Use forced level or detected level
  const level = forceLevel ?? detectedLevel;

  // Don't show if loading, dismissed, or has payment method (unless exceeded)
  const isLoading = levelLoading || statusLoading;

  if (isLoading) {
    return null;
  }

  if (dismissed) {
    return null;
  }

  // Don't show if user has a payment method (they can exceed freely)
  // Exception: Always show 'exceeded' level until they add a card or access is restored
  if (billingStatus?.hasPaymentMethod && level !== 'exceeded') {
    return null;
  }

  // Get content for this level
  const mtuCurrent = billingStatus?.mtu?.current ?? 0;
  const mtuLimit = billingStatus?.mtu?.limit ?? 200;
  const content = getThresholdContent(level, mtuCurrent, mtuLimit);

  // Don't show if no content (normal level)
  if (!content) {
    return null;
  }

  const percentUsed = Math.round((mtuCurrent / mtuLimit) * 100);

  // Compact version
  if (compact) {
    return (
      <Alert variant={content.variant}>
        <AlertTriangle className="size-4" />
        <AlertTitle className="text-sm">{content.title}</AlertTitle>
        <AlertAction>
          <CardLinkingModal
            trigger={
              <Button size="sm" variant={content.variant === 'error' ? 'destructive' : 'default'}>
                <CreditCard className="size-3.5" />
                {content.ctaText}
              </Button>
            }
            onSuccess={onCardAdded}
          />
        </AlertAction>
      </Alert>
    );
  }

  // Full version
  return (
    <Alert variant={content.variant}>
      <AlertTriangle className="size-4" />
      <AlertTitle>{content.title}</AlertTitle>
      <AlertDescription>
        <p className="mb-3">{content.description}</p>
        {content.showProgress && (
          <div className="mb-3">
            <div className="h-2 rounded-full bg-muted">
              <div
                className={`h-2 rounded-full transition-all ${
                  content.variant === 'error' ? 'bg-destructive' : 'bg-warning'
                }`}
                style={{ width: `${Math.min(100, percentUsed)}%` }}
              />
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              {percentUsed}% of free tier used
            </div>
          </div>
        )}
      </AlertDescription>
      <AlertAction>
        <div className="flex gap-2">
          {dismissible && level !== 'exceeded' && (
            <Button size="sm" variant="ghost" onClick={() => setDismissed(true)}>
              <X className="size-3.5" />
              Dismiss
            </Button>
          )}
          <CardLinkingModal
            trigger={
              <Button size="sm" variant={content.variant === 'error' ? 'destructive' : 'default'}>
                <CreditCard className="size-3.5" />
                {content.ctaText}
              </Button>
            }
            onSuccess={onCardAdded}
          />
        </div>
      </AlertAction>
    </Alert>
  );
}

// ============================================
// Dashboard Banner Variant
// ============================================

/**
 * A sticky banner for the top of the dashboard.
 * Only shows when threshold is at warning_95 or exceeded.
 */
export function DashboardThresholdBanner({ onCardAdded }: { onCardAdded?: () => void }) {
  const { level } = useThresholdLevel();
  const { data: billingStatus } = useBillingStatus();

  // Only show for urgent levels
  if (level !== 'warning_95' && level !== 'exceeded') {
    return null;
  }

  // Don't show if user already has payment method (except exceeded without access)
  if (billingStatus?.hasPaymentMethod && billingStatus?.threshold?.canAccess) {
    return null;
  }

  const isExceeded = level === 'exceeded';
  const mtuLimit = billingStatus?.mtu?.limit ?? 200;

  return (
    <div
      className={`sticky top-0 z-40 px-4 py-3 ${
        isExceeded
          ? 'bg-destructive text-destructive-foreground'
          : 'bg-warning text-warning-foreground'
      }`}
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <AlertTriangle className="size-4 shrink-0" />
          <span className="text-sm font-medium">
            {isExceeded
              ? `Free tier limit exceeded. Add a payment method to restore access.`
              : `You've used 95% of your ${mtuLimit.toLocaleString()} free MTUs.`}
          </span>
        </div>
        <CardLinkingModal
          trigger={
            <Button
              size="sm"
              variant={isExceeded ? 'outline' : 'secondary'}
              className={isExceeded ? 'border-white/30 text-white hover:bg-white/10' : ''}
            >
              <CreditCard className="size-3.5" />
              {isExceeded ? 'Restore Access' : 'Add Card'}
            </Button>
          }
          onSuccess={onCardAdded}
        />
      </div>
    </div>
  );
}

// ============================================
// Access Blocked Overlay
// ============================================

/**
 * Full-page overlay when access is blocked due to exceeding limits.
 * Shows over the entire app content when canAccess is false.
 */
export function AccessBlockedOverlay({ onCardAdded }: { onCardAdded?: () => void }) {
  const { data: billingStatus, isLoading } = useBillingStatus();

  // Don't show overlay while loading or if user has access
  if (isLoading || billingStatus?.threshold?.canAccess !== false) {
    return null;
  }

  const mtuCurrent = billingStatus?.mtu?.current ?? 0;
  const mtuLimit = billingStatus?.mtu?.limit ?? 200;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <div className="mx-4 max-w-md rounded-2xl border bg-card p-8 text-center shadow-xl">
        <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-full bg-destructive/10">
          <AlertTriangle className="size-8 text-destructive" />
        </div>
        <h2 className="mb-2 text-xl font-semibold">Access Restricted</h2>
        <p className="mb-2 text-muted-foreground">
          Your workspace has exceeded the free tier limit of {mtuLimit.toLocaleString()} monthly
          tracked users.
        </p>
        <p className="mb-6 text-sm text-muted-foreground">
          Current usage: <span className="font-medium">{mtuCurrent.toLocaleString()} MTUs</span>
        </p>
        <CardLinkingModal
          trigger={
            <Button size="lg" className="w-full">
              <CreditCard />
              Add Payment Method to Continue
            </Button>
          }
          onSuccess={onCardAdded}
        />
        <p className="mt-4 text-xs text-muted-foreground">
          You&apos;ll only be charged for usage above the free tier ($0.02/MTU).
        </p>
      </div>
    </div>
  );
}
