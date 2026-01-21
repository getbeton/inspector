'use client';

/**
 * Billing Hooks
 *
 * React Query hooks for billing data fetching and mutations.
 * Provides caching, refetching, and optimistic updates.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getBillingStatus,
  createSetupIntent,
  completeSetup,
  getPaymentMethods,
  deletePaymentMethod,
  createPortalSession,
  type BillingStatus,
  type SetupIntentResponse,
  type PaymentMethod,
} from '@/lib/api/billing';

// ============================================
// Query Keys
// ============================================

export const billingKeys = {
  all: ['billing'] as const,
  status: () => [...billingKeys.all, 'status'] as const,
  paymentMethods: () => [...billingKeys.all, 'paymentMethods'] as const,
};

// ============================================
// Queries
// ============================================

/**
 * Fetches billing status for the current workspace.
 * Refetches every 5 minutes and on window focus.
 */
export function useBillingStatus() {
  return useQuery({
    queryKey: billingKeys.status(),
    queryFn: getBillingStatus,
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: true,
    retry: 2,
  });
}

/**
 * Fetches payment methods for the current workspace.
 */
export function usePaymentMethods() {
  return useQuery({
    queryKey: billingKeys.paymentMethods(),
    queryFn: getPaymentMethods,
    staleTime: 5 * 60 * 1000,
  });
}

// ============================================
// Mutations
// ============================================

/**
 * Creates a SetupIntent for card collection.
 */
export function useCreateSetupIntent() {
  return useMutation({
    mutationFn: createSetupIntent,
  });
}

/**
 * Completes the card setup after Stripe confirmation.
 * Invalidates billing queries on success.
 */
export function useCompleteSetup() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: completeSetup,
    onSuccess: () => {
      // Invalidate all billing queries to refetch fresh data
      queryClient.invalidateQueries({ queryKey: billingKeys.all });
    },
  });
}

/**
 * Removes a payment method.
 * Invalidates payment methods query on success.
 */
export function useDeletePaymentMethod() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deletePaymentMethod,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: billingKeys.paymentMethods() });
      queryClient.invalidateQueries({ queryKey: billingKeys.status() });
    },
  });
}

/**
 * Creates a Stripe portal session for managing billing.
 */
export function useCreatePortalSession() {
  return useMutation({
    mutationFn: createPortalSession,
    onSuccess: (data) => {
      // Redirect to Stripe portal
      if (data.url) {
        window.location.href = data.url;
      }
    },
  });
}

// ============================================
// Helper Hooks
// ============================================

/**
 * Returns whether the workspace has access to the app.
 * Combines billing status check with access logic.
 */
export function useHasAccess(): {
  hasAccess: boolean;
  isLoading: boolean;
  status: BillingStatus | undefined;
} {
  const { data: status, isLoading } = useBillingStatus();

  return {
    hasAccess: status?.threshold?.canAccess ?? true, // Default to true if status not loaded
    isLoading,
    status,
  };
}

/**
 * Returns the current threshold warning level.
 */
export function useThresholdLevel(): {
  level: 'normal' | 'warning_90' | 'warning_95' | 'exceeded';
  isLoading: boolean;
} {
  const { data: status, isLoading } = useBillingStatus();

  return {
    level: status?.threshold?.level ?? 'normal',
    isLoading,
  };
}

/**
 * Returns whether the workspace needs to add a payment method.
 */
export function useNeedsPaymentMethod(): {
  needsPaymentMethod: boolean;
  isLoading: boolean;
} {
  const { data: status, isLoading } = useBillingStatus();

  return {
    needsPaymentMethod:
      status?.status === 'card_required' ||
      (status?.threshold?.level !== 'normal' && !status?.hasPaymentMethod),
    isLoading,
  };
}
