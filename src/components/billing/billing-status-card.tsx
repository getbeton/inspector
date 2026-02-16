'use client';

/**
 * Billing Status Card
 *
 * Displays the current billing status, MTU usage, and subscription details.
 * Used in settings page and dashboard to show billing information.
 *
 * Features:
 * - MTU usage progress bar
 * - Subscription status badge
 * - Payment method info
 * - Quick actions (add card, manage billing)
 */

import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CreditCard, ExternalLink, Settings, AlertTriangle } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress, ProgressTrack, ProgressIndicator } from '@/components/ui/progress';
import { Spinner } from '@/components/ui/spinner';
import { useBillingStatus, usePaymentMethods, useCreatePortalSession } from '@/lib/hooks/use-billing';
import { CardLinkingModal } from './card-linking-modal';

// ============================================
// Types
// ============================================

interface BillingStatusCardProps {
  /**
   * Show compact version with less detail.
   */
  compact?: boolean;
  /**
   * Callback when card is added successfully.
   */
  onCardAdded?: () => void;
}

// ============================================
// Helper Components
// ============================================

function StatusBadge({ status }: { status: string }) {
  const variants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
    active: 'default',
    free: 'secondary',
    card_required: 'destructive',
    suspended: 'destructive',
  };

  const labels: Record<string, string> = {
    active: 'Active',
    free: 'Free Tier',
    card_required: 'Card Required',
    suspended: 'Suspended',
  };

  return (
    <Badge variant={variants[status] || 'outline'}>
      {labels[status] || status}
    </Badge>
  );
}

function UsageProgressBar({
  current,
  limit,
  percentUsed,
}: {
  current: number;
  limit: number;
  percentUsed: number;
}) {
  // Determine color based on usage
  let indicatorClass = 'bg-primary';
  if (percentUsed >= 100) {
    indicatorClass = 'bg-destructive';
  } else if (percentUsed >= 95) {
    indicatorClass = 'bg-destructive';
  } else if (percentUsed >= 90) {
    indicatorClass = 'bg-warning';
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">Monthly Tracked Users (MTU)</span>
        <span className="font-medium">
          {(current ?? 0).toLocaleString()} / {(limit ?? 0).toLocaleString()}
        </span>
      </div>
      <Progress value={Math.min(100, percentUsed)}>
        <ProgressTrack>
          <ProgressIndicator className={indicatorClass} />
        </ProgressTrack>
      </Progress>
      {percentUsed >= 90 && (
        <div className="flex items-center gap-1 text-xs text-warning">
          <AlertTriangle className="size-3" />
          <span>
            {percentUsed >= 100
              ? 'Free tier limit exceeded'
              : `${Math.round(percentUsed)}% of free tier used`}
          </span>
        </div>
      )}
    </div>
  );
}

function PaymentMethodDisplay({
  paymentMethods,
}: {
  paymentMethods: Array<{
    id: string;
    cardBrand: string | null;
    cardLastFour: string | null;
    isDefault: boolean;
  }>;
}) {
  const defaultMethod = paymentMethods.find((pm) => pm.isDefault) || paymentMethods[0];

  if (!defaultMethod) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <CreditCard className="size-4" />
        <span>No payment method</span>
      </div>
    );
  }

  const brandIcons: Record<string, string> = {
    visa: '💳',
    mastercard: '💳',
    amex: '💳',
    discover: '💳',
  };

  return (
    <div className="flex items-center gap-2 text-sm">
      <span>{brandIcons[defaultMethod.cardBrand?.toLowerCase() || ''] || '💳'}</span>
      <span className="capitalize">{defaultMethod.cardBrand || 'Card'}</span>
      <span className="text-muted-foreground">•••• {defaultMethod.cardLastFour}</span>
    </div>
  );
}

// ============================================
// Main Component
// ============================================

