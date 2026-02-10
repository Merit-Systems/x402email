# x402email

Pay-per-send email via [x402](https://www.x402.org/). No API keys. Fund a wallet, send email.

## Endpoints

| Endpoint | Price | Auth | Description |
|----------|-------|------|-------------|
| `POST /api/send` | $0.001 | x402 | Send from `noreply@x402email.com` |
| `POST /api/subdomain/buy` | $50 | x402 + SIWX | Purchase `yourname.x402email.com` |
| `POST /api/subdomain/send` | $0.001 | x402 + SIWX | Send from your subdomain |
| `POST /api/subdomain/signers` | Free | SIWX | Add/remove authorized wallets (max 50) |
| `GET /api/subdomain/status` | Free | SIWX | Check DNS/SES verification status |
| `GET /.well-known/x402` | Free | None | x402 resource discovery |

## Quick Start

```bash
# Send an email (x402 payment required)
curl -X POST https://x402email.com/api/send \
  -H "Content-Type: application/json" \
  -d '{"to":["alice@example.com"],"subject":"Hello","text":"Sent via x402"}'
```

Returns 402 with payment requirements. Pay with any x402-compatible client to send.

## Stack

Next.js 16 / Tailwind v4 / Prisma + Neon / AWS SES + Route53 / x402 protocol

## Development

```bash
pnpm install
pnpm dev
```

## Environment Variables

See `.env.example` for required configuration.

## License

MIT
