"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useStripe, useElements, PaymentElement } from "@stripe/react-stripe-js";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import { StripeElementsProvider } from "@/components/billing/stripe-provider";
import { useCreateSetupIntent, useCompleteSetup, useBillingStatus } from "@/lib/hooks/use-billing";
import { Check, AlertCircle, CreditCard, Shield, Users } from "lucide-react";

/**
 * Default free tier limit (MTU) - used as fallback if billing status not loaded
 * The actual limit comes from Stripe via billingStatus.mtu.limit
 */
const DEFAULT_FREE_TIER_LIMIT = 200;

/**
 * Component state machine
 */
type StepState =
  | "loading"
  | "info"
  | "card_input"
  | "processing"
  | "success"
  | "error";

export interface BillingStepProps {
  /**
   * Number of Monthly Tracked Users from PostHog
   */
  mtuCount: number;
  /**
   * Callback when billing setup is complete
   */
  onComplete: () => void;
  /**
   * Optional CSS class for the container
   */
  className?: string;
}

/**
 * Inner card form component (needs Stripe context)
 */
interface CardFormProps {
  onSuccess: (cardLast4: string) => void;
  onError: (message: string) => void;
  onProcessing: (processing: boolean) => void;
  buttonText: string;
}

function CardForm({ onSuccess, onError, onProcessing, buttonText }: CardFormProps) {
  const stripe = useStripe();
  const elements = useElements();
  const completeSetup = useCompleteSetup();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isReady, setIsReady] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!stripe || !elements || !isReady) {
      onError("Payment form is not ready yet. Please wait a moment.");
      return;
    }

    setIsSubmitting(true);
    // NOTE: Don't call onProcessing(true) here - it unmounts the Stripe elements!
    // The parent state change causes StripeElementsProvider to unmount before
    // confirmSetup() completes. We'll notify the parent only after Stripe is done.

    try {
      // Confirm the SetupIntent with Stripe
      const { error, setupIntent } = await stripe.confirmSetup({
        elements,
        redirect: "if_required",
      });

      if (error) {
        throw new Error(error.message || "Failed to confirm card");
      }

      if (!setupIntent || setupIntent.status !== "succeeded") {
        throw new Error("Card setup did not complete successfully");
      }

      // NOW safe to notify parent - Stripe is done with the element
      onProcessing(true);

      // Extract payment method ID
      const paymentMethodId = setupIntent.payment_method;
      if (!paymentMethodId || typeof paymentMethodId !== "string") {
        throw new Error("No payment method returned from Stripe");
      }

      // Complete the setup on our backend
      await completeSetup.mutateAsync({
        setupIntentId: setupIntent.id,
        paymentMethodId,
      });

      // Get card last4 from payment method (simplified - in production would fetch from API)
      onSuccess("****");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "An unexpected error occurred";
      onError(message);
    } finally {
      setIsSubmitting(false);
      // Note: onProcessing(false) removed - we only transition to processing state
      // on success, and the success handler moves to a different state anyway
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {!isReady && (
        <div className="flex items-center justify-center py-4">
          <Spinner className="h-5 w-5" />
          <span className="ml-2 text-sm text-muted-foreground">Loading payment form...</span>
        </div>
      )}
      <PaymentElement
        options={{
          layout: "tabs",
        }}
        onReady={() => setIsReady(true)}
      />
      <Button
        type="submit"
        className="w-full"
        disabled={!stripe || !elements || !isReady || isSubmitting}
      >
        {isSubmitting ? (
          <>
            <Spinner className="h-4 w-4" />
            Processing...
          </>
        ) : (
          <>
            <CreditCard className="h-4 w-4" />
            {buttonText}
          </>
        )}
      </Button>
    </form>
  );
}

/**
 * Billing step for the setup wizard
 *
 * Features:
 * - Shows MTU count and pricing information
 * - Conditional messaging based on MTU vs free tier
 * - Stripe PaymentElement for card collection
 * - Handles immediate charge if over limit
 * - Shows success state with card last4
 */
