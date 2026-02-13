import { NextResponse } from 'next/server';

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://x402email.com';
const DOMAIN = process.env.EMAIL_DOMAIN || 'x402email.com';

const instructions = `# x402email API

Email via x402 micropayments. USDC on Base. No API keys.

## Three tiers

1. **Shared domain** — POST /api/send ($0.02). Sends from relay@${DOMAIN}. Body: {to, subject, html?, text?, replyTo?, attachments?}. Requires html or text.
2. **Inbox** — Buy username@${DOMAIN} for $1/30 days. Forward to real address, use as programmatic mailbox, or both. Send from it for $0.005.
3. **Subdomain** — Buy yourname.${DOMAIN} for $5. Send from anything@yourname.${DOMAIN} for $0.005. Up to 50 authorized signer wallets.

Subdomain owners can buy the matching inbox name with the same wallet (e.g., owner of alice.${DOMAIN} can buy alice@${DOMAIN}).

## Inbox endpoints

| Endpoint | Cost | Auth | Body |
|----------|------|------|------|
| POST /api/inbox/buy | $1 | x402 | {username, forwardTo?} — omit forwardTo for programmatic-only mailbox (retainMessages auto-enabled) |
| POST /api/inbox/send | $0.005 | x402 (owner) | {username, to[], subject, html?, text?, replyTo?, attachments?} |
| POST /api/inbox/topup | $1 | x402 | {username} — anyone can topup any inbox |
| POST /api/inbox/topup/quarter | $2.50 | x402 | {username} — 90 days, save 17% |
| POST /api/inbox/topup/year | $8 | x402 | {username} — 365 days, save 34% |
| POST /api/inbox/messages | $0.001 | x402 (owner) | {username, cursor?, limit?} — list inbound messages |
| POST /api/inbox/messages/read | $0.001 | x402 (owner) | {messageId} — full email with from/to/subject/text/html/attachments metadata |
| POST /api/inbox/messages/delete | free | SIWX (owner) | {messageId} |
| GET /api/inbox/status?username=x | free | SIWX (owner) | — |
| POST /api/inbox/update | free | SIWX (owner) | {username, forwardTo?, retainMessages?} — set forwardTo to null to remove forwarding |
| POST /api/inbox/cancel | free | SIWX (owner) | {username, refundAddress?} — pro-rata USDC refund |

## Subdomain endpoints

| Endpoint | Cost | Auth | Body |
|----------|------|------|------|
| POST /api/subdomain/buy | $5 | x402 | {subdomain} — DNS verified in ~5 min |
| POST /api/subdomain/send | $0.005 | x402 (owner/signer) | {from, to[], subject, html?, text?, replyTo?} |
| POST /api/subdomain/update | free | SIWX (owner) | {subdomain, catchAllForwardTo?} — set catch-all forwarding for unmatched addresses (null to remove) |
| POST /api/subdomain/signers | free | SIWX (owner) | {action: "add"/"remove", subdomain, walletAddress} |
| GET /api/subdomain/status?subdomain=x | free | SIWX (owner/signer) | — |

## Subdomain inboxes — receive email on subdomains

Subdomain owners can create per-address inboxes (e.g., biden@craig.${DOMAIN}). Free to create (SIWX), cap 100/subdomain. Each inbox optionally forwards and/or retains messages for API access. Unmatched addresses go to catch-all if set, else dropped.

| Endpoint | Cost | Auth | Body |
|----------|------|------|------|
| POST /api/subdomain/inbox/create | free | SIWX (owner) | {subdomain, localPart, forwardTo?} — omit forwardTo for programmatic-only |
| POST /api/subdomain/inbox/list | free | SIWX (owner) | {subdomain} — returns inboxes with message/unread counts |
| POST /api/subdomain/inbox/delete | free | SIWX (owner) | {subdomain, localPart} — cascades messages + S3 |
| POST /api/subdomain/inbox/messages | $0.001 | x402 (owner) | {subdomain, localPart, cursor?, limit?} — list inbound messages |
| POST /api/subdomain/inbox/messages/read | $0.001 | x402 (owner) | {messageId} — full email with from/to/subject/text/html/attachments |
| POST /api/subdomain/inbox/messages/delete | free | SIWX (owner) | {messageId} |

## Auth model

- **x402 routes**: wallet identity extracted from payment signature. Ownership checked in handler.
- **SIWX routes** (free): wallet identity via SIGN-IN-WITH-X header. Returns 402 with SIWX challenge if missing — x402-compatible clients handle this automatically.

## Attachments

Max 5 per email. Each: {content: "base64", contentType: "mime/type", filename: "name"}. ~3.75MB decoded limit. For calendar invites: contentType "text/calendar; method=REQUEST".

## Images

Use \`<img src="url">\` in html body. Host on agentupload.dev (x402-powered uploads). Avoid base64 data URIs — most email clients strip them.
`;

export async function GET() {
  return NextResponse.json({
    version: 1,
    description: `Email via x402 micropayments. Send ($0.02), buy inbox ($1/mo), buy subdomain ($5). Subdomain inboxes for receiving email.`,
    resources: [
      `${BASE_URL}/api/send`,
      `${BASE_URL}/api/subdomain/buy`,
      `${BASE_URL}/api/subdomain/send`,
      `${BASE_URL}/api/inbox/buy`,
      `${BASE_URL}/api/inbox/topup`,
      `${BASE_URL}/api/inbox/topup/quarter`,
      `${BASE_URL}/api/inbox/topup/year`,
      `${BASE_URL}/api/inbox/send`,
      `${BASE_URL}/api/inbox/messages`,
      `${BASE_URL}/api/inbox/messages/read`,
      `${BASE_URL}/api/subdomain/inbox/messages`,
      `${BASE_URL}/api/subdomain/inbox/messages/read`,
    ],
    instructions,
  });
}
