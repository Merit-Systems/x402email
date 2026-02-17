# x402email — x402-Native Email Sending Service

Pay-per-send email via x402. No API keys. Fund a wallet, send email.

**Domains**: x402email.com (primary), ocpemail.com (alias/future)
**Repo**: ~/Documents/Code/merit-systems/x402email

## What This Is

An x402-protected email sending API. Three tiers:

1. **Shared domain** — send from `relay@x402email.com` for $0.02/email, x402 payment only, no auth
2. **Inbox** — buy `username@x402email.com` for $1/month, optionally forward to your real address, and/or retain messages for programmatic access via the messages API. Send from your inbox for $0.005/email. If `forwardTo` is omitted on buy, `retainMessages` is enabled automatically.
3. **Custom subdomain** — buy `alice.x402email.com` for $5 via x402, send from `anything@alice.x402email.com` for $0.005/email, wallet identity extracted from x402 payment. Up to 50 authorized signer wallets per subdomain.

Subdomain owners can also buy the matching inbox name (e.g., owner of `alice.x402email.com` can buy `alice@x402email.com`). The same wallet must own both.

## Tech Stack

- **Framework**: Next.js 15 (App Router)
- **Styling**: Tailwind CSS v4
- **Validation**: Zod 4
- **Payments + Routing**: @agentcash/router (fluent builder for x402 + SIWX), @x402/core, @x402/evm, @x402/extensions, @coinbase/x402
- **Auth**: SIWX via @agentcash/router `.siwx()` — CAIP-122 compliant, EVM + Solana
- **Discovery**: Auto-generated via `router.wellKnown()` and `router.openapi()`
- **Email**: AWS SES via AWS CLI ($0.0001/email) — SES is in sandbox (200/day), request prod access early
- **DNS**: AWS Route53 (hosted zone Z03469302BH1RZCVCZS5Z, scoped IAM user x402email-service)
- **Database**: Prisma ORM + Neon (serverless Postgres) via `neonctl` CLI
- **Deployment**: Vercel via `vercel` CLI
- **CLI tools available**: `aws` (authenticated, account 688567285858), `neonctl`, `vercel` (logged in as sragss)

## Pricing

