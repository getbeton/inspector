'use client';

/**
 * Card Linking Modal
 *
 * A dialog that guides users through adding a payment method to their workspace.
 * Uses Stripe Elements for secure card collection.
 *
 * Features:
 * - Multi-step flow (info → card input → confirmation)
 * - Stripe Payment Element for PCI-compliant card collection
 * - Loading states and error handling
 * - Success callback for integration
 */

import { useState, useCallback } from 'react';
import { useStripe, useElements, PaymentElement } from '@stripe/react-stripe-js';
import { CreditCard, CheckCircle2, AlertCircle, Shield, Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogTrigger,
  DialogPopup,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogPanel,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { StripeElementsProvider } from './stripe-provider';
import {
  useCreateSetupIntent,
  useCompleteSetup,
  useBillingStatus,
} from '@/lib/hooks/use-billing';

// ============================================
// Types
// ============================================

type Step = 'info' | 'card' | 'processing' | 'success' | 'error';

interface CardLinkingModalProps {
  /**
   * Optional trigger element. If not provided, uses the default button.
   */
  trigger?: React.ReactNode;
  /**
   * Callback when card linking is completed successfully.
   */
  onSuccess?: () => void;
  /**
   * Whether to open the modal automatically.
   */
  open?: boolean;
  /**
   * Callback when modal open state changes.
   */
  onOpenChange?: (open: boolean) => void;
}

// ============================================
// Inner Form Component (needs Stripe context)
// ============================================

interface CardFormProps {
  onSuccess: () => void;
  onError: (message: string) => void;
  onProcessing: (processing: boolean) => void;
}

function CardForm({ onSuccess, onError, onProcessing }: CardFormProps) {
  const stripe = useStripe();
  const elements = useElements();
  const completeSetup = useCompleteSetup();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!stripe || !elements) {
      onError('Stripe has not loaded yet. Please try again.');
      return;
    }

    setIsSubmitting(true);
    onProcessing(true);

    try {
      // Confirm the SetupIntent with Stripe
      const { error, setupIntent } = await stripe.confirmSetup({
        elements,
        redirect: 'if_required',
      });

      if (error) {
        throw new Error(error.message || 'Failed to confirm card');
      }

      if (!setupIntent || setupIntent.status !== 'succeeded') {
        throw new Error('Card setup did not complete successfully');
      }

      // Extract payment method ID from the confirmed SetupIntent
      const paymentMethodId = setupIntent.payment_method;
      if (!paymentMethodId || typeof paymentMethodId !== 'string') {
        throw new Error('No payment method returned from Stripe');
      }

      // Complete the setup on our backend
      await completeSetup.mutateAsync({ setupIntentId: setupIntent.id, paymentMethodId });

      onSuccess();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'An unexpected error occurred';
      onError(message);
    } finally {
      setIsSubmitting(false);
      onProcessing(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <PaymentElement
        options={{
          layout: 'tabs',
        }}
      />
      <Button
        type="submit"
        className="w-full"
        disabled={!stripe || !elements || isSubmitting}
      >
        {isSubmitting ? (
          <>
            <Loader2 className="animate-spin" />
            Processing...
          </>
        ) : (
          <>
            <CreditCard />
            Subscribe
          </>
        )}
      </Button>
    </form>
  );
}

// ============================================
// Main Component
// ============================================

export function CardLinkingModal({
  trigger,
  onSuccess,
  open: controlledOpen,
  onOpenChange,
}: CardLinkingModalProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [step, setStep] = useState<Step>('info');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);

  const createSetupIntent = useCreateSetupIntent();
  const { data: billingStatus } = useBillingStatus();

  // Use controlled or uncontrolled open state
  const open = controlledOpen ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;

  // Reset state when modal opens/closes
  const handleOpenChange = useCallback(
    (newOpen: boolean) => {
      setOpen(newOpen);
      if (!newOpen) {
        // Reset state when closing
        setTimeout(() => {
          setStep('info');
          setErrorMessage(null);
          setClientSecret(null);
        }, 300);
      }
    },
    [setOpen]
  );

  // Start the card setup flow
  // IMPORTANT: We fetch the clientSecret BEFORE transitioning to the 'card' step
  // to avoid a race condition where React swaps DOM nodes while Stripe is initializing.
  // This prevents the "removeChild" error from Stripe's iframe management code.
  const handleStartSetup = async () => {
    setErrorMessage(null);
    // Keep showing 'info' step with loading state while fetching

    try {
      const result = await createSetupIntent.mutateAsync();
      setClientSecret(result.clientSecret);
      // Only NOW switch to card step, with clientSecret already available
      setStep('card');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to start setup';
      setErrorMessage(message);
      setStep('error');
    }
  };

  // Handle successful card setup
  const handleSuccess = () => {
    setStep('success');
    onSuccess?.();
  };

  // Handle card setup error
  const handleError = (message: string) => {
    setErrorMessage(message);
    setStep('error');
  };

  // Render step content
  const renderStepContent = () => {
    switch (step) {
      case 'info':
        return (
          <>
            <DialogHeader>
              <DialogTitle>Subscribe to Beton</DialogTitle>
              <DialogDescription>
                Link a card to continue tracking signals beyond the free tier
              </DialogDescription>
            </DialogHeader>
            <DialogPanel>
              <div className="space-y-4">
                {/* Current usage info */}
                {billingStatus && (
                  <div className="rounded-lg border bg-muted/50 p-4">
                    <div className="text-sm text-muted-foreground">Current Usage</div>
                    <div className="mt-1 text-2xl font-semibold">
                      {(billingStatus.mtu?.current ?? 0).toLocaleString()} / {(billingStatus.mtu?.limit ?? 0).toLocaleString()} MTU
                    </div>
                    <div className="mt-1 h-2 rounded-full bg-muted">
                      <div
                        className="h-2 rounded-full bg-primary transition-all"
                        style={{ width: `${Math.min(100, billingStatus.mtu?.percentUsed ?? 0)}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Benefits */}
                <div className="space-y-3">
                  <h4 className="font-medium">Why add a payment method?</h4>
                  <ul className="space-y-2 text-sm text-muted-foreground">
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />
                      <span>Unlimited access beyond free tier</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />
                      <span>
                        Pay only for what you use ({billingStatus?.pricing?.pricePerMtu ?? 'usage-based pricing'}/MTU)
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />
                      <span>
                        No charge until you exceed {(billingStatus?.mtu?.limit ?? 0).toLocaleString()} MTU free tier
                      </span>
                    </li>
                  </ul>
                </div>

                {/* Security note */}
                <div className="flex items-start gap-2 text-xs text-muted-foreground">
                  <Shield className="mt-0.5 size-3.5 shrink-0" />
                  <span>
                    Your payment info is securely handled by Stripe. We never store your card details.
                  </span>
                </div>
              </div>
            </DialogPanel>
            <DialogFooter>
              <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
              <Button onClick={handleStartSetup} disabled={createSetupIntent.isPending}>
                {createSetupIntent.isPending ? (
                  <>
                    <Loader2 className="animate-spin" />
                    Loading...
                  </>
                ) : (
                  <>
                    <CreditCard />
                    Continue
                  </>
                )}
              </Button>
            </DialogFooter>
          </>
        );

      case 'card':
        // clientSecret is guaranteed to be available here since we only transition
        // to this step AFTER the SetupIntent is created in handleStartSetup()
        return (
          <>
            <DialogHeader>
              <DialogTitle>Enter Card Details</DialogTitle>
              <DialogDescription>
                Your card will only be charged after you exceed the free tier
              </DialogDescription>
            </DialogHeader>
            <DialogPanel>
              <StripeElementsProvider clientSecret={clientSecret!}>
                <CardForm
                  onSuccess={handleSuccess}
                  onError={handleError}
                  onProcessing={() => {}}
                />
              </StripeElementsProvider>
            </DialogPanel>
            <DialogFooter variant="bare">
              <Button variant="ghost" onClick={() => setStep('info')}>
                Back
              </Button>
            </DialogFooter>
          </>
        );

      case 'processing':
        return (
          <>
            <DialogHeader>
              <DialogTitle>Processing...</DialogTitle>
              <DialogDescription>
                Please wait while we set up your payment method
              </DialogDescription>
            </DialogHeader>
            <DialogPanel>
              <div className="flex flex-col items-center justify-center py-8 gap-4">
                <Loader2 className="size-8 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">This may take a moment</p>
              </div>
            </DialogPanel>
          </>
        );

      case 'success':
        return (
          <>
            <DialogHeader>
              <DialogTitle>Payment Method Added</DialogTitle>
              <DialogDescription>
                Your card has been successfully linked
              </DialogDescription>
            </DialogHeader>
            <DialogPanel>
              <div className="flex flex-col items-center justify-center py-8 gap-4">
                <div className="rounded-full bg-success/10 p-3">
                  <CheckCircle2 className="size-8 text-success" />
                </div>
                <div className="text-center">
                  <p className="font-medium">You&apos;re all set!</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Your card will only be charged when you exceed the free tier.
                  </p>
                </div>
              </div>
            </DialogPanel>
            <DialogFooter>
              <DialogClose render={<Button />}>Done</DialogClose>
            </DialogFooter>
          </>
        );

      case 'error':
        return (
          <>
            <DialogHeader>
              <DialogTitle>Something Went Wrong</DialogTitle>
              <DialogDescription>
                We couldn&apos;t add your payment method
              </DialogDescription>
            </DialogHeader>
            <DialogPanel>
              <Alert variant="error">
                <AlertCircle className="size-4" />
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>
                  {errorMessage || 'An unexpected error occurred. Please try again.'}
                </AlertDescription>
              </Alert>
            </DialogPanel>
            <DialogFooter>
              <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
              <Button onClick={() => setStep('info')}>Try Again</Button>
            </DialogFooter>
          </>
        );

      default:
        return null;
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {trigger && <DialogTrigger render={trigger as React.ReactElement} />}
      <DialogPopup showCloseButton={step !== 'processing'}>
        {renderStepContent()}
      </DialogPopup>
    </Dialog>
  );
}
