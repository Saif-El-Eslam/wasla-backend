# Payments module

## Current status

The generalized payments module is available but dormant. Paymob is its first gateway.

- Module location: backend/src/modules/payments
- Paymob gateway: backend/src/modules/payments/providers/paymob
- It is not imported by subscriptions, plans, server startup, or the frontend.
- It has no controller or route mounted in backend/src/app.ts.
- It does not create intentions, redirect users, process webhooks, or update subscriptions automatically.
- PAYMOB_ENABLED defaults to false.

Nothing in the current application flow changes until the activation steps below are implemented deliberately.

## What the module provides

- A generic PaymentGateway contract for multiple payment providers.
- A typed PaymobGateway using the current Intention API.
- Input validation for minor-unit amounts, currencies, items, and payment methods.
- Unified Checkout URL generation.
- Paymob transaction HMAC-SHA512 generation and constant-time verification.
- Parsing of a Paymob transaction callback into a small normalized summary.
- Configuration validation that runs only when createPaymobConfig is called.
- Typed request errors that identify retryable responses such as HTTP 429 and 5xx.

The module intentionally does not provide payment database models, billing routes, idempotency persistence, subscription mutations, or frontend checkout UI.

## Adding future gateways

Each gateway adapter belongs under backend/src/modules/payments/providers and implements PaymentGateway with its own typed checkout input.

Examples:

    providers/
      paymob/
      stripe/
      checkout/
      tap/

Subscription and billing orchestration should depend on PaymentGateway, not import a provider-specific HTTP client. Provider-specific identifiers and webhook payloads should remain inside the adapter and payment ledger.

## Paymob setup

1. Create and verify the Paymob merchant account.
2. Obtain the API secret key, public key, and HMAC secret.
3. Enable the required payment methods and copy their integration IDs.
4. Use Paymob test credentials until the full checkout and webhook flow passes.
5. Configure a processed-transaction callback only after the webhook endpoint exists.
6. Configure the browser redirection URL for user experience, not subscription activation.

Paymob reference:

- https://developers.paymob.com/paymob-docs/integration-paths/apis
- https://developers.paymob.com/paymob-docs/developers/checkout-experiences
- https://developers.paymob.com/paymob-docs/developers/webhook-callbacks-and-hmac

## Environment configuration

Keep the gateway disabled until the billing flow is ready:

    PAYMOB_ENABLED=false

When activating it, provide:

    PAYMOB_ENABLED=true
    PAYMOB_SECRET_KEY=...
    PAYMOB_PUBLIC_KEY=...
    PAYMOB_HMAC_SECRET=...
    PAYMOB_API_BASE_URL=https://accept.paymob.com
    PAYMOB_REQUEST_TIMEOUT_MS=15000

Do not expose PAYMOB_SECRET_KEY or PAYMOB_HMAC_SECRET to the frontend. Only the public key and intention client secret may be used to launch hosted checkout.

## Standalone usage

This example creates a checkout only when the gateway has explicitly been enabled:

    import {
      createPaymobConfig,
      PaymobGateway,
    } from '../modules/payments';

    const config = createPaymobConfig();

    if (config) {
      const gateway = new PaymobGateway(config);

      const checkout = await gateway.createCheckout({
        amount: 75000,
        currency: 'EGP',
        payment_methods: [123456],
        items: [
          {
            name: 'Wasla Starter annual plan',
            amount: 75000,
            quantity: 1,
          },
        ],
        billing_data: {
          first_name: 'Venue',
          last_name: 'Owner',
          email: 'owner@example.com',
          phone_number: '+201000000001',
        },
        special_reference: 'your-internal-payment-attempt-id',
        notification_url: 'https://api.example.com/api/v1/webhooks/paymob',
        redirection_url: 'https://app.example.com/en/settings?payment=return',
      });

      console.log(checkout.checkoutUrl);
    }

This code is an example only and is not imported anywhere in Wasla. Do not log checkout secrets in production.

The amount is expressed in the smallest currency unit. For EGP, multiply the server-owned plan price by 100. The gateway validates that amount equals the sum of item amounts.

## Recommended activation steps

### 1. Add a payment ledger

