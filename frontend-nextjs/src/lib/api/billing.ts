/**
 * Billing API Client
 *
 * Functions for interacting with the billing API endpoints.
 * Used by React Query hooks for data fetching and mutations.
 */

// ============================================
// Types
// ============================================

export interface BillingStatus {
  workspaceId: string;
  status: 'active' | 'free' | 'card_required' | 'suspended';
  hasPaymentMethod: boolean;
  mtu: {
    current: number;
    limit: number;
    percentUsed: number;
  };
  subscription: {
    hasSubscription: boolean;
    status: string | null;
    currentPeriodEnd: string | null;
  };
  threshold: {
    level: 'normal' | 'warning_90' | 'warning_95' | 'exceeded';
    canAccess: boolean;
    accessWarning: string | null;
  };
}

export interface SetupIntentResponse {
  clientSecret: string;
  setupIntentId: string;
  stripePublishableKey: string;
}

export interface PaymentMethod {
  id: string;
  cardBrand: string | null;
  cardLastFour: string | null;
  cardExpMonth: number | null;
  cardExpYear: number | null;
  isDefault: boolean;
}

export interface CompleteSetupResponse {
  success: boolean;
  paymentMethodId: string;
  subscription: {
    id: string;
    status: string;
    currentPeriodEnd: string;
  };
}

export interface PortalSessionResponse {
  url: string;
}

// ============================================
// API Functions
// ============================================

/**
 * Fetches current billing status for the workspace.
 */
export async function getBillingStatus(): Promise<BillingStatus> {
  const response = await fetch('/api/billing/status', {
    credentials: 'include',
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  return response.json();
}

/**
 * Creates a SetupIntent for collecting card details.
 */
export async function createSetupIntent(): Promise<SetupIntentResponse> {
  const response = await fetch('/api/billing/setup-intent', {
    method: 'POST',
    credentials: 'include',
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  return response.json();
}

/**
 * Completes the card setup after Stripe confirmation.
 */
export async function completeSetup(setupIntentId: string): Promise<CompleteSetupResponse> {
  const response = await fetch('/api/billing/complete-setup', {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ setupIntentId }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  return response.json();
}

/**
 * Lists all payment methods for the workspace.
 */
export async function getPaymentMethods(): Promise<PaymentMethod[]> {
  const response = await fetch('/api/billing/payment-methods', {
    credentials: 'include',
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  const data = await response.json();
  return data.paymentMethods || [];
}

/**
 * Removes a payment method from the workspace.
 */
export async function deletePaymentMethod(paymentMethodId: string): Promise<void> {
  const response = await fetch(`/api/billing/payment-methods/${paymentMethodId}`, {
    method: 'DELETE',
    credentials: 'include',
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || `HTTP ${response.status}`);
  }
}

/**
 * Creates a Stripe Billing Portal session.
 */
export async function createPortalSession(): Promise<PortalSessionResponse> {
  const response = await fetch('/api/billing/portal-session', {
    method: 'POST',
    credentials: 'include',
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  return response.json();
}
