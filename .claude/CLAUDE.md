# x402email — x402-Native Email Sending Service

Pay-per-send email via x402. No API keys. Fund a wallet, send email.

**Domains**: x402email.com (primary), ocpemail.com (alias/future)
**Repo**: ~/Documents/Code/merit-systems/x402email

## What This Is

An x402-protected email sending API. Three tiers:

1. **Shared domain** — send from `relay@x402email.com` for $0.02/email, x402 payment only, no auth
2. **Forwarding inbox** — buy `username@x402email.com` for $1/month, emails forwarded to your real address, send from your inbox for $0.005/email
3. **Custom subdomain** — buy `alice.x402email.com` for $5 via x402, send from `anything@alice.x402email.com` for $0.005/email, wallet identity extracted from x402 payment. Up to 50 authorized signer wallets per subdomain.

Subdomain owners can also buy the matching inbox name (e.g., owner of `alice.x402email.com` can buy `alice@x402email.com`). The same wallet must own both.

## Tech Stack

- **Framework**: Next.js 15 (App Router)
- **Styling**: Tailwind CSS v4
- **Validation**: Zod 4
- **Payments**: @x402/core, @x402/next, @x402/evm, @x402/extensions, @coinbase/x402
- **Auth**: @x402/extensions/sign-in-with-x (SIWX) — shipped extension, CAIP-122 compliant, EVM + Solana
- **Discovery**: @x402/extensions/bazaar (auto-generated schemas from Zod)
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
│  │               x402 Resource Server                │   │
│  │  ┌────────────┐ ┌────────────┐ ┌──────────────┐   │   │
│  │  │  withX402   │ │   SIWX     │ │   Bazaar     │   │   │
│  │  │  payment    │ │  extension │ │  discovery   │   │   │
│  │  └────────────┘ └────────────┘ └──────────────┘   │   │
│  │                                                   │   │
│  │  Hooks:                                           │   │
│  │  • onAfterSettle → createSIWxSettleHook(storage)  │   │
│  │  • onProtectedRequest → createSIWxRequestHook     │   │
│  └───────────────────────────────────────────────────┘   │
│                                                          │
│  ┌──────────┐ ┌──────────┐ ┌──────────────────────────┐ │
│  │ AWS SES  │ │ Route53  │ │  Neon Postgres (Prisma)  │ │
│  │ send     │ │ DNS API  │ │  subdomains, signers,    │ │
│  │          │ │          │ │  send logs, siwx storage │ │
│  └──────────┘ └──────────┘ └──────────────────────────┘ │
└──────────────────────────────────────────────────────────┘
```

## SIWX — How It Actually Works

SIWX is a **shipped extension** in `@x402/extensions/sign-in-with-x`. It is NOT custom middleware. The key insight: SIWX proves "I already paid" so returning users skip re-payment.

### Server-side setup (one-time):

```typescript
import { x402ResourceServer, HTTPFacilitatorClient } from '@x402/core/server';
import { registerExactEvmScheme } from '@x402/evm/exact/server';
import { facilitator } from '@coinbase/x402';
import {
  siwxResourceServerExtension,
  createSIWxSettleHook,
  createSIWxRequestHook,
} from '@x402/extensions/sign-in-with-x';

const storage = new DatabaseSIWxStorage(); // implements SIWxStorage interface

const server = new x402ResourceServer(new HTTPFacilitatorClient(facilitator));
registerExactEvmScheme(server);

// Register SIWX extension
server.registerExtension(siwxResourceServerExtension);

// Hook: after payment settles, record that this wallet paid for this resource
server.onAfterSettle(createSIWxSettleHook({ storage }));

// Hook: before requiring payment, check if wallet already paid via SIWX proof
server.onProtectedRequest(createSIWxRequestHook({ storage }));
```

### Route-level SIWX declaration:

```typescript
import { declareSIWxExtension } from '@x402/extensions/sign-in-with-x';
import { declareDiscoveryExtension } from '@x402/extensions/bazaar';

const extensions = {
  ...declareDiscoveryExtension(discoveryConfig),
  ...declareSIWxExtension({
    statement: 'Sign in to send email from your subdomain',
    expirationSeconds: 300,
    // domain, resourceUri, network are auto-derived from request context
  }),
};

