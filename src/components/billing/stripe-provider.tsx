'use client';

/**
 * Stripe Provider
 *
 * Wraps children with Stripe Elements context for card input components.
 * Only loads Stripe when the publishable key is available.
 */

import { useState, useEffect } from 'react';
import { loadStripe, type Stripe } from '@stripe/stripe-js';
import { Elements } from '@stripe/react-stripe-js';

// ============================================
// Types
// ============================================

interface StripeProviderProps {
  children: React.ReactNode;
  publishableKey?: string;
}

// ============================================
// Stripe Promise Cache
// ============================================

// Cache the Stripe promise to avoid recreating it
let stripePromise: Promise<Stripe | null> | null = null;

function getStripe(publishableKey: string): Promise<Stripe | null> {
  if (!stripePromise) {
    stripePromise = loadStripe(publishableKey);
  }
  return stripePromise;
}

// ============================================
// Component
// ============================================

/**
 * Provides Stripe context to child components.
 * Uses the publishable key from environment or props.
 */
export function StripeProvider({ children, publishableKey }: StripeProviderProps) {
  const [stripeReady, setStripeReady] = useState(false);

  // Get publishable key from props or environment
  const key = publishableKey || process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;

  useEffect(() => {
    if (key) {
      setStripeReady(true);
    }
  }, [key]);

  // If no key, render children without Stripe context
  if (!key || !stripeReady) {
    return <>{children}</>;
  }

  const stripePromise = getStripe(key);

  return (
    <Elements
      stripe={stripePromise}
      options={{
        appearance: {
          theme: 'stripe',
          variables: {
            colorPrimary: '#4A90E2',
            colorBackground: '#ffffff',
            colorText: '#333333',
            colorDanger: '#E53935',
            fontFamily: 'Inter, system-ui, sans-serif',
            borderRadius: '8px',
          },
        },
      }}
    >
      {children}
    </Elements>
  );
}

// ============================================
// Lazy Provider for Client Secret
// ============================================

interface StripeElementsProviderProps {
  clientSecret: string;
  children: React.ReactNode;
}

/**
 * Provider that includes the client secret for SetupIntent.
 * Use this when you have a specific SetupIntent to confirm.
 */
export function StripeElementsProvider({
  clientSecret,
  children,
}: StripeElementsProviderProps) {
  const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;

  if (!key) {
    console.warn('[StripeElementsProvider] NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY not set');
    return <>{children}</>;
  }

  const stripePromise = getStripe(key);

  return (
    <Elements
      stripe={stripePromise}
      options={{
        clientSecret,
        appearance: {
          theme: 'stripe',
          variables: {
            colorPrimary: '#4A90E2',
            colorBackground: '#ffffff',
            colorText: '#333333',
            colorDanger: '#E53935',
            fontFamily: 'Inter, system-ui, sans-serif',
            borderRadius: '8px',
          },
        },
      }}
    >
      {children}
    </Elements>
  );
}
