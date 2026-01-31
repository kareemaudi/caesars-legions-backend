# MontyPay Integration Setup

## Step 1: Get API Keys

1. **Visit:** https://portal.montypay.com
2. **Login with:**
   - Username: `cmonkeytribe`
   - Password: `w@rsf3M3fS`

3. **Navigate to:** Settings → API Keys (or similar)

4. **Copy these values:**
   - Merchant ID
   - API Key (Public/Client Key)
   - Secret Key (Server Key)

5. **Add to `.env` file:**

```bash
# MontyPay Configuration
MONTY_MERCHANT_ID=your_merchant_id_here
MONTY_API_KEY=your_public_key_here
MONTY_SECRET_KEY=your_secret_key_here
```

---

## Step 2: Create Products (Optional)

If MontyPay requires pre-creating products:

**Tier 1: Starter ($297/month)**
- Name: Caesar's Legions - Starter
- Price: $297 USD
- Billing: Monthly recurring
- Description: 100 personalized cold emails per week

**Tier 2: Professional ($997/month)**
- Name: Caesar's Legions - Professional
- Price: $997 USD
- Billing: Monthly recurring
- Description: 500 personalized cold emails per week

**Tier 3: Enterprise ($2,997/month)**
- Name: Caesar's Legions - Enterprise
- Price: $2,997 USD
- Billing: Monthly recurring
- Description: 1000+ personalized cold emails per week

---

## Step 3: Configure Webhooks

**Webhook URL:** `https://promptabusiness.com/api/webhooks/monty`

**Events to subscribe to:**
- `payment.succeeded` → New subscription
- `payment.failed` → Payment issue
- `subscription.cancelled` → Client cancellation

---

## Step 4: Test Integration

Once API keys are in `.env`:

```bash
# Test payment link creation
node scripts/test-monty-payment.js
```

This will create a test payment link for Tier 1 ($297/month).

---

## Status

- [x] Integration code written (`lib/monty-integration.js`)
- [ ] API keys added to `.env`
- [ ] Webhooks configured
- [ ] Test payment completed

Once API keys are added, Caesar's Legions will be ready to accept payments via MontyPay! 🎉
