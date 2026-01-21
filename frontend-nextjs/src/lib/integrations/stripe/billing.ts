/**
 * Stripe Billing Client
 *
 * Handles MTU-based billing operations including:
 * - Customer creation and management
 * - Metered subscription management
 * - Usage meter event recording
 * - Payment method management
 * - Billing portal sessions
 *
 * Automatically checks deployment mode - all operations are no-ops in self-hosted mode.
 */

import Stripe from 'stripe';
import { isBillingEnabled, shouldUseStripe } from '@/lib/utils/deployment';

// ============================================
// Error Types
// ============================================

export class StripeBillingError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode?: number,
    public readonly retryable: boolean = false
  ) {
    super(message);
    this.name = 'StripeBillingError';
  }
}

export class StripeCardDeclinedError extends StripeBillingError {
  constructor(message: string, public readonly declineCode?: string) {
    super(message, 'card_declined', 402, false);
    this.name = 'StripeCardDeclinedError';
  }
}

export class StripeInvalidRequestError extends StripeBillingError {
  constructor(message: string) {
    super(message, 'invalid_request', 400, false);
    this.name = 'StripeInvalidRequestError';
  }
}

export class StripeAuthenticationError extends StripeBillingError {
  constructor(message: string) {
    super(message, 'authentication_error', 401, false);
    this.name = 'StripeAuthenticationError';
  }
}

export class StripeRateLimitError extends StripeBillingError {
  constructor(message: string) {
    super(message, 'rate_limit', 429, true);
    this.name = 'StripeRateLimitError';
  }
}

export class StripeBillingDisabledError extends StripeBillingError {
  constructor() {
    super('Billing is disabled in self-hosted mode', 'billing_disabled', undefined, false);
    this.name = 'StripeBillingDisabledError';
  }
}

// ============================================
// Types
// ============================================

export interface BillingCustomerMetadata {
  workspace_id: string;
  workspace_name?: string;
  created_by_user_id?: string;
}

export interface CreateCustomerParams {
  workspaceId: string;
  email: string;
  name?: string;
  metadata?: Record<string, string>;
}

export interface CreateSubscriptionParams {
  customerId: string;
  priceId?: string;
}

export interface RecordMeterEventParams {
  customerId: string;
  mtuCount: number;
  timestamp?: number;
  idempotencyKey?: string;
}

export interface SetupIntentResult {
  clientSecret: string;
  setupIntentId: string;
}

export interface PaymentMethodInfo {
  id: string;
  type: string;
  card?: {
    brand: string;
    last4: string;
    expMonth: number;
    expYear: number;
  };
  isDefault: boolean;
}

export interface BillingPortalSessionResult {
  url: string;
}

// Result types for operations that might be disabled
export type BillingResult<T> =
  | { success: true; data: T }
  | { success: false; disabled: true }
  | { success: false; error: StripeBillingError };

// ============================================
// Configuration
// ============================================

export interface StripeBillingConfig {
  secretKey: string;
  webhookSecret?: string;
  mtuPriceId?: string;
  mtuMeterId?: string;
}

function getStripeConfig(): StripeBillingConfig | null {
  const secretKey = process.env.STRIPE_SECRET_KEY;

  if (!secretKey) {
    return null;
  }

  return {
    secretKey,
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
    mtuPriceId: process.env.STRIPE_MTU_PRICE_ID || 'PLACEHOLDER_PRICE_ID',
    mtuMeterId: process.env.STRIPE_MTU_METER_ID || 'PLACEHOLDER_METER_ID',
  };
}

// ============================================
// Stripe Client Singleton
// ============================================

let stripeInstance: Stripe | null = null;

function getStripe(): Stripe | null {
  if (!shouldUseStripe()) {
    return null;
  }

  if (!stripeInstance) {
    const config = getStripeConfig();
    if (!config) {
      console.warn('[Stripe Billing] No STRIPE_SECRET_KEY configured');
      return null;
    }

    stripeInstance = new Stripe(config.secretKey, {
      typescript: true,
      appInfo: {
        name: 'Beton Inspector',
        version: '1.0.0',
      },
    });
  }

  return stripeInstance;
}

// ============================================
// Error Handling
// ============================================

