# Stripe Integration Setup Guide

Complete Stripe payment integration for Caesar's Legions.

---

## Features Built ✅

1. **Automatic Subscription Creation** - Creates customer + subscription on signup
2. **Checkout Flow** - Redirects to Stripe Checkout for payment
3. **Webhook Handling** - Processes payment success/failure events
4. **Customer Portal** - Allow clients to manage subscriptions
5. **Payment Pages** - Success/cancel pages with next steps

---

## Setup Steps

### 1. Create Stripe Account

Go to https://dashboard.stripe.com/register

### 2. Get API Keys

Dashboard → Developers → API keys

Copy:
- **Secret key** (sk_test_...) → `STRIPE_SECRET_KEY`
- **Publishable key** (pk_test_...) → `STRIPE_PUBLISHABLE_KEY`

### 3. Create Product & Price

Dashboard → Products → Add Product

**Product Details:**
- Name: Caesar's Legions - Monthly
- Description: AI-powered cold email service (100 emails/week)

**Pricing:**
- Type: Recurring
- Price: $250/month
- Billing period: Monthly
- Currency: USD

Copy the **Price ID** (price_...) → `STRIPE_PRICE_ID`

### 4. Set Up Webhooks

Dashboard → Developers → Webhooks → Add endpoint

**Endpoint URL:**
```
https://your-domain.com/webhooks/stripe
```

**Events to listen for:**
- `checkout.session.completed`
- `invoice.payment_failed`
- `customer.subscription.deleted`

Copy the **Signing secret** (whsec_...) → `STRIPE_WEBHOOK_SECRET`

### 5. Configure Environment Variables

Add to `.env`:

```bash
# Stripe
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_PRICE_ID=price_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Base URL (for redirects)
BASE_URL=https://your-domain.com
```

### 6. Test Locally

Use Stripe CLI to forward webhooks to localhost:

```bash
# Install Stripe CLI
# https://stripe.com/docs/stripe-cli

# Login
stripe login

# Forward webhooks
stripe listen --forward-to localhost:3000/webhooks/stripe

# Copy the webhook signing secret to .env
STRIPE_WEBHOOK_SECRET=whsec_...

# Start server
npm start
```

### 7. Test Signup Flow

1. Visit http://localhost:3000/signup.html
2. Fill in the form and submit
3. You'll be redirected to Stripe Checkout
4. Use test card: `4242 4242 4242 4242` (any future date, any CVC)
5. Complete payment
6. Redirected to success page
7. Check database - client status should be `active`

---

## How It Works

### Signup Flow

1. User fills signup form → POST `/api/signup`
2. Server creates client record in database
3. Server calls `stripeIntegration.createSubscription(client)`
4. Stripe creates customer + subscription
5. Server returns `checkoutUrl`
6. Frontend redirects to Stripe Checkout
7. User enters payment info
8. Stripe processes payment
9. Stripe sends webhook: `checkout.session.completed`
10. Server updates client status to `active`
11. User redirected to `/payment-success.html`

### Webhook Flow

```
Stripe → POST /webhooks/stripe → Verify signature → Handle event
```

**Events handled:**
- `checkout.session.completed` → Activate client account
- `invoice.payment_failed` → Pause client campaigns
- `customer.subscription.deleted` → Mark client as cancelled

---

## Files Created

```
caesars-legions-backend/
├── lib/
│   └── stripe-integration.js       # Core Stripe logic
├── public/
│   ├── signup.html                 # Updated with checkout redirect
│   ├── payment-success.html        # Success page
│   └── payment-cancel.html         # Cancel page
├── scripts/
│   └── dashboard-server.js         # Updated with Stripe endpoints
└── .env.template                   # Environment variables template
```

---

## Database Schema Changes

Added fields to clients table:

```json
{
  "id": 1,
  "email": "...",
  "name": "...",
  "company": "...",
  "status": "active",              // pending, active, payment_failed, cancelled
  "stripe_customer_id": "cus_...",
  "stripe_subscription_id": "sub_...",
  "created_at": 1234567890
}
```

---

## Testing

### Test Cards

| Card Number         | Description               |
|---------------------|---------------------------|
| 4242 4242 4242 4242 | Successful payment        |
| 4000 0000 0000 0002 | Card declined             |
| 4000 0000 0000 9995 | Insufficient funds        |

Use any future expiration date and any 3-digit CVC.

---

## Customer Portal

Allow clients to manage their subscription:

```javascript
const portalUrl = await stripeIntegration.createPortalSession(client.stripe_customer_id);
// Redirect client to portalUrl
```

They can:
- Update payment method
- Cancel subscription
- View invoices
- Update billing info

---

## Production Deployment

1. Switch from test keys to live keys in `.env`
2. Update webhook endpoint URL in Stripe Dashboard
3. Test with real (small) payments first
4. Monitor Stripe Dashboard for issues

---

## Pricing Changes

To change pricing:
1. Create new Price in Stripe Dashboard
2. Update `STRIPE_PRICE_ID` in `.env`
3. Old subscriptions stay at old price (grandfathered)

---

## Support

Stripe docs: https://stripe.com/docs
Questions: kareem@cmonkeytribe.com

🏛️ **Veni. Vidi. Vici.**
