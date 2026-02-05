# Billing System Setup Guide

This guide covers the deployment and configuration of Beton Inspector's billing system, which uses Stripe's metered billing to charge based on Monthly Tracked Users (MTU).

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Environment Variables](#environment-variables)
3. [Stripe Dashboard Setup](#stripe-dashboard-setup)
4. [Webhook Configuration](#webhook-configuration)
5. [Testing](#testing)
6. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Stripe Account Requirements

1. **Active Stripe account** with access to the Dashboard
2. **Billing feature enabled** - Contact Stripe support if needed
3. **Billing Meters feature** - This is required for usage-based billing

### Local Development Requirements

- Node.js 18+
- Stripe CLI (for webhook testing)
- Access to Vercel environment variables (for production secrets)

---

## Environment Variables

### Required for Billing

| Variable | Description | Example |
|----------|-------------|---------|
| `STRIPE_API_KEY` | Stripe secret key | `sk_live_...` or `sk_test_...` |
| `STRIPE_WEBHOOK_SECRET` | Webhook signing secret | `whsec_...` |
| `STRIPE_PRICE_ID` | Metered price ID | `price_1ABC...` |
| `STRIPE_BILLING_METER_ID` | Billing Meter ID | `mtr_...` |
| `STRIPE_BILLING_METER_EVENT_NAME` | Meter event name | `mtu_count` |
| `DEPLOYMENT_MODE` | Deployment mode | `cloud` or `self-hosted` |

### Required for Encryption

| Variable | Description | Example |
|----------|-------------|---------|
| `ENCRYPTION_KEY` | 256-bit hex key for credential encryption | `openssl rand -hex 32` |

### Setting Variables in Vercel

```bash
# Using Vercel CLI
vercel env add STRIPE_API_KEY
vercel env add STRIPE_WEBHOOK_SECRET
vercel env add STRIPE_PRICE_ID
vercel env add STRIPE_BILLING_METER_ID
vercel env add STRIPE_BILLING_METER_EVENT_NAME
```

---

## Stripe Dashboard Setup

### Step 1: Create a Billing Meter

1. Go to **Stripe Dashboard > Billing > Meters**
2. Click **Create meter**
3. Configure the meter:
   - **Name**: `Monthly Tracked Users`
   - **Event name**: `mtu_count`
   - **Display name**: `MTU`
   - **Aggregation**: `Last value during period`
4. Save the **Meter ID** (starts with `mtr_`)

### Step 2: Create a Product and Price

1. Go to **Stripe Dashboard > Product catalog**
2. Create a new product:
   - **Name**: `Beton Inspector - Usage Based`
   - **Description**: `Monthly usage based on tracked users`
3. Add a price:
   - **Pricing model**: Usage-based
   - **Usage type**: Metered
   - **Charge type**: Per unit
   - **Price per unit**: Your rate (e.g., $0.10 per MTU over free tier)
   - **Billing period**: Monthly
   - **Meter**: Select the meter created in Step 1
4. Save the **Price ID** (starts with `price_`)

### Step 3: Configure Free Tier

The free tier is configured in code at `lib/utils/deployment.ts`:

```typescript
export const BILLING_CONFIG = {
  FREE_TIER_MTU_LIMIT: 1000, // First 1000 MTU free
  MTU_COST_CENTS: 10,        // $0.10 per MTU after free tier
}
```

### Step 4: Configure Customer Portal

1. Go to **Stripe Dashboard > Settings > Billing > Customer portal**
2. Enable features:
   - **Invoice history**: Allow viewing invoices
   - **Payment methods**: Allow updating payment methods
   - **Subscription cancellation**: Allow cancellation
3. Configure branding to match your app

---

## Webhook Configuration

### Required Webhook Events

Subscribe to these events:

| Event | Purpose |
|-------|---------|
| `customer.subscription.created` | Track new subscriptions |
| `customer.subscription.updated` | Handle plan changes |
| `customer.subscription.deleted` | Handle cancellations |
| `invoice.payment_succeeded` | Confirm successful payments |
| `invoice.payment_failed` | Handle failed payments |
| `payment_method.attached` | Track new payment methods |

### Production Setup

1. Go to **Stripe Dashboard > Developers > Webhooks**
2. Click **Add endpoint**
3. Configure:
   - **Endpoint URL**: `https://your-domain.com/api/webhooks/stripe`
   - **Events**: Select the events listed above
4. Save the **Signing secret** (starts with `whsec_`)

### Local Development with Stripe CLI

```bash
# Install Stripe CLI
brew install stripe/stripe-cli/stripe

# Login to Stripe
stripe login

# Forward webhooks to local server
stripe listen --forward-to localhost:3000/api/webhooks/stripe

# The CLI will output a webhook signing secret - use this for local testing
# STRIPE_WEBHOOK_SECRET=whsec_...
```

---

## Testing

### Verify MTU Reporting

1. Check the `/api/billing/calculate-mtu` endpoint:
   ```bash
   curl -X POST https://your-domain.com/api/billing/calculate-mtu \
     -H "Authorization: Bearer YOUR_TOKEN" \
     -H "Content-Type: application/json"
   ```

2. Check Stripe Dashboard > Billing > Meters to see reported usage

### Test Webhook Delivery

```bash
# Trigger a test event
stripe trigger customer.subscription.created

# View webhook logs
stripe logs tail
```

### Test Payment Flow

1. Use Stripe test card: `4242 4242 4242 4242`
2. Any future expiry date and CVC
3. Complete the card linking flow in your app
4. Verify subscription is created in Stripe Dashboard

---

## Troubleshooting

### Common Issues

#### "Billing is disabled in self-hosted mode"

**Cause**: `DEPLOYMENT_MODE` is set to `self-hosted` or not set.

**Solution**: Set `DEPLOYMENT_MODE=cloud` in your environment.

#### "No billing customer found"

**Cause**: Workspace doesn't have a Stripe customer ID.

**Solution**:
1. Check `workspace_billing` table for the workspace
2. Customer should be created during onboarding flow
3. If missing, the setup flow needs to be completed

#### "Invalid webhook signature"

**Cause**: Webhook signing secret mismatch.

**Solution**:
1. Verify `STRIPE_WEBHOOK_SECRET` matches the endpoint in Stripe Dashboard
2. For local development, use the secret from `stripe listen` output

#### MTU Not Being Reported

1. Check cron job logs at `/api/cron/mtu-tracking`
2. Verify PostHog credentials are valid
3. Check `mtu_tracking` table for recent entries
4. Verify Stripe Billing Meter ID is correct

#### Webhook Events Not Processing

1. Check Stripe Dashboard > Developers > Webhooks > Event logs
2. Verify endpoint URL is correct
3. Check server logs for errors
4. Ensure endpoint returns 200 status

### Debugging Commands

```bash
# View recent billing events
stripe events list --limit 10

# Check specific subscription
stripe subscriptions retrieve sub_...

# View meter usage
stripe billing meters list
```

### Log Locations

- **API logs**: Vercel Dashboard > Project > Logs
- **Webhook logs**: Stripe Dashboard > Developers > Webhooks
- **Database logs**: Supabase Dashboard > Logs

---

## Architecture Reference

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   PostHog       │────▶│  MTU Tracking   │────▶│  Stripe Meter   │
│   (Events)      │     │  (Cron Job)     │     │  (Usage Report) │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                              │
                              ▼
                        ┌─────────────────┐
                        │  workspace_     │
                        │  billing table  │
                        └─────────────────┘
                              │
                              ▼
┌─────────────────┐     ┌─────────────────┐
│  Stripe         │◀───▶│  Webhook        │
│  Dashboard      │     │  Handler        │
└─────────────────┘     └─────────────────┘
```

---

## Security Considerations

1. **Never commit Stripe keys** - Use environment variables only
2. **Validate webhook signatures** - Always verify the `stripe-signature` header
3. **Use HTTPS** - All webhook endpoints must use HTTPS in production
4. **Rotate keys periodically** - Update API keys and webhook secrets as needed
5. **Audit access** - Review who has access to Stripe Dashboard

---

## Related Documentation

- [Stripe Billing Meters](https://stripe.com/docs/billing/subscriptions/usage-based/recording-usage)
- [Stripe Webhooks](https://stripe.com/docs/webhooks)
- [Stripe CLI](https://stripe.com/docs/stripe-cli)
