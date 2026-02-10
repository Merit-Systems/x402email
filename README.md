# x402email

Pay-per-send email over [x402](https://www.x402.org/). No API keys. No accounts. Fund a wallet, send email.

**[x402email.com](https://x402email.com)**

## Why

Every email API requires signup, API keys, billing accounts, and rate limit negotiations. x402email replaces all of that with a single HTTP request and a micropayment. Any x402-compatible client (wallets, AI agents, scripts) can send email programmatically with zero setup.

## Two Tiers

**Shared domain** — Send from `noreply@x402email.com` for **$0.001/email**. No auth, just pay. Good for notifications, alerts, one-off sends.

**Custom subdomain** — Buy `yourname.x402email.com` for **$50**. Send from `anything@yourname.x402email.com` with full DKIM/SPF/DMARC. Wallet-based auth (SIWX) proves ownership. Up to 50 authorized signer wallets. $0.001/send.

## How It Works

```
Client                          x402email                        AWS SES
  │                                  │                              │
  ├── POST /api/send ───────────────►│                              │
  │◄── 402 + payment details ───────┤                              │
  │                                  │                              │
  ├── POST /api/send ───────────────►│                              │
  │   + x402 payment header          ├── SendEmail ────────────────►│
  │◄── { success, messageId } ──────┤◄── messageId ────────────────┤
```

x402 handles payment negotiation automatically. Compatible clients resolve the 402 → pay → retry flow transparently.

## API

| Endpoint | Protection | Cost | Description |
|----------|-----------|------|-------------|
| `POST /api/send` | x402 | $0.001 | Send from shared domain |
| `POST /api/subdomain/buy` | x402 + SIWX | $50 | Purchase a subdomain |
| `POST /api/subdomain/send` | x402 + SIWX | $0.001 | Send from your subdomain |
| `POST /api/subdomain/signers` | SIWX | Free | Add/remove authorized wallets |
| `GET /api/subdomain/status` | SIWX | Free | Check DNS/SES verification |
| `GET /.well-known/x402` | Public | Free | Discovery (pricing + schemas) |

### Send an email

```bash
curl -X POST https://x402email.com/api/send \
  -H "Content-Type: application/json" \
  -d '{
    "to": ["alice@example.com"],
    "subject": "Hello from x402",
    "text": "Sent with a micropayment, not an API key.",
    "replyTo": "you@example.com"
  }'
# Returns 402 → client pays $0.001 USDC on Base → email sends
```

### Buy a subdomain

```bash
curl -X POST https://x402email.com/api/subdomain/buy \
  -H "Content-Type: application/json" \
  -d '{"subdomain": "alice"}'
# Pays $50 USDC → provisions alice.x402email.com with full DNS auth
```

Subdomain provisioning is fully automated: SES domain verification, DKIM (3 CNAME records), SPF, and DMARC records are created via Route53 within minutes.

## Architecture

```
x402email (Next.js on Vercel)
├── x402 Resource Server
│   ├── @x402/core               payment protocol
│   ├── @x402/evm                Base L2 settlement
│   ├── @coinbase/x402           facilitator
│   └── @x402/extensions
│       ├── sign-in-with-x       wallet identity (CAIP-122)
│       └── bazaar               auto-discovery schemas
├── AWS SES                      email delivery
├── AWS Route53                  DNS automation (scoped IAM)
└── Neon Postgres (Prisma)       subdomains, signers, send logs
```

**Payment**: USDC on Base (EIP-155:8453) via x402 exact scheme. Settlement through Coinbase's facilitator.

**Auth**: SIWX (Sign-In-With-X) for subdomain operations. EVM wallets sign EIP-4361 messages to prove identity. The wallet address is tied to subdomain ownership in the database. Subdomain sends require both payment (every time) and SIWX proof (proving you own the subdomain) — SIWX is used for authorization, not to skip payment.

**Email delivery**: AWS SES with SPF (`include:amazonses.com`), DKIM (2048-bit, 3 rotation keys), DMARC (`p=reject`), and custom MAIL FROM (`m.x402email.com`) for full DMARC alignment on both SPF and DKIM.

**DNS automation**: Each subdomain purchase triggers Route53 record creation (verification TXT, 3 DKIM CNAMEs, SPF TXT, DMARC TXT) and SES domain verification. Fully automated, verified within minutes.

## Anti-Abuse

| Mechanism | Purpose |
|-----------|---------|
| $50 subdomain price | Economic spam deterrent |
| Per-wallet rate limiting | Prevents volume abuse on shared domain |
| Bounce/complaint monitoring | Auto-suspend senders exceeding SES thresholds |
| Content scanning | Reject executable attachments, enforce size limits |
| SIWX nonce replay prevention | Prevents signature reuse attacks |
| Subdomain reputation isolation | One bad subdomain can't affect another |

## Monitoring

- [Google Postmaster Tools](https://postmaster.google.com/managedomains) — Gmail spam rate, delivery errors, authentication status
- [AWS SES Dashboard](https://us-east-1.console.aws.amazon.com/ses/home?region=us-east-1#/account) — bounce/complaint rates, sending quotas, account reputation

## Development

```bash
pnpm dev                    # Dev server
pnpm build                  # Production build
npx prisma db push          # Push schema to Neon
vercel env pull .env.local  # Pull env vars
```

See `.env.example` for required configuration.

## Stack

Next.js 15 / Tailwind v4 / Zod 4 / Prisma + Neon Postgres / AWS SES + Route53 / Vercel