function handleStripeError(error: unknown, context: string): never {
  if (error instanceof Stripe.errors.StripeError) {
    const message = `${context}: ${error.message}`;

    switch (error.type) {
      case 'StripeCardError':
        throw new StripeCardDeclinedError(message, error.decline_code);
      case 'StripeInvalidRequestError':
        throw new StripeInvalidRequestError(message);
      case 'StripeAuthenticationError':
        throw new StripeAuthenticationError(message);
      case 'StripeRateLimitError':
        throw new StripeRateLimitError(message);
      default:
        throw new StripeBillingError(
          message,
          error.code || error.type,
          error.statusCode,
          error.type === 'StripeAPIError' || error.type === 'StripeConnectionError'
        );
    }
  }

  throw new StripeBillingError(
    `${context}: ${error instanceof Error ? error.message : 'Unknown error'}`,
    'unknown_error'
  );
}

// ============================================
// Customer Management
// ============================================

/**
 * Creates a Stripe customer for a workspace.
 * Returns disabled result if billing is not enabled.
 */
export async function createCustomer(
  params: CreateCustomerParams
): Promise<BillingResult<Stripe.Customer>> {
  if (!isBillingEnabled()) {
    return { success: false, disabled: true };
  }

  const stripe = getStripe();
  if (!stripe) {
    return { success: false, disabled: true };
  }

  try {
    console.log(`[Stripe Billing] Creating customer for workspace ${params.workspaceId}`);

    const customer = await stripe.customers.create({
      email: params.email,
      name: params.name,
      metadata: {
        workspace_id: params.workspaceId,
        ...params.metadata,
      },
    });

    console.log(`[Stripe Billing] Created customer ${customer.id} for workspace ${params.workspaceId}`);
    return { success: true, data: customer };
  } catch (error) {
    handleStripeError(error, 'Failed to create customer');
  }
}

/**
 * Retrieves a Stripe customer by ID.
 */
export async function getCustomer(
  customerId: string
): Promise<BillingResult<Stripe.Customer | null>> {
  if (!isBillingEnabled()) {
    return { success: false, disabled: true };
  }

  const stripe = getStripe();
  if (!stripe) {
    return { success: false, disabled: true };
  }

  try {
    const customer = await stripe.customers.retrieve(customerId, {
      expand: ['subscriptions', 'invoice_settings.default_payment_method'],
    });

    if ((customer as Stripe.DeletedCustomer).deleted) {
      return { success: true, data: null };
    }

    return { success: true, data: customer as Stripe.Customer };
  } catch (error) {
    if ((error as Stripe.errors.StripeError).code === 'resource_missing') {
      return { success: true, data: null };
    }
    handleStripeError(error, 'Failed to retrieve customer');
  }
}

/**
 * Updates a Stripe customer's metadata.
 */
export async function updateCustomer(
  customerId: string,
  updates: Stripe.CustomerUpdateParams
): Promise<BillingResult<Stripe.Customer>> {
  if (!isBillingEnabled()) {
    return { success: false, disabled: true };
  }

  const stripe = getStripe();
  if (!stripe) {
    return { success: false, disabled: true };
  }

  try {
    const customer = await stripe.customers.update(customerId, updates);
    return { success: true, data: customer };
  } catch (error) {
    handleStripeError(error, 'Failed to update customer');
  }
}

// ============================================
// Subscription Management
// ============================================

/**
 * Creates a metered subscription for a customer.
 * Uses the configured MTU price ID.
 */
export async function createSubscription(
  params: CreateSubscriptionParams
): Promise<BillingResult<Stripe.Subscription>> {
  if (!isBillingEnabled()) {
    return { success: false, disabled: true };
  }

  const stripe = getStripe();
  const config = getStripeConfig();
  if (!stripe || !config) {
    return { success: false, disabled: true };
  }

  const priceId = params.priceId || config.mtuPriceId;
  if (!priceId || priceId === 'PLACEHOLDER_PRICE_ID') {
    throw new StripeInvalidRequestError('MTU Price ID not configured');
  }

  try {
    console.log(`[Stripe Billing] Creating subscription for customer ${params.customerId}`);

    const subscription = await stripe.subscriptions.create({
      customer: params.customerId,
      items: [{ price: priceId }],
      payment_behavior: 'default_incomplete',
      payment_settings: {
        save_default_payment_method: 'on_subscription',
      },
      expand: ['latest_invoice.payment_intent'],
    });

    console.log(`[Stripe Billing] Created subscription ${subscription.id}`);
    return { success: true, data: subscription };
  } catch (error) {
    handleStripeError(error, 'Failed to create subscription');
  }
}

/**
 * Retrieves a subscription by ID.
 */
export async function getSubscription(
  subscriptionId: string
): Promise<BillingResult<Stripe.Subscription | null>> {
  if (!isBillingEnabled()) {
    return { success: false, disabled: true };
  }

  const stripe = getStripe();
  if (!stripe) {
    return { success: false, disabled: true };
  }

  try {
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    return { success: true, data: subscription };
  } catch (error) {
    if ((error as Stripe.errors.StripeError).code === 'resource_missing') {
      return { success: true, data: null };
    }
    handleStripeError(error, 'Failed to retrieve subscription');
  }
}