const routeConfig = {
  description: 'Send email from your subdomain',
  extensions,
  accepts: [{ scheme: 'exact', network: 'eip155:8453', price: '0.001', payTo: PAYEE }],
};

export const POST = withX402(handler, routeConfig, server);
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

### SIWxStorage interface:

```typescript
interface SIWxStorage {
  hasPaid(resource: string, address: string): boolean | Promise<boolean>;
  recordPayment(resource: string, address: string): void | Promise<void>;
  hasUsedNonce?(nonce: string): boolean | Promise<boolean>;  // optional replay prevention
  recordNonce?(nonce: string): void | Promise<void>;
}
```

We implement this backed by Prisma + Neon Postgres — NOT the in-memory default.

### How we use SIWX for subdomain auth:

The x402 SIWX model is "pay once, prove identity on return." For x402email:

1. **Subdomain purchase** (`/api/subdomain/buy`): Normal x402 payment ($50). The `onAfterSettle` hook records `resource=/api/subdomain/* → wallet=0x...` in storage.

2. **Subdomain send** (`/api/subdomain/send`): x402 payment ($0.001) + SIWX extension. First-time callers pay. Return callers with SIWX proof skip... wait, no — they should ALWAYS pay per send. SIWX here proves wallet identity for authorization (proving they own the subdomain), NOT to skip payment.

**Key design decision**: We need SIWX for **authorization** (who are you?) separate from **payment** (pay per send). The standard SIWX flow uses "already paid" to grant access. For subdomain sends, we want:
- SIWX proves wallet identity → we check against subdomain ownership
- x402 payment happens on every send ($0.001)

**Implementation approach**: Use SIWX for authorization check in the route handler AFTER payment settles. The `onAfterSettle` hook records subdomain purchases, and we verify the SIWX signer is authorized for that subdomain in the handler itself, NOT via `createSIWxRequestHook` (which would skip payment).

```typescript
// Subdomain send flow:
// 1. Client sends request with SIGN-IN-WITH-X header + PAYMENT-SIGNATURE header
// 2. withX402 processes payment (always settles — SIWX request hook NOT used for this route)
// 3. Handler parses SIGN-IN-WITH-X header to get wallet address
// 4. Handler checks wallet is owner or signer for the subdomain
// 5. Handler sends email via SES
```

For signer management (free, no payment):
- These are NOT x402 routes at all
- Parse SIGN-IN-WITH-X header manually in the route handler
- Use `parseSIWxHeader` + `verifySIWxSignature` from the extension
- Verify the recovered address is the subdomain owner

## API Endpoints

### POST /api/send — Shared domain send
**Protection**: x402 payment ($0.001), no SIWX
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
**Protection**: x402 payment ($50) + SIWX extension (records buyer wallet for future auth)

```json
{
  "subdomain": "alice"
}
```

The buyer's wallet address is extracted from the x402 payment (payer) or SIWX proof. No need to pass `ownerWallet` in the body.

Flow:
1. Validate subdomain name (alphanumeric + hyphens, 3-30 chars, not reserved)
2. Check availability in DB
3. x402 payment settles ($50)
4. `onAfterSettle` records wallet → subdomain ownership in SIWxStorage
5. Call AWS SES `VerifyDomainIdentity` + `VerifyDomainDkim` for `alice.x402email.com`
6. Call Route53 API to add DNS records (TXT verification, 3 DKIM CNAMEs, SPF, DMARC)
7. Store in DB with `dns_verified: false`
8. Return subdomain info

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
**Protection**: x402 payment ($0.001) + SIWX proof (authorization check in handler)

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
1. x402 payment settles ($0.001)
2. Handler parses `SIGN-IN-WITH-X` header → recovers wallet address
3. Handler extracts subdomain from `from` address
4. Handler checks wallet is owner or authorized signer in DB
5. Handler checks subdomain DNS is verified
6. Send via SES
7. Log the send

### POST /api/subdomain/signers — Manage signers
**Protection**: SIWX only (NOT an x402 route — no payment)

The route handler manually parses and verifies the SIWX header using utilities from `@x402/extensions/sign-in-with-x`.

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
**Protection**: SIWX only (NOT an x402 route — no payment)

Same manual SIWX verification as signers endpoint.

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
Returns all x402-protected endpoints with pricing and Bazaar schemas.

## Database Schema (Prisma + Neon Postgres)