export function BillingStatusCard({ compact = false, onCardAdded }: BillingStatusCardProps) {
  const { data: billingStatus, isLoading: statusLoading, error: statusError } = useBillingStatus();
  const { data: paymentMethods = [], isLoading: methodsLoading } = usePaymentMethods();
  const portalSession = useCreatePortalSession();
  const queryClient = useQueryClient();
  const mtuCalcTriggered = useRef(false);

  // First-load MTU calculation: if MTU is 0 but limit > 0, trigger a one-time calculation
  useEffect(() => {
    if (
      billingStatus &&
      billingStatus.mtu.current === 0 &&
      billingStatus.mtu.limit > 0 &&
      !mtuCalcTriggered.current
    ) {
      mtuCalcTriggered.current = true;
      fetch('/api/billing/calculate-mtu', { method: 'POST', credentials: 'include' })
        .then(res => {
          if (res.ok) {
            queryClient.invalidateQueries({ queryKey: ['billing'] });
          }
        })
        .catch(() => {
          // Non-critical — cron will eventually update this
        });
    }
  }, [billingStatus, queryClient]);

  const isLoading = statusLoading || methodsLoading;

  // Loading state
  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Spinner className="size-6" />
        </CardContent>
      </Card>
    );
  }

  // Error state
  if (statusError) {
    return (
      <Card>
        <CardContent className="py-6">
          <div className="text-center text-sm text-muted-foreground">
            Unable to load billing information
          </div>
        </CardContent>
      </Card>
    );
  }

  // No billing status (billing might be disabled)
  if (!billingStatus) {
    return null;
  }

  // Calculate remaining days in billing cycle
  const daysRemaining = billingStatus.subscription?.currentPeriodEnd
    ? Math.max(0, Math.ceil((new Date(billingStatus.subscription.currentPeriodEnd).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : null;

  // Compact version for dashboard
  if (compact) {
    return (
      <Card>
        <CardContent className="py-4">
          <div className="flex items-center justify-between">
            <div className="space-y-1.5 flex-1 mr-4">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">Billing</span>
                <StatusBadge status={billingStatus.status} />
              </div>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      billingStatus.mtu.percentUsed >= 90 ? 'bg-destructive' :
                      billingStatus.mtu.percentUsed >= 80 ? 'bg-warning' : 'bg-primary'
                    }`}
                    style={{ width: `${Math.min(100, billingStatus.mtu.percentUsed)}%` }}
                  />
                </div>
                <span className="text-xs text-muted-foreground shrink-0">
                  {(billingStatus.mtu?.current ?? 0).toLocaleString()} / {(billingStatus.mtu?.limit ?? 0).toLocaleString()} MTU
                </span>
              </div>
              {daysRemaining !== null && (
                <p className="text-xs text-muted-foreground">
                  {daysRemaining} days remaining in cycle
                </p>
              )}
            </div>
            {!billingStatus.hasPaymentMethod && billingStatus.mtu.percentUsed >= 80 && (
              <CardLinkingModal
                trigger={<Button size="sm">Add Card</Button>}
                onSuccess={onCardAdded}
              />
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  // Full version for settings
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Billing</CardTitle>
            <CardDescription>
              Manage your subscription and payment methods
            </CardDescription>
          </div>
          <StatusBadge status={billingStatus.status} />
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* MTU Usage */}
        <UsageProgressBar
          current={billingStatus.mtu.current}
          limit={billingStatus.mtu.limit}
          percentUsed={billingStatus.mtu.percentUsed}
        />

        {/* Billing Cycle Info */}
        <div className="space-y-2">
          <div className="text-sm font-medium">Billing Cycle</div>
          <div className="rounded-lg border bg-muted/50 p-3 space-y-2">
            {billingStatus.subscription?.hasSubscription && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Status</span>
                <Badge variant="outline" className="capitalize">
                  {billingStatus.subscription.status}
                </Badge>
              </div>
            )}
            {billingStatus.subscription?.currentPeriodEnd && (
              <>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Next billing date</span>
                  <span>
                    {new Date(billingStatus.subscription.currentPeriodEnd).toLocaleDateString()}
                  </span>
                </div>
                {daysRemaining !== null && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Days remaining</span>
                    <span>{daysRemaining}</span>
                  </div>
                )}
              </>
            )}
            {billingStatus.mtu.current > 0 && daysRemaining !== null && daysRemaining > 0 && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Daily avg MTU</span>
                <span>
                  {Math.round(billingStatus.mtu.current / Math.max(1, 30 - daysRemaining)).toLocaleString()}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Payment Method */}
        <div className="space-y-2">
          <div className="text-sm font-medium">Payment Method</div>
          <div className="rounded-lg border bg-muted/50 p-3">
            <PaymentMethodDisplay paymentMethods={paymentMethods} />
          </div>
        </div>

        {/* Pricing Info */}
        <div className="rounded-lg border bg-muted/50 p-3 space-y-1">
          <div className="text-sm font-medium">Pricing</div>
          <div className="text-xs text-muted-foreground">
            Free tier: up to {(billingStatus.mtu?.limit ?? 0).toLocaleString()} monthly tracked users
          </div>
          {billingStatus.pricing ? (
            <div className="text-xs text-muted-foreground">
              After {(billingStatus.mtu?.limit ?? 0).toLocaleString()} MTU: {billingStatus.pricing.pricePerMtu} per MTU
            </div>
          ) : (
            <div className="text-xs text-muted-foreground">
              After {(billingStatus.mtu?.limit ?? 0).toLocaleString()} MTU: Usage-based pricing
            </div>
          )}
          {!billingStatus.hasPaymentMethod && (
            <div className="text-xs text-muted-foreground italic">
              Until you link a card, Beton will track signals only for {(billingStatus.mtu?.limit ?? 0).toLocaleString()} first users
            </div>
          )}
        </div>
      </CardContent>
      <CardFooter className="flex gap-2">
        {!billingStatus.hasPaymentMethod ? (
          <CardLinkingModal
            trigger={
              <Button>
                <CreditCard />
                Subscribe by linking a card
              </Button>
            }
            onSuccess={onCardAdded}
          />
        ) : (
          <Button
            variant="outline"
            onClick={() => portalSession.mutate()}
            disabled={portalSession.isPending}
          >
            {portalSession.isPending ? (
              <Spinner className="size-4" />
            ) : (
              <Settings />
            )}
            Manage Billing
            <ExternalLink className="size-3" />
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}
