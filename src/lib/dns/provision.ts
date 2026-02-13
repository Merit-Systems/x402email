/**
 * Full subdomain provisioning flow:
 * 1. Request SES verification tokens
 * 2. Add DNS records via Route53
 * 3. Return — verification happens asynchronously
 */
import { requestDomainVerification } from './ses-verify';
import { addDnsRecords } from './route53';

const DOMAIN = process.env.EMAIL_DOMAIN ?? 'x402email.com';

export async function provisionSubdomain(subdomain: string): Promise<void> {
  const tokens = await requestDomainVerification(subdomain);

  const records = [
    // SES verification TXT record
    {
      name: `_amazonses.${subdomain}`,
      type: 'TXT' as const,
      value: tokens.verificationToken,
    },
    // DKIM CNAME records
    ...tokens.dkimTokens.map((token) => ({
      name: `${token}._domainkey.${subdomain}`,
      type: 'CNAME' as const,
      value: `${token}.dkim.amazonses.com`,
    })),
    // SPF record
    {
      name: subdomain,
      type: 'TXT' as const,
      value: 'v=spf1 include:amazonses.com -all',
    },
    // DMARC record
    {
      name: `_dmarc.${subdomain}`,
      type: 'TXT' as const,
      value: `v=DMARC1; p=reject; rua=mailto:dmarc@${DOMAIN}`,
    },
    // MX record for inbound email receiving
    {
      name: subdomain,
      type: 'MX' as const,
      value: '10 inbound-smtp.us-east-1.amazonaws.com',
    },
  ];

  await addDnsRecords(records);
}