```prisma
// prisma/schema.prisma

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

model Subdomain {
  id          String   @id @default(cuid())
  name        String   @unique  // 'alice' (without .x402email.com)
  ownerWallet String
  dnsVerified Boolean  @default(false)
  sesVerified Boolean  @default(false)
  paymentTx   String?
  createdAt   DateTime @default(now())
  signers     Signer[]
  sendLogs    SendLog[]
}

model Signer {
  id            String    @id @default(cuid())
  subdomain     Subdomain @relation(fields: [subdomainId], references: [id])
  subdomainId   String
  walletAddress String
  addedAt       DateTime  @default(now())

  @@unique([subdomainId, walletAddress])
}

model SendLog {
  id            String     @id @default(cuid())
  subdomain     Subdomain? @relation(fields: [subdomainId], references: [id])
  subdomainId   String?    // null = shared domain
  senderWallet  String?
  fromEmail     String
  toEmails      String[]   // Postgres native array
  subject       String
  sesMessageId  String?
  createdAt     DateTime   @default(now())
}

// SIWxStorage backing — tracks which wallets paid for which resources
model SiwxPayment {
  id            String   @id @default(cuid())
  resource      String
  walletAddress String
  createdAt     DateTime @default(now())

  @@unique([resource, walletAddress])
}

// Nonce tracking for SIWX replay prevention
model SiwxNonce {
  nonce  String   @id
  usedAt DateTime @default(now())
}
```

## SIWxStorage Implementation (Prisma-backed)