Do not use SubscriptionHistory as the payment ledger. Add dedicated models in a new migration, for example:

    enum PaymentAttemptStatus {
      PENDING
      SUCCEEDED
      FAILED
      EXPIRED
      CANCELED
      REFUNDED
    }

    model PaymentAttempt {
      id                    String               @id @default(uuid())
      venueId               String
      subscriptionId        String?
      planCode              MenuPlan
      gateway               PaymentProvider
      status                PaymentAttemptStatus @default(PENDING)
      amountMinor           Int
      currency              String
      idempotencyKey        String               @unique
      providerIntentionId   String?              @unique
      providerTransactionId String?              @unique
      checkoutExpiresAt     DateTime?
      paidAt                DateTime?
      failureCode           String?
      createdAt             DateTime             @default(now())
      updatedAt             DateTime             @updatedAt

      @@index([venueId, createdAt])
      @@index([status, createdAt])
    }

    model PaymentWebhookEvent {
      id                 String   @id @default(uuid())
      gateway            PaymentProvider
      providerEventKey   String
      payloadHash        String
      receivedAt         DateTime @default(now())
      processedAt        DateTime?
      processingError    String?

      @@unique([gateway, providerEventKey])
    }

Add the appropriate Venue and Subscription relations when creating the real migration.

### 2. Add billing orchestration

Create a provider-neutral billing service that:

1. Requires an owner or authorized manager.
2. Loads the active plan from the database.
3. Calculates amountMinor on the server.
4. Creates PaymentAttempt with a unique idempotency key.
5. Passes PaymentAttempt.id as special_reference.
6. Calls the selected PaymentGateway.
7. Stores providerIntentionId and checkout expiration.
8. Returns only the checkout URL and internal payment-attempt ID.

Never accept price, currency, venue ID, or plan entitlements directly from the browser.

### 3. Add routes only when approved

Recommended provider-neutral application routes:

    POST /api/v1/billing/checkout
    GET  /api/v1/billing/payments/:paymentAttemptId
    GET  /api/v1/billing/history

Recommended provider webhook route:

    POST /api/v1/webhooks/paymob

The checkout routes should use normal authentication and tenant authorization. The webhook route is public but must pass Paymob HMAC verification.

### 4. Process Paymob webhooks safely

The webhook handler should:

1. Read the HMAC value supplied by Paymob.
2. Call gateway.verifyWebhook before trusting the payload.
3. Resolve PaymentAttempt using special_reference or the stored provider intention/order ID.
4. Reject amount, currency, merchant, or integration mismatches.
5. Insert PaymentWebhookEvent using a stable unique provider event key.
6. Return HTTP 200 for an already processed valid event.
7. Update PaymentAttempt and Subscription in one database transaction.
8. Create SubscriptionHistory with paymentProvider PAYMOB.
9. Trigger notifications through the notifications outbox only after commit.

The redirect page must never activate a subscription. Paymob documents the processed callback as the payment source of truth.

The module exports PAYMOB_TRANSACTION_HMAC_FIELDS based on the transaction callback contract. Compare this list with the exact Paymob documentation and account callback type at activation time. If Paymob changes or the selected callback uses different fields, pass the documented field list explicitly rather than accepting an unverifiable payload.

### 5. Handle retries and ordering

- Make checkout creation idempotent.
- Deduplicate webhooks.
- Allow valid webhook replay.
- Handle a delayed success after the browser has already returned.
- Do not downgrade a succeeded payment because an older pending event arrives later.
- Record failed and declined attempts without changing entitlements.
- Define how refunds, chargebacks, and voids affect the subscription.

### 6. Frontend activation

After the backend flow exists:

1. Add a Choose plan or Renew action.
2. Call the provider-neutral billing checkout endpoint.
3. Redirect the browser to checkoutUrl.
4. Treat the Paymob return page as pending.
5. Poll the internal payment-attempt endpoint or refresh subscription state.
6. Show success only after the verified webhook has updated the payment attempt.

### 7. Recurring subscriptions

The dormant module currently implements one-time Intention and Unified Checkout support. It does not implement Paymob recurring subscription APIs, saved cards, or merchant-initiated transactions.

Add recurring billing only after one-time payments, webhook idempotency, refunds, and operational reconciliation are stable.

### 8. Test before enabling

Add automated tests for:

- Disabled configuration returning null.
- Missing configuration rejection.
- Amount and currency validation.
- Server-owned price calculation.
- Idempotent checkout creation.
- Unified Checkout URL generation.
- HMAC verification using Paymob test fixtures.
- Tampered webhook rejection.
- Duplicate and out-of-order webhook handling.
- Tenant isolation.
- Successful, declined, expired, refunded, and replayed transactions.

Only set PAYMOB_ENABLED=true after the ledger, routes, HMAC verification, reconciliation, frontend pending state, monitoring, and test-mode checkout are ready.