| Action | Cost | x402 price string |
|--------|------|-------------------|
| Send email (shared domain) | $0.02 | `'0.02'` |
| Send email (subdomain or inbox) | $0.005 | `'0.005'` |
| Buy subdomain | $5 | `'5'` |
| Buy forwarding inbox (30 days) | $1 | `'1'` |
| Top up inbox 30 days | $1 | `'1'` |
| Top up inbox 90 days | $2.50 | `'2.5'` |
| Top up inbox 365 days | $8 | `'8'` |
| Create subdomain inbox | $0.25 | `'0.25'` |
| Read inbox/subdomain messages | $0.001 | `'0.001'` |
| Manage signers / status / update / cancel | Free | N/A (SIWX only) |

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│                      x402email API                       │
│                                                          │
│  /api/send             x402 payment → SES send           │
│  /api/inbox/buy        x402 payment → DB + forwarding    │
│  /api/inbox/send       x402 payment → SES send           │
│  /api/inbox/topup/*    x402 payment → extend expiry      │
│  /api/inbox/status     SIWX only → DB read               │
│  /api/inbox/update     SIWX only → DB update             │
│  /api/inbox/cancel     SIWX only → refund + DB           │
│  /api/subdomain/buy    x402 payment → DNS + DB           │
│  /api/subdomain/send   x402 payment → SES send           │
│  /api/subdomain/signers     SIWX only → DB update        │
│  /api/subdomain/status      SIWX only → DB read          │
│  /.well-known/x402     discovery                         │
│                                                          │
│  ┌───────────────────────────────────────────────────┐   │
│  │            @agentcash/router                      │   │
│  │  ┌────────────┐ ┌────────────┐ ┌──────────────┐   │   │
│  │  │  .paid()   │ │  .siwx()   │ │  .wellKnown  │   │   │
│  │  │  x402 pay  │ │  wallet ID │ │  .openapi()  │   │   │
│  │  └────────────┘ └────────────┘ └──────────────┘   │   │
│  │                                                   │   │
│  │  Lifecycle: body parse → validate → auth → handler│   │
│  │  SIWX nonces: PrismaNonceStore (DB-backed)        │   │
│  └───────────────────────────────────────────────────┘   │
│                                                          │
│  ┌──────────┐ ┌──────────┐ ┌──────────────────────────┐ │
│  │ AWS SES  │ │ Route53  │ │  Neon Postgres (Prisma)  │ │
│  │ send     │ │ DNS API  │ │  subdomains, signers,    │ │
│  │          │ │          │ │  send logs, siwx storage │ │
│  └──────────┘ └──────────┘ └──────────────────────────┘ │
└──────────────────────────────────────────────────────────┘
```

## SIWX — How It Works

SIWX (Sign-In With X) proves wallet identity. The `@agentcash/router` handles SIWX natively:

### Paid route (x402 payment + wallet from payment header):
```typescript
export const POST = router
  .route('send')
  .paid('0.02')
  .body(SendEmailRequestSchema)
  .description('Send an email ($0.02 via x402)')
  .handler(async ({ body, wallet }) => {
    // wallet is verified from the payment signature
  });
```

### SIWX route (free, wallet from SIWX proof):
```typescript
export const POST = router
  .route('subdomain/signers')
  .siwx()
  .body(ManageSignerRequestSchema)
  .description('Manage signers (SIWX, free)')
  .handler(async ({ body, wallet }) => {
    // wallet is verified via SIWX signature
  });
```

### Pre-payment validation (runs before 402 challenge):
```typescript
export const POST = router
  .route('subdomain/buy')
  .paid('5')
  .body(BuySubdomainRequestSchema)
  .validate(async (body) => {
    // Reject unavailable names before charging
    if (await nameExists(body.subdomain))
      throw Object.assign(new Error('Already taken'), { status: 409 });
  })
  .handler(async ({ body, wallet }) => { ... });
```

### Wire protocol:

**Server → Client (402 response)**:
```
Status: 402 Payment Required
PAYMENT-REQUIRED: <base64 JSON with extensions.sign-in-with-x>
```

The extension block includes: domain, uri, nonce (random 16 bytes hex), issuedAt, expirationTime, statement, supportedChains.

**Client → Server (with SIWX proof)**:
```
Header: SIGN-IN-WITH-X: <base64 JSON>
```

Contains: domain, address, uri, version, chainId, type (eip191/ed25519), nonce, issuedAt, expirationTime, signature.

Message format follows EIP-4361 (SIWE) for EVM, CAIP-122 for Solana.

### How we use SIWX for subdomain auth:

For x402email, SIWX is used for **authorization** (proving wallet identity) separate from **payment**:

1. **Paid routes** (`.paid()`): Wallet extracted from x402 payment signature. Used for send, buy, topup, and message read endpoints. Handler gets `wallet` from payment context.

2. **SIWX routes** (`.siwx()`): Wallet extracted from SIWX proof (free, no payment). Used for status, update, cancel, signers, inbox management, and message delete endpoints. Handler gets `wallet` from SIWX context.

3. **Subdomain send** (`.paid('0.005')`): Wallet comes from x402 payment. Handler checks wallet is owner or authorized signer in DB.

The router's `PrismaNonceStore` (in `lib/siwx/nonce-store.ts`) backs SIWX nonce replay prevention via the `SiwxNonce` Prisma table with probabilistic cleanup.

## API Endpoints

### POST /api/send — Shared domain send
**Protection**: x402 payment ($0.02), no SIWX
**From**: `noreply@x402email.com`

```json
{
  "to": ["alice@example.com"],
  "subject": "Hello",
  "html": "<p>Hello world</p>",
  "text": "Hello world",
  "replyTo": "sender@example.com"
}
```

Response:
```json
{
  "success": true,
  "messageId": "ses-message-id",
  "from": "noreply@x402email.com"
}
```

### POST /api/subdomain/buy — Purchase subdomain
**Protection**: x402 payment ($5), pre-payment validation via `.validate()`

```json
{
  "subdomain": "alice"
}
```

The buyer's wallet address is extracted from the x402 payment. No need to pass `ownerWallet` in the body.

Flow:
1. `.validate()` checks availability BEFORE 402 challenge (users don't pay for unavailable names)
2. x402 payment settles ($5)
3. Call AWS SES `VerifyDomainIdentity` + `VerifyDomainDkim` for `alice.x402email.com`
4. Call Route53 API to add DNS records (TXT verification, 3 DKIM CNAMEs, SPF, DMARC)
5. Store in DB with `dns_verified: false`
6. Return subdomain info

Response:
```json
{
  "success": true,
  "subdomain": "alice.x402email.com",
  "dnsStatus": "pending",
  "estimatedVerificationMinutes": 5
}
```

### POST /api/subdomain/send — Subdomain send
**Protection**: x402 payment ($0.005), wallet from payment

```json
{
  "from": "sam@alice.x402email.com",
  "to": ["bob@example.com"],
  "subject": "Hello from my subdomain",
  "html": "<p>Sent via x402email</p>",
  "text": "Sent via x402email",
  "replyTo": "sam@gmail.com"
}
```

Flow:
1. x402 payment settles ($0.005)
2. Handler gets `wallet` from payment context
3. Handler extracts subdomain from `from` address
4. Handler checks wallet is owner or authorized signer in DB
5. Handler checks subdomain DNS is verified
6. Send via SES
7. Log the send

### POST /api/subdomain/signers — Manage signers
**Protection**: SIWX only (free, no payment) via `.siwx()`

Add signer:
```json
{
  "action": "add",
  "subdomain": "alice",
  "walletAddress": "0x..."
}
```

Remove signer:
```json
{
  "action": "remove",
  "subdomain": "alice",
  "walletAddress": "0x..."
}
```

Max 50 signers per subdomain. Only the owner wallet can manage signers.

### GET /api/subdomain/status — Check subdomain status
**Protection**: SIWX only (free, no payment) via `.siwx()`

Query: `?subdomain=alice`

Response:
```json
{
  "subdomain": "alice.x402email.com",
  "ownerWallet": "0x...",
  "dnsVerified": true,
  "sesVerified": true,
  "signerCount": 3,
  "signers": ["0x...", "0x...", "0x..."],
  "createdAt": "2025-06-15T12:00:00Z"
}
```

### GET /.well-known/x402 — Discovery
Auto-generated by `router.wellKnown()`. Returns all x402-protected endpoints with pricing.

### GET /openapi.json — OpenAPI Spec
Auto-generated by `router.openapi()`. Returns full OpenAPI 3.1 spec for all registered routes.

## Database Schema (Prisma + Neon Postgres)

See `prisma/schema.prisma` for the full schema. Key models:

- **Subdomain** — purchased subdomains with owner wallet, DNS/SES verification status, optional `catchAllForwardTo`
- **SubdomainInbox** — per-address inboxes on subdomains (e.g., `biden@craig.x402email.com`), optional `forwardTo` + `retainMessages`, 500 message cap
- **SubdomainMessage** — retained inbound messages for subdomain inboxes, stored in S3
- **Inbox** — root domain inboxes (`username@x402email.com`), time-limited with `expiresAt`
- **InboxMessage** — retained inbound messages for root inboxes
- **Signer** — authorized signer wallets per subdomain (max 50)
- **SendLog** — all outbound sends, used for rate limiting and auditing
- **SiwxPayment** / **SiwxNonce** — SIWX authentication backing tables

## NonceStore Implementation (Prisma-backed)

```typescript
// lib/siwx/nonce-store.ts
import type { NonceStore } from '@agentcash/router';
import { prisma } from '@/lib/db/client';

export class PrismaNonceStore implements NonceStore {
  async check(nonce: string): Promise<boolean> {
    try {
      await prisma.siwxNonce.create({ data: { nonce } });
    } catch {
      return false; // duplicate nonce = replay
    }
    // Probabilistic cleanup of old nonces (1% chance per call)
    if (Math.random() < 0.01) {
      const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
      await prisma.siwxNonce.deleteMany({ where: { usedAt: { lt: cutoff } } }).catch(() => {});
    }
    return true;
  }
}
```

## DNS Automation Flow

When a subdomain is purchased:

```
1. AWS SES API
   ├── VerifyDomainIdentity('alice.x402email.com') → verification token
   └── VerifyDomainDkim('alice.x402email.com') → 3 DKIM tokens

2. Route53 DNS (hosted zone: x402email.com)
   ├── TXT  _amazonses.alice.x402email.com    → <verification-token>
   ├── CNAME <tok1>._domainkey.alice.x402email.com → <tok1>.dkim.amazonses.com
   ├── CNAME <tok2>._domainkey.alice.x402email.com → <tok2>.dkim.amazonses.com
   ├── CNAME <tok3>._domainkey.alice.x402email.com → <tok3>.dkim.amazonses.com
   ├── TXT  alice.x402email.com               → v=spf1 include:amazonses.com -all
   └── TXT  _dmarc.alice.x402email.com        → v=DMARC1; p=reject; rua=mailto:dmarc@x402email.com

3. Poll SES verification (usually 1-5 minutes)
   └── GetIdentityVerificationAttributes('alice.x402email.com')

4. Update DB: dnsVerified=true, sesVerified=true
```

## Directory Structure

```
x402email/
├── .claude/CLAUDE.md
├── .env.example
├── .gitignore
├── package.json
├── next.config.ts
├── tailwind.config.ts
├── tsconfig.json
├── docs/
│   └── deliverability.md        # Email deliverability setup & rationale
├── src/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx              # Landing page / docs
│   │   ├── api/
│   │   │   ├── send/
│   │   │   │   └── route.ts     # Shared domain send (x402 only)
│   │   │   ├── inbox/
│   │   │   │   ├── buy/route.ts         # Buy root inbox (x402)
│   │   │   │   ├── send/route.ts        # Send from inbox (x402)
│   │   │   │   ├── forward/route.ts     # SNS webhook for inbound email routing
│   │   │   │   ├── status/route.ts      # Inbox status (SIWX)
│   │   │   │   ├── update/route.ts      # Update inbox (SIWX)
│   │   │   │   ├── cancel/route.ts      # Cancel inbox (SIWX)
│   │   │   │   ├── topup/route.ts       # Topup 30d (x402)
│   │   │   │   ├── topup-quarter/route.ts
│   │   │   │   ├── topup-year/route.ts
│   │   │   │   └── messages/
│   │   │   │       ├── route.ts         # List messages (x402)
│   │   │   │       ├── read/route.ts    # Read message (x402)
│   │   │   │       └── delete/route.ts  # Delete message (SIWX)
│   │   │   └── subdomain/
│   │   │       ├── buy/route.ts         # Buy subdomain (x402 + SIWX)
│   │   │       ├── send/route.ts        # Subdomain send (x402 + SIWX)
│   │   │       ├── signers/route.ts     # Manage signers (SIWX)
│   │   │       ├── status/route.ts      # Subdomain status (SIWX)
│   │   │       ├── update/route.ts      # Update subdomain settings (SIWX)
│   │   │       └── inbox/
│   │   │           ├── create/route.ts  # Create subdomain inbox (x402 $0.25)
│   │   │           ├── list/route.ts    # List subdomain inboxes (SIWX)
│   │   │           ├── delete/route.ts  # Delete subdomain inbox (SIWX)
│   │   │           ├── update/route.ts  # Update subdomain inbox (SIWX)
│   │   │           └── messages/
│   │   │               ├── route.ts         # List messages (x402)
│   │   │               ├── read/route.ts    # Read message (x402)
│   │   │               └── delete/route.ts  # Delete message (SIWX)
│   │   └── .well-known/
│   │       └── x402/
│   │           └── route.ts     # x402 discovery
│   │   ├── openapi.json/
│   │   │   └── route.ts     # Auto-generated OpenAPI spec
│   ├── lib/
│   │   ├── routes.ts            # Router singleton (createRouter config, prices, constants)
│   │   ├── routes/
│   │   │   └── barrel.ts        # Barrel import for route self-registration
│   │   ├── x402/
│   │   │   ├── refund.ts        # Refund logic for inbox cancellation
│   │   │   └── balance.ts       # USDC balance check for treasury sweep
│   │   ├── siwx/
│   │   │   └── nonce-store.ts   # PrismaNonceStore (Prisma-backed NonceStore impl)
│   │   ├── email/
│   │   │   ├── ses.ts           # AWS SES client (SESv2 SDK)
│   │   │   ├── s3.ts            # S3 email storage (get/delete raw email)
│   │   │   └── schemas.ts       # Email Zod schemas
│   │   ├── dns/
│   │   │   ├── route53.ts       # AWS Route53 DNS client (scoped IAM)
│   │   │   ├── ses-verify.ts    # SES domain verification
│   │   │   └── provision.ts     # Full subdomain provisioning flow
│   │   └── db/
│   │       └── client.ts        # Prisma client singleton
│   └── schemas/
│       ├── send.ts              # Send email request/response Zod schemas
│       ├── subdomain.ts         # Subdomain + subdomain inbox Zod schemas
│       ├── inbox.ts             # Root inbox Zod schemas
│       └── signers.ts           # Signer management Zod schemas
├── prisma/
│   └── schema.prisma           # Prisma schema (see DB Schema section above)
└── public/
    └── llms.txt                 # Instructions for AI agents
```

## Environment Variables

```env
# x402 (payment settlement)
CDP_API_KEY_ID=...
CDP_API_KEY_SECRET=...
X402_PAYEE_ADDRESS=0x...

# AWS (scoped IAM user: SES send + Route53 hosted zone only)
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_REGION=us-east-1
ROUTE53_HOSTED_ZONE_ID=...      # Route53 hosted zone for x402email.com

# Database (Neon serverless Postgres via neonctl)
DATABASE_URL=...                # Neon connection string (pooled)

# App
NEXT_PUBLIC_BASE_URL=https://x402email.com
EMAIL_DOMAIN=x402email.com
```

## Implementation Order

### Phase 1: Foundation (DONE)
1. Next.js 15 + Tailwind v4 + TypeScript + Zod 4
2. Neon Postgres via Prisma
3. `@agentcash/router` with `createRouter()`, `PrismaNonceStore`, auto-discovery
4. All 24 routes use fluent builder (`.paid()` / `.siwx()` + `.body()` + `.handler()`)

### Phase 2: Shared Domain Send (DONE)
5. AWS SES client + POST /api/send

### Phase 3: Subdomain Purchase (DONE)
6. Route53 DNS + SES domain verification + POST /api/subdomain/buy with `.validate()`

### Phase 4: Subdomain Send (DONE)
7. POST /api/subdomain/send — wallet from payment, authorization check in handler

### Phase 5: Management + Inboxes (DONE)
8. Subdomain signers, status, update — `.siwx()` routes
9. Root inbox buy, send, topup, status, update, cancel
10. Subdomain inbox create, list, delete, update, messages

### Phase 6: Polish
11. Rate limiting per wallet / subdomain (based on sendLogs)
12. Bounce/complaint webhooks + auto-block
13. Content scanning (reject executable attachments, enforce size limits)

## Anti-Abuse — SES Platform Risk

**AWS can suspend our entire SES account if bounce rate exceeds 5% or complaint rate exceeds 0.1%.** This kills the service for ALL users — shared domain and every subdomain. The AWS AUP prohibits facilitating unsolicited bulk email, and as an open relay protected only by micropayments, we are high-risk in AWS's eyes. Services like Resend/SendGrid survive by combining TOS (shifts CAN-SPAM liability to user), active abuse detection (content scanning, pattern analysis, auto-suspension), and account gating (manual review, restricted onboarding). We have TOS but lack the enforcement code.

### Implemented today
- **$5 subdomain price** — economic spam deterrent for subdomain tier
- **Per-send cost** — $0.02 shared domain, $0.005 subdomain/inbox (100K spam = $500-$2000)
- **Schema validation** — 50 recipient cap, 256KB body limit, subdomain name rules
- **Send logging** — all sends logged to DB with wallet address (for future analysis)
- **SIWX nonce replay prevention** — nonces recorded in SiwxNonce table, prevents signature reuse
- **Wallet identity from payment-signature only** — `@agentcash/router` extracts wallet from the cryptographically-signed payment header, not client-set convenience headers
- **SNS signature verification** — `sns-validator` package cryptographically verifies all inbound SNS messages before processing, preventing forged notifications
- **Email header injection prevention** — forward handler sanitizes sender display name (strips CRLF/quotes)
- **Forward rate limiting** — 200 forwards/hr per subdomain, prevents catch-all relay abuse
- **Atomic message caps** — subdomain inbox message retention uses Prisma `$transaction` to prevent TOCTOU race conditions
- **TOS/Privacy Policy** — prohibits spam, CAN-SPAM/GDPR compliance required, states we can suspend wallets/subdomains

### NOT implemented — must build
- **Per-wallet rate limiting on /api/send** — shared domain is the vulnerability. A single wallet can currently send 200/day (sandbox limit) with no throttling. In production there's no cap at all.
- **SES bounce/complaint event handling** — need SNS topic → webhook. Track per-wallet and per-subdomain bounce/complaint rates. Auto-block wallets exceeding thresholds (5% bounce, 0.1% complaint).
- **Wallet/subdomain suspension mechanism** — need a `suspended` flag on Subdomain model and a wallet blocklist table. Check on every send.
- **Content scanning** — at minimum reject executable attachments and known phishing patterns. SES itself rejects some content but we should filter before sending.
- **Admin tooling** — ability to manually suspend a wallet or subdomain when abuse is reported.

### Priority order
1. **Bounce/complaint webhooks + auto-block** — highest priority. Without this, one bad actor tanks the whole account.
2. **Per-wallet rate limiting** — cap shared domain sends per wallet per hour.
3. **Suspension mechanism** — `suspended` column + blocklist check in send handlers.
4. **Content scanning** — basic keyword/pattern + attachment type filtering.

### Known security risks — not yet addressed
- **`OPERATIONAL_WALLET_PRIVATE_KEY` not `.trim()`'d** — in `lib/x402/refund.ts`, the private key env var is used without trimming. A trailing newline from Vercel env could derive a different account or break refunds. Fix: `.trim()` in `getRefundClient()`.

### Subdomain MAIL FROM — not needed
Custom MAIL FROM (`m.x402email.com`) is set up for the shared domain only. Subdomains don't need their own custom MAIL FROM because DMARC only requires ONE of SPF or DKIM to align, and each subdomain has its own DKIM keys which align with the From header. Adding per-subdomain MAIL FROM would add complexity to provisioning for marginal benefit.

### Google Postmaster Tools
Verified for `x402email.com`. Covers all `*.x402email.com` subdomains — Google aggregates at the organizational domain level. Data only appears at ~100+ daily sends to Gmail.

## Open Questions

1. **Subdomain verification polling**: On-demand (check when status endpoint hit) vs background job. Start with on-demand.
2. **ocpemail.com**: Reserve for future use or set up as alias domain?
3. **Smart wallet support**: SIWX supports EIP-1271/EIP-6492 for smart wallets via optional `evmVerifier`. Add in Phase 6 if needed.

## Monitoring & Deliverability

- **Google Postmaster Tools**: https://postmaster.google.com/managedomains — monitors how Gmail treats our emails (spam rate, auth errors, delivery problems). Domain verified via TXT record.
- **SES Dashboard**: https://us-east-1.console.aws.amazon.com/ses/home?region=us-east-1#/account — bounce/complaint rates, sending quotas, reputation status.
- **Custom MAIL FROM**: `m.x402email.com` — ensures SPF alignment with DMARC (envelope sender matches From domain). MX + SPF TXT records in Route53.

## Development Commands

```bash
pnpm dev                    # Start dev server
pnpm build                  # Production build
pnpm lint                   # ESLint
npx prisma db push          # Push schema to Neon (no migration files)
npx prisma generate         # Regenerate Prisma client after schema changes
npx prisma migrate dev      # Create migration (for production-track changes)
npx prisma studio           # Visual DB browser
vercel                      # Deploy to Vercel
vercel env pull .env.local  # Pull env vars from Vercel
```
