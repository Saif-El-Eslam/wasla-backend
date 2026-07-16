# Notifications module

## Current status

The generalized notifications module is available but dormant. WhatsApp Cloud API is its first provider.

- Module location: backend/src/modules/notifications
- WhatsApp provider: backend/src/modules/notifications/providers/whatsapp
- It is not imported by auth, users, feedback, subscriptions, or server startup.
- It has no controller or route mounted in backend/src/app.ts.
- It does not start a worker or send messages automatically.
- WHATSAPP_ENABLED defaults to false.

Nothing in the current application flow changes until the activation steps below are implemented deliberately.

## What the module provides

- A generic NotificationProvider contract for WhatsApp, SMS, email, and future channels.
- A typed WhatsAppNotificationProvider for Meta Cloud API template messages.
- A sendOtp helper for approved authentication templates.
- Configuration validation that runs only when createWhatsAppConfig is called.
- Webhook challenge verification.
- X-Hub-Signature-256 verification using the raw request body.
- Extraction of sent, delivered, read, and failed message statuses.
- Typed request errors that identify retryable responses such as HTTP 429 and 5xx.

The module intentionally does not provide database persistence, routes, retry jobs, or hooks into the OTP flow.

## Adding future channels

Each channel adapter belongs under backend/src/modules/notifications/providers and implements NotificationProvider with its own typed request.

Examples:

    providers/
      whatsapp/
      sms/
      email/
      push/

An SMS adapter can use Twilio, Infobip, or another provider without changing WhatsApp code. An email adapter can use Gmail, Amazon SES, Resend, or another provider.

For production transactional email, prefer a transactional provider with domain authentication, bounce webhooks, and delivery metrics. Gmail can implement the same contract, but it should not be assumed to be the only email transport.

## Meta setup

1. Create or select a Meta business portfolio.
2. Create a WhatsApp Business Account and register the Wasla sending number.
3. Create a system-user access token with whatsapp_business_messaging permission.
4. Create approved AUTHENTICATION templates for every supported language.
5. For OTP copy-code templates, use a BODY component and an OTP COPY_CODE button.
6. Create approved UTILITY templates for any non-OTP notifications.
7. Configure a webhook URL only after the webhook route described below exists.

Use the exact language code shown on each approved template. Do not assume that the English and Arabic codes are en and ar; copy the approved codes from WhatsApp Manager.

Meta reference:

- https://www.postman.com/meta/whatsapp-business-platform/overview
- https://www.postman.com/meta/whatsapp-business-platform/request/6vkv46u/create-authentication-template-w-otp-copy-code-button

## Environment configuration

Keep the module disabled until the application flow is ready:

    WHATSAPP_ENABLED=false

When activating it, provide:

    WHATSAPP_ENABLED=true
    WHATSAPP_ACCESS_TOKEN=...
    WHATSAPP_PHONE_NUMBER_ID=...
    WHATSAPP_GRAPH_API_VERSION=vXX.X
    WHATSAPP_API_BASE_URL=https://graph.facebook.com
    WHATSAPP_APP_SECRET=...
    WHATSAPP_VERIFY_TOKEN=use-a-long-random-value
    WHATSAPP_REQUEST_TIMEOUT_MS=10000

Select and test a Graph API version supported by the Meta app at activation time. Do not commit access tokens or app secrets.

## Standalone usage

This example sends only when the module has explicitly been enabled:

    import {
      createWhatsAppConfig,
      WhatsAppNotificationProvider,
    } from '../modules/notifications';

    const config = createWhatsAppConfig();

    if (config) {
      const whatsapp = new WhatsAppNotificationProvider(config);

      await whatsapp.sendOtp({
        to: '+201000000001',
        code: '123456',
        templateName: 'wasla_phone_verification',
        languageCode: 'en_US',
      });
    }

This code is an example only and is not imported anywhere in Wasla.

For utility notifications, call sendTemplate with the variables matching the approved template. Never use a marketing template for transactional authentication or billing messages.

## Recommended activation steps

### 1. Add a message outbox

Do not send WhatsApp messages inside an authentication database transaction or directly in the HTTP request.

Add a durable outbox model in a new migration, for example:

    enum MessageDeliveryStatus {
      PENDING
      PROCESSING
      SENT
      DELIVERED
      READ
      FAILED
    }

    model MessageDelivery {
      id                String                @id @default(uuid())
      channel           String
      templateName      String
      recipient         String
      locale            String
      payload           Json
      status            MessageDeliveryStatus @default(PENDING)
      providerMessageId String?               @unique
      attempts          Int                   @default(0)
      nextAttemptAt     DateTime?
      lastError         String?
      createdAt         DateTime              @default(now())
      updatedAt         DateTime              @updatedAt

      @@index([status, nextAttemptAt])
    }

Do not store plaintext OTP values in the outbox. The current OtpCode model already has deliveryCodeEncrypted for a short-lived delivery copy.

Before production activation, move OTP delivery encryption away from JWT_SECRET to a dedicated rotating OTP_DELIVERY_ENCRYPTION_KEY.

### 2. Enqueue after OTP creation commits

After register, resendOtp, or a phone change successfully commits:

1. Create one pending MessageDelivery record referencing the OTP record.
2. Let a worker claim the delivery.
3. Decrypt the delivery code only inside the worker.
4. Call WhatsAppNotificationProvider.sendOtp.
5. Save the returned wamid as providerMessageId.
6. Clear deliveryCodeEncrypted after Meta accepts the message.

Do not return WhatsApp provider failures from registration. The user account and OTP should remain valid while the outbox retries delivery.

### 3. Add a worker

The worker should:

- Claim jobs atomically.
- Use exponential backoff with jitter.
- Retry only timeout, HTTP 429, and 5xx errors.
- Treat invalid templates, invalid recipients, and authorization failures as terminal.
- Cap attempts and surface exhausted jobs to operations.
- Avoid logging access tokens, OTPs, or full recipient phone numbers.

### 4. Add webhook routes

Create a normal whatsapp.routes.ts and whatsapp.controller.ts only when activation is approved.

The required endpoints are:

    GET  /api/v1/webhooks/whatsapp
    POST /api/v1/webhooks/whatsapp

The GET endpoint should call verifyWhatsAppWebhookChallenge.

The POST endpoint must receive the raw body before JSON transformation, verify it with verifyWhatsAppWebhookSignature, parse the JSON only after verification, then update MessageDelivery by providerMessageId.

Because the current app applies express.json globally, either mount this webhook route before express.json with an express.raw parser or add a narrowly scoped raw-body capture. Do not verify a reconstructed JSON string.

### 5. Add notification policies

Start with a small transactional set:

- OTP verification.
- Payment succeeded.
- Payment failed.
- Subscription renewal reminder.
- Subscription expired or past due.
- Critical low-rating feedback notification, if the venue opts in.

Store opt-in and opt-out preferences before enabling optional notifications.

### 6. Test before enabling

Add automated tests for:

- Disabled configuration returning null.
- Missing configuration rejection.
- Exact OTP component shape.
- Recipient validation.
- Challenge-token comparison.
- Raw-body signature validation.
- Duplicate status webhooks.
- Retry and terminal-failure behavior.
- Arabic and English approved templates on real test recipients.

Only set WHATSAPP_ENABLED=true after the outbox, worker, webhook, monitoring, and templates are ready.