/**
 * Cancels a subscription.
 */
export async function cancelSubscription(
  subscriptionId: string
): Promise<BillingResult<Stripe.Subscription>> {
  if (!isBillingEnabled()) {
    return { success: false, disabled: true };
  }

  const stripe = getStripe();
  if (!stripe) {
    return { success: false, disabled: true };
  }

  try {
    console.log(`[Stripe Billing] Cancelling subscription ${subscriptionId}`);
    const subscription = await stripe.subscriptions.cancel(subscriptionId);
    return { success: true, data: subscription };
  } catch (error) {
    handleStripeError(error, 'Failed to cancel subscription');
  }
}

/**
 * Pauses a subscription (schedules cancellation at period end).
 */
export async function pauseSubscription(
  subscriptionId: string
): Promise<BillingResult<Stripe.Subscription>> {
  if (!isBillingEnabled()) {
    return { success: false, disabled: true };
  }

  const stripe = getStripe();
  if (!stripe) {
    return { success: false, disabled: true };
  }

  try {
    console.log(`[Stripe Billing] Pausing subscription ${subscriptionId}`);
    const subscription = await stripe.subscriptions.update(subscriptionId, {
      pause_collection: {
        behavior: 'mark_uncollectible',
      },
    });
    return { success: true, data: subscription };
  } catch (error) {
    handleStripeError(error, 'Failed to pause subscription');
  }
}

/**
 * Resumes a paused subscription.
 */
export async function resumeSubscription(
  subscriptionId: string
): Promise<BillingResult<Stripe.Subscription>> {
  if (!isBillingEnabled()) {
    return { success: false, disabled: true };
  }

  const stripe = getStripe();
  if (!stripe) {
    return { success: false, disabled: true };
  }

  try {
    console.log(`[Stripe Billing] Resuming subscription ${subscriptionId}`);
    const subscription = await stripe.subscriptions.update(subscriptionId, {
      pause_collection: '',
    });
    return { success: true, data: subscription };
  } catch (error) {
    handleStripeError(error, 'Failed to resume subscription');
  }
}

// ============================================
// Meter Events (MTU Tracking)
// ============================================

/**
 * Records an MTU count to the Stripe billing meter.
 * This is called by the daily MTU tracking cron job.
 */
export async function recordMeterEvent(
  params: RecordMeterEventParams
): Promise<BillingResult<{ success: true }>> {
  if (!isBillingEnabled()) {
    return { success: false, disabled: true };
  }

  const stripe = getStripe();
  const config = getStripeConfig();
  if (!stripe || !config) {
    return { success: false, disabled: true };
  }

  const meterId = config.mtuMeterId;
  if (!meterId || meterId === 'PLACEHOLDER_METER_ID') {
    console.warn('[Stripe Billing] MTU Meter ID not configured, skipping meter event');
    return { success: true, data: { success: true } };
  }

  try {
    console.log(
      `[Stripe Billing] Recording meter event: ${params.mtuCount} MTUs for customer ${params.customerId}`
    );

    // Use the v2 Billing Meter API
    await stripe.billing.meterEvents.create({
      event_name: meterId,
      payload: {
        stripe_customer_id: params.customerId,
        value: String(params.mtuCount),
      },
      timestamp: params.timestamp || Math.floor(Date.now() / 1000),
    });

    console.log(`[Stripe Billing] Meter event recorded successfully`);
    return { success: true, data: { success: true } };
  } catch (error) {
    handleStripeError(error, 'Failed to record meter event');
  }
}

// ============================================
// Payment Methods
// ============================================

/**
 * Creates a SetupIntent for collecting card details.
 * The client secret is used with Stripe.js to collect payment information.
 */
export async function createSetupIntent(
  customerId: string
): Promise<BillingResult<SetupIntentResult>> {
  if (!isBillingEnabled()) {
    return { success: false, disabled: true };
  }

  const stripe = getStripe();
  if (!stripe) {
    return { success: false, disabled: true };
  }

  try {
    console.log(`[Stripe Billing] Creating SetupIntent for customer ${customerId}`);

    const setupIntent = await stripe.setupIntents.create({
      customer: customerId,
      payment_method_types: ['card'],
      usage: 'off_session',
    });

    return {
      success: true,
      data: {
        clientSecret: setupIntent.client_secret!,
        setupIntentId: setupIntent.id,
      },
    };
  } catch (error) {
    handleStripeError(error, 'Failed to create SetupIntent');
  }
}

