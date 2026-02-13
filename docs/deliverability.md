# Email Deliverability

How x402email maximizes deliverability for the root domain and all customer subdomains.

## DNS Authentication (per domain)

Every domain and subdomain gets three authentication mechanisms at the strictest settings. These are configured automatically during subdomain provisioning (`src/lib/dns/provision.ts`).

### SPF (Sender Policy Framework)

Declares which servers are allowed to send email for the domain.

```
v=spf1 include:amazonses.com -all
```

- `include:amazonses.com` — only SES servers are authorized
- `-all` (hardfail) — reject anything not from SES. We use hardfail, not `~all` (softfail), because we exclusively send through SES and want unauthorized senders rejected outright.

### DKIM (DomainKeys Identified Mail)

Cryptographic signatures on every outgoing email. SES signs each message; receivers verify against public keys published in DNS.

Each domain gets 3 CNAME records pointing to SES DKIM keys:

```
<token1>._domainkey.subdomain.x402email.com → <token1>.dkim.amazonses.com
<token2>._domainkey.subdomain.x402email.com → <token2>.dkim.amazonses.com
<token3>._domainkey.subdomain.x402email.com → <token3>.dkim.amazonses.com
```

These are set up via `VerifyDomainDkim` during provisioning. SES handles key rotation automatically.

Note: DKIM records use CNAME (not TXT) at token-prefixed names. A lookup at the bare `_domainkey.subdomain` will show nothing — this is normal and expected.

### DMARC (Domain-based Message Authentication, Reporting & Conformance)

Policy telling receivers what to do when SPF and DKIM both fail.

```
v=DMARC1; p=reject; rua=mailto:dmarc@x402email.com
```

- `p=reject` — reject unauthenticated email entirely (strictest). We don't use `p=quarantine` (spam folder) or `p=none` (monitor only).
- `rua=mailto:dmarc@x402email.com` — aggregate failure reports sent here for monitoring spoofing attempts.

DMARC requires **alignment**: the domain in the `From` header must match either the SPF domain (envelope sender) or DKIM signing domain. Since each subdomain has its own DKIM keys signed by SES, DKIM alignment passes naturally.

## Custom MAIL FROM

The root domain uses a custom MAIL FROM (`m.x402email.com`) so the envelope sender aligns with the `From` header for SPF. This gives us both SPF and DKIM alignment with DMARC.

Subdomains don't need custom MAIL FROM because DMARC only requires ONE of SPF or DKIM to align, and each subdomain's DKIM already aligns. Adding per-subdomain MAIL FROM would add provisioning complexity for no deliverability gain.

## MX Records

Every subdomain gets an MX record for inbound email receiving:

```
10 inbound-smtp.us-east-1.amazonaws.com
```

Having an MX record also signals to spam filters that the domain is a "real" email domain, not a throwaway.

## SES Configuration

- **Region**: us-east-1
- **Sandbox mode**: 200 emails/day limit (acts as natural volume ramp-up)
- **Bounce/complaint monitoring**: SES dashboard at https://us-east-1.console.aws.amazon.com/ses/home
- **Account thresholds**: AWS suspends SES if bounce rate exceeds 5% or complaint rate exceeds 0.1%

## Google Postmaster Tools

Verified for `x402email.com` via DNS TXT record. Covers all `*.x402email.com` subdomains since Google aggregates at the organizational domain level. Dashboard at https://postmaster.google.com/managedomains. Data only appears at ~100+ daily sends to Gmail.

## What We Control vs. What We Don't

**We control (and have maximized):**
- SPF, DKIM, DMARC — all at strictest settings
- Custom MAIL FROM for SPF alignment on root domain
- MX records for all sending domains
- SNS signature verification to prevent forged inbound notifications
- Forward rate limiting (200/hr per subdomain) to prevent relay abuse

**We don't control (behavioral, builds over time):**
- Sender reputation — accrues with consistent low bounce/complaint rates
- Volume history — new domains start with low trust; our SES sandbox limit helps us ramp gradually
- Content quality — short text emails land better than HTML-heavy messages with lots of links
- Recipient engagement — emails that get opened/replied to boost reputation

## Checklist for New Subdomains

All handled automatically by `provisionSubdomain()`:

- [x] SES domain identity verification (TXT record)
- [x] 3 DKIM CNAME records
- [x] SPF TXT record (`-all` hardfail)
- [x] DMARC TXT record (`p=reject`)
- [x] MX record for inbound receiving
