# Billing System QA Checklist (BETON-121)

This document outlines the end-to-end testing procedures for the Stripe MTU-based billing system.

## Prerequisites

### Environment Setup
- [ ] `DEPLOYMENT_MODE=cloud` is set (billing enabled)
- [ ] `STRIPE_SECRET_KEY` is set to test mode key (sk_test_...)
- [ ] `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` is set (pk_test_...)
- [ ] `STRIPE_WEBHOOK_SECRET` is configured for local testing
- [ ] Supabase database has billing tables migrated

### Stripe Test Mode Setup
- [ ] Create test Billing Meter named `mtu_usage` in Stripe Dashboard
- [ ] Note the meter ID for STRIPE_BILLING_METER_ID env var
- [ ] Create test product with metered pricing ($0.02/unit)

---

## Test Scenarios

### 1. Self-Hosting Mode (Billing Disabled)
**Objective**: Verify billing is completely disabled when DEPLOYMENT_MODE=self-hosted

- [ ] Set `DEPLOYMENT_MODE=self-hosted`
- [ ] Verify `/api/billing/status` returns minimal response
- [ ] Verify no billing UI appears in settings
- [ ] Verify no threshold banners appear
- [ ] Verify no access restrictions apply

### 2. New Workspace Flow
**Objective**: Test new workspace initialization

- [ ] Create new workspace via signup
- [ ] Verify `workspace_billing` record is created
- [ ] Verify initial status is 'free'
- [ ] Verify MTU limit is set to 200 (FREE_TIER_MTU_LIMIT)
- [ ] Verify billing cycle dates are set correctly

### 3. Card Linking Flow
**Objective**: Test the payment method collection flow

- [ ] Navigate to Settings page
- [ ] Verify BillingStatusCard shows "Free Tier" status
- [ ] Click "Add Payment Method" button
- [ ] Verify CardLinkingModal opens with info step
- [ ] Click "Continue" to card input step
- [ ] Verify Stripe PaymentElement loads
- [ ] Enter test card: 4242 4242 4242 4242
- [ ] Submit form
- [ ] Verify success confirmation appears
- [ ] Verify payment method appears in settings
- [ ] Verify status changes to 'active'

### 4. PostHog Connection + Card Prompt
**Objective**: Test auto-prompt after PostHog connection

- [ ] Create workspace without payment method
- [ ] Navigate to Settings
- [ ] Connect PostHog integration
- [ ] Verify CardLinkingModal appears automatically
- [ ] Complete or dismiss card flow
- [ ] Verify modal doesn't appear again for same session

### 5. MTU Tracking
**Objective**: Test MTU calculation and storage

- [ ] Trigger `/api/cron/mtu-tracking` with CRON_SECRET
- [ ] Verify MTU is calculated from PostHog events
- [ ] Verify `mtu_tracking` record is created
- [ ] Verify `workspace_billing.current_cycle_mtu` is updated
- [ ] Verify peak MTU tracking works

### 6. Threshold Warnings (90%)
**Objective**: Test 90% threshold notification

- [ ] Set workspace to 180/200 MTU (90%)
- [ ] Trigger threshold notification cron
- [ ] Verify warning email is sent (or logged)
- [ ] Verify `threshold_90_notified` flag is set
- [ ] Verify ThresholdWarningBanner appears (yellow)
- [ ] Verify notification is not sent again

### 7. Threshold Warnings (95%)
**Objective**: Test 95% threshold notification

- [ ] Set workspace to 190/200 MTU (95%)
- [ ] Trigger threshold notification cron
- [ ] Verify urgent email is sent
- [ ] Verify `threshold_95_notified` flag is set
- [ ] Verify DashboardThresholdBanner appears (orange)
- [ ] Verify notification is not sent again

### 8. Threshold Exceeded (100%+)
**Objective**: Test exceeded threshold and access restriction

- [ ] Set workspace to 210/200 MTU (105%)
- [ ] Trigger threshold notification cron
- [ ] Verify exceeded email is sent
- [ ] Verify `threshold_exceeded_notified` flag is set
- [ ] Verify status changes to 'card_required'
- [ ] Verify AccessBlockedOverlay appears
- [ ] Verify user cannot dismiss overlay
- [ ] Add payment method
- [ ] Verify overlay disappears
- [ ] Verify status changes to 'active'

### 9. Stripe Meter Event Reporting
**Objective**: Test MTU reporting to Stripe

- [ ] Ensure workspace has Stripe customer and subscription
- [ ] Run MTU tracking cron
- [ ] Verify meter event is recorded in Stripe Dashboard
- [ ] Verify `mtu_tracking.reported_to_stripe` is set
- [ ] Verify idempotency (running again doesn't duplicate)

### 10. Billing Cycle Transition
**Objective**: Test monthly cycle reset

- [ ] Set workspace `current_cycle_end` to past date
- [ ] Run MTU tracking cron
- [ ] Verify cycle dates are updated
- [ ] Verify notification flags are reset
- [ ] Verify MTU count resets (or carries as appropriate)

### 11. Stripe Webhook Events
**Objective**: Test webhook handling

- [ ] Send `customer.subscription.created` event
- [ ] Verify subscription is recorded in database
- [ ] Send `customer.subscription.updated` event
- [ ] Verify status changes are reflected
- [ ] Send `payment_method.attached` event
- [ ] Verify payment method is recorded
- [ ] Send `invoice.paid` event
- [ ] Verify billing event is logged

### 12. Stripe Portal Session
**Objective**: Test billing portal redirect

- [ ] Add payment method to workspace
- [ ] Click "Manage Billing" in settings
- [ ] Verify redirect to Stripe portal
- [ ] Update payment method in portal
- [ ] Verify changes reflect in app

---

## Test Cards

| Card Number | Behavior |
|-------------|----------|
| 4242 4242 4242 4242 | Success |
| 4000 0000 0000 0002 | Decline |
| 4000 0000 0000 9995 | Insufficient funds |
| 4000 0027 6000 3184 | 3D Secure required |

Use any future expiry date and any 3-digit CVC.

---

## Local Webhook Testing

```bash
# Install Stripe CLI
brew install stripe/stripe-cli/stripe

# Forward webhooks to local server
stripe listen --forward-to localhost:3000/api/webhooks/stripe

# In another terminal, trigger test events
stripe trigger customer.subscription.created
stripe trigger invoice.paid
```

---

## Environment Variables Checklist

```env
# Required for billing
DEPLOYMENT_MODE=cloud
STRIPE_SECRET_KEY=sk_test_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_BILLING_METER_ID=mtr_...

# Optional email notifications
RESEND_API_KEY=re_...
RESEND_FROM_EMAIL=Beton Inspector <noreply@betoninspector.com>

# Cron authentication
CRON_SECRET=your-cron-secret
```

---

## Known Limitations

1. **Self-hosted mode**: No billing enforcement
2. **Free tier**: 200 MTU/month hard limit without card
3. **Metered billing**: Charges apply only after free tier exceeded
4. **Notification deduplication**: Each threshold level notifies once per cycle