/**
 * Lists payment methods for a customer.
 */
export async function listPaymentMethods(
  customerId: string
): Promise<BillingResult<PaymentMethodInfo[]>> {
  if (!isBillingEnabled()) {
    return { success: false, disabled: true };
  }

  const stripe = getStripe();
  if (!stripe) {
    return { success: false, disabled: true };
  }

  try {
    const [paymentMethods, customer] = await Promise.all([
      stripe.paymentMethods.list({
        customer: customerId,
        type: 'card',
      }),
      stripe.customers.retrieve(customerId),
    ]);

    const defaultPaymentMethodId =
      (customer as Stripe.Customer).invoice_settings?.default_payment_method;

    const methods: PaymentMethodInfo[] = paymentMethods.data.map((pm) => ({
      id: pm.id,
      type: pm.type,
      card: pm.card
        ? {
            brand: pm.card.brand,
            last4: pm.card.last4,
            expMonth: pm.card.exp_month,
            expYear: pm.card.exp_year,
          }
        : undefined,
      isDefault: pm.id === defaultPaymentMethodId,
    }));

    return { success: true, data: methods };
  } catch (error) {
    handleStripeError(error, 'Failed to list payment methods');
  }
}

/**
 * Sets the default payment method for a customer.
 */
export async function setDefaultPaymentMethod(
  customerId: string,
  paymentMethodId: string
): Promise<BillingResult<Stripe.Customer>> {
  if (!isBillingEnabled()) {
    return { success: false, disabled: true };
  }

  const stripe = getStripe();
  if (!stripe) {
    return { success: false, disabled: true };
  }

  try {
    console.log(
      `[Stripe Billing] Setting default payment method ${paymentMethodId} for customer ${customerId}`
    );

    const customer = await stripe.customers.update(customerId, {
      invoice_settings: {
        default_payment_method: paymentMethodId,
      },
    });

    return { success: true, data: customer };
  } catch (error) {
    handleStripeError(error, 'Failed to set default payment method');
  }
}

// ============================================
// Billing Portal
// ============================================

/**
 * Creates a Stripe Billing Portal session for customer self-service.
 * Customers can update payment methods, view invoices, and manage subscriptions.
 */
export async function createBillingPortalSession(
  customerId: string,
  returnUrl: string
): Promise<BillingResult<BillingPortalSessionResult>> {
  if (!isBillingEnabled()) {
    return { success: false, disabled: true };
  }

  const stripe = getStripe();
  if (!stripe) {
    return { success: false, disabled: true };
  }

  try {
    console.log(`[Stripe Billing] Creating billing portal session for customer ${customerId}`);

    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    });

    return {
      success: true,
      data: { url: session.url },
    };
  } catch (error) {
    handleStripeError(error, 'Failed to create billing portal session');
  }
}

// ============================================
// Webhook Verification
// ============================================

/**
 * Verifies a Stripe webhook signature and constructs the event.
 */
export function constructWebhookEvent(
  payload: string | Buffer,
  signature: string
): Stripe.Event {
  const config = getStripeConfig();
  if (!config?.webhookSecret) {
    throw new StripeAuthenticationError('Webhook secret not configured');
  }

  const stripe = getStripe();
  if (!stripe) {
    throw new StripeBillingDisabledError();
  }

  try {
    return stripe.webhooks.constructEvent(payload, signature, config.webhookSecret);
  } catch (error) {
    handleStripeError(error, 'Failed to verify webhook signature');
  }
}

// ============================================
// Utility Functions
// ============================================

/**
 * Checks if Stripe billing is properly configured and enabled.
 */
export function isBillingConfigured(): boolean {
  if (!isBillingEnabled()) {
    return false;
  }

  const config = getStripeConfig();
  return config !== null && config.secretKey.length > 0;
}

/**
 * Gets the configured MTU price ID (or placeholder if not set).
 */
export function getMtuPriceId(): string | null {
  const config = getStripeConfig();
  if (!config?.mtuPriceId || config.mtuPriceId === 'PLACEHOLDER_PRICE_ID') {
    return null;
  }
  return config.mtuPriceId;
}

/**
 * Gets the configured MTU meter ID (or placeholder if not set).
 */
export function getMtuMeterId(): string | null {
  const config = getStripeConfig();
  if (!config?.mtuMeterId || config.mtuMeterId === 'PLACEHOLDER_METER_ID') {
    return null;
  }
  return config.mtuMeterId;
}