export function BillingStep({ mtuCount, onComplete, className }: BillingStepProps) {
  // State
  const [state, setState] = useState<StepState>("loading");
  const [error, setError] = useState<string | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [cardLast4, setCardLast4] = useState<string | null>(null);

  // Hooks
  const { data: billingStatus, isLoading: statusLoading } = useBillingStatus();
  const createSetupIntent = useCreateSetupIntent();

  // Get dynamic free tier limit from billing status (fallback to default if not loaded)
  const freeTierLimit = billingStatus?.mtu?.limit ?? DEFAULT_FREE_TIER_LIMIT;

  // Computed values
  const isOverLimit = mtuCount > freeTierLimit;
  const usersOverLimit = Math.max(0, mtuCount - freeTierLimit);
  const pricePerMtu = billingStatus?.pricing?.pricePerMtu ?? "$0.10";
  const estimatedCharge = isOverLimit
    ? `$${(usersOverLimit * 0.1).toFixed(2)}`
    : "$0.00";

  // Initialize state when billing status loads
  useEffect(() => {
    if (!statusLoading) {
      setState("info");
    }
  }, [statusLoading]);

  /**
   * Start card collection flow
   */
  const handleStartCardInput = useCallback(async () => {
    setError(null);

    try {
      const result = await createSetupIntent.mutateAsync();
      setClientSecret(result.clientSecret);
      setState("card_input");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to initialize payment";
      setError(message);
      setState("error");
    }
  }, [createSetupIntent]);

  /**
   * Handle successful card setup
   */
  const handleCardSuccess = useCallback(
    (last4: string) => {
      setCardLast4(last4);
      setState("success");
    },
    []
  );

  // Auto-proceed after showing success briefly — with proper cleanup
  const successTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    if (state === "success") {
      successTimerRef.current = setTimeout(() => {
        onComplete();
      }, 1500);
    }
    return () => {
      clearTimeout(successTimerRef.current);
    };
  }, [state, onComplete]);

  /**
   * Handle card setup error
   */
  const handleCardError = useCallback((message: string) => {
    setError(message);
    setState("error");
  }, []);

  /**
   * Handle processing state
   */
  const handleProcessing = useCallback((processing: boolean) => {
    if (processing) {
      setState("processing");
    }
  }, []);

  // Loading state
  if (state === "loading") {
    return (
      <div className={cn("flex items-center justify-center py-12", className)}>
        <Spinner className="h-6 w-6" />
      </div>
    );
  }

  return (
    <div className={cn("space-y-6", className)} data-slot="billing-step">
      {/* MTU Summary */}
      <div className="rounded-lg border bg-muted/50 p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-muted-foreground" />
          <span className="font-medium">Active Users (MTU)</span>
        </div>
        <div className="text-3xl font-bold">{mtuCount.toLocaleString()}</div>
        <div className="text-sm text-muted-foreground">
          Free tier: {freeTierLimit.toLocaleString()} users
        </div>
      </div>

      {/* Conditional Messaging */}
      {isOverLimit ? (
        <Alert variant="warning">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Above Free Tier</AlertTitle>
          <AlertDescription>
            You have <strong>{mtuCount.toLocaleString()}</strong> users (
            <strong>{usersOverLimit.toLocaleString()}</strong> above the free tier).
            You&apos;ll be charged approximately <strong>{estimatedCharge}</strong>{" "}
            at {pricePerMtu}/user.
          </AlertDescription>
        </Alert>
      ) : (
        <Alert variant="success">
          <Check className="h-4 w-4" />
          <AlertTitle>Within Free Tier</AlertTitle>
          <AlertDescription>
            You have <strong>{mtuCount.toLocaleString()}</strong> users (within the{" "}
            {freeTierLimit.toLocaleString()} user free tier). You won&apos;t be
            charged now, but we need a card on file for when you grow.
          </AlertDescription>
        </Alert>
      )}

      {/* Error Display */}
      {error && state === "error" && (
        <Alert variant="error">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Payment Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Success Display */}
      {state === "success" && (
        <Alert variant="success">
          <Check className="h-4 w-4" />
          <AlertTitle>Payment Method Added</AlertTitle>
          <AlertDescription>
            Card ending in {cardLast4} has been saved. Redirecting...
          </AlertDescription>
        </Alert>
      )}

      {/* Info State - Show add card button */}
      {state === "info" && (
        <>
          <div className="flex items-start gap-2 text-xs text-muted-foreground">
            <Shield className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              Your payment info is securely handled by Stripe. We never store your
              card details.
            </span>
          </div>
          <Button
            onClick={handleStartCardInput}
            disabled={createSetupIntent.isPending}
            className="w-full"
          >
            {createSetupIntent.isPending ? (
              <>
                <Spinner className="h-4 w-4" />
                Loading...
              </>
            ) : (
              <>
                <CreditCard className="h-4 w-4" />
                Add Payment Method
              </>
            )}
          </Button>
        </>
      )}

      {/* Card Input State */}
      {state === "card_input" && clientSecret && (
        <StripeElementsProvider clientSecret={clientSecret}>
          <CardForm
            onSuccess={handleCardSuccess}
            onError={handleCardError}
            onProcessing={handleProcessing}
            buttonText={isOverLimit ? `Pay ${estimatedCharge} & Continue` : "Save Card & Continue"}
          />
        </StripeElementsProvider>
      )}

      {/* Processing State */}
      {state === "processing" && (
        <div className="flex flex-col items-center justify-center py-8 gap-4">
          <Spinner className="h-8 w-8" />
          <p className="text-sm text-muted-foreground">Processing payment...</p>
        </div>
      )}

      {/* Error State - Show retry button */}
      {state === "error" && (
        <Button onClick={() => setState("info")} variant="outline" className="w-full">
          Try Again
        </Button>
      )}
    </div>
  );
}

export default BillingStep;