```typescript
// lib/siwx/storage.ts
import type { SIWxStorage } from '@x402/extensions/sign-in-with-x';
import { prisma } from '@/lib/db/client';

export class DatabaseSIWxStorage implements SIWxStorage {
  // Backed by Prisma queries against SiwxPayment + SiwxNonce tables
  async hasPaid(resource: string, address: string): Promise<boolean> {
    const record = await prisma.siwxPayment.findUnique({
      where: { resource_walletAddress: { resource, walletAddress: address } },
    });
    return !!record;
  }
  async recordPayment(resource: string, address: string): Promise<void> {
    await prisma.siwxPayment.upsert({
      where: { resource_walletAddress: { resource, walletAddress: address } },
      create: { resource, walletAddress: address },
      update: {},
    });
  }
  async hasUsedNonce(nonce: string): Promise<boolean> {
    const record = await prisma.siwxNonce.findUnique({ where: { nonce } });
    return !!record;
  }
  async recordNonce(nonce: string): Promise<void> {
    await prisma.siwxNonce.create({ data: { nonce } });
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
   ├── TXT  alice.x402email.com               → v=spf1 include:amazonses.com ~all
   └── TXT  _dmarc.alice.x402email.com        → v=DMARC1; p=quarantine; rua=mailto:dmarc@x402email.com

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
├── src/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx              # Landing page / docs
│   │   ├── api/
│   │   │   ├── send/
│   │   │   │   └── route.ts     # Shared domain send (x402 only)
│   │   │   └── subdomain/
│   │   │       ├── buy/
│   │   │       │   └── route.ts # Buy subdomain (x402 + SIWX)
│   │   │       ├── send/
│   │   │       │   └── route.ts # Subdomain send (x402 + SIWX auth in handler)
│   │   │       ├── signers/
│   │   │       │   └── route.ts # Manage signers (SIWX only, no x402)
│   │   │       └── status/
│   │   │           └── route.ts # Check status (SIWX only, no x402)
│   │   └── .well-known/
│   │       └── x402/
│   │           └── route.ts     # x402 discovery
│   ├── lib/
│   │   ├── x402/
│   │   │   ├── server.ts        # x402ResourceServer singleton + SIWX hooks
│   │   │   ├── pricing.ts       # Route pricing config
│   │   │   └── route-wrapper.ts # createX402PostRoute helper (reuse from samragsdale.com-v2)
│   │   ├── siwx/
│   │   │   ├── storage.ts       # DatabaseSIWxStorage (Prisma-backed SIWxStorage impl)
│   │   │   └── verify.ts        # Manual SIWX header verification for non-x402 routes
│   │   ├── email/
│   │   │   ├── ses.ts           # AWS SES client (SESv2 SDK)
│   │   │   └── schemas.ts       # Email Zod schemas
│   │   ├── dns/
│   │   │   ├── route53.ts       # AWS Route53 DNS client (scoped IAM)
│   │   │   ├── ses-verify.ts    # SES domain verification
│   │   │   └── provision.ts     # Full subdomain provisioning flow
│   │   └── db/
│   │       └── client.ts        # Prisma client singleton
│   └── schemas/
│       ├── send.ts              # Send email request/response Zod schemas
│       ├── subdomain.ts         # Subdomain buy/status Zod schemas
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

### Phase 1: Foundation
1. Scaffold Next.js 15 app with Tailwind v4, TypeScript, Zod 4
2. Create Neon project via `neonctl`, set up Prisma with schema, run `npx prisma db push`
3. Set up x402ResourceServer with SIWX extension + Bazaar extension + hooks
4. Implement DatabaseSIWxStorage backed by Prisma
5. Set up .well-known/x402 discovery

### Phase 2: Shared Domain Send
6. Implement AWS SES client (SESv2 SDK, send email function)
7. Set up SES domain verification for x402email.com (one-time manual DNS setup)
8. Implement POST /api/send — Zod schema validation, x402 payment wrapping, SES send
9. Test end-to-end: x402 payment → SES send → email delivered

### Phase 3: Subdomain Purchase
10. Implement Route53 DNS client (create records via scoped IAM)
11. Implement SES domain verification client (VerifyDomainIdentity, VerifyDomainDkim)
12. Implement subdomain provisioning flow (SES verify → Route53 DNS → DB)
13. Implement POST /api/subdomain/buy — x402 payment + SIWX extension, provisions subdomain
14. Implement DNS verification check (on-demand, called from status endpoint)

### Phase 4: Subdomain Send
15. Implement SIWX header parsing + verification for route handlers (using @x402/extensions/sign-in-with-x utilities: parseSIWxHeader, verifySIWxSignature)
16. Implement POST /api/subdomain/send — x402 payment + SIWX auth check in handler
17. Test with x402scan MCP `authed_call` + `execute_call` tools

### Phase 5: Subdomain Management
18. Implement manual SIWX verification middleware for non-x402 routes (lib/siwx/verify.ts)
19. Implement POST /api/subdomain/signers — SIWX only, owner-only
20. Implement GET /api/subdomain/status — SIWX only, owner or signer

### Phase 6: Polish
21. Landing page with docs (Tailwind v4)
22. Rate limiting per wallet / subdomain (based on sendLogs)
23. Basic content scanning (reject executable attachments, enforce size limits)
24. llms.txt for AI agent discoverability
25. README + agents.md

## Anti-Abuse — SES Platform Risk

**AWS can suspend our entire SES account if bounce rate exceeds 5% or complaint rate exceeds 0.1%.** This kills the service for ALL users — shared domain and every subdomain. The AWS AUP prohibits facilitating unsolicited bulk email, and as an open relay protected only by micropayments, we are high-risk in AWS's eyes. Services like Resend/SendGrid survive by combining TOS (shifts CAN-SPAM liability to user), active abuse detection (content scanning, pattern analysis, auto-suspension), and account gating (manual review, restricted onboarding). We have TOS but lack the enforcement code.

### Implemented today
- **$50 subdomain price** — economic spam deterrent for subdomain tier
- **$0.001 per-send cost** — marginal deterrent (100K spam = $100, cheap but nonzero)
- **Schema validation** — 50 recipient cap, 256KB body limit, subdomain name rules
- **Send logging** — all sends logged to DB with wallet address (for future analysis)
- **SIWX nonce replay prevention** — nonces recorded in SiwxNonce table, prevents signature reuse
- **Wallet identity from payment-signature only** — `extractPayerWallet` only trusts the cryptographically-signed payment header, not client-set convenience headers like x-wallet-address
- **SNS SSRF prevention** — SubscriptionConfirmation handler validates SubscribeURL is `https://*.amazonaws.com`
- **Email header injection prevention** — forward handler sanitizes sender display name (strips CRLF/quotes)
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
- **SNS message signature verification** — forward handler only checks TopicArn, does not verify the cryptographic signature on SNS messages. An attacker who knows the TopicArn could forge SNS notifications to trigger email forwarding or InboxMessage creation. Fix: add `aws-sns-message-validator` package or equivalent.
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
