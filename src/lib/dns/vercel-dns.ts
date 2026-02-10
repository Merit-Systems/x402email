/**
 * Vercel DNS API client for managing subdomain DNS records.
 * Uses Vercel's REST API to add/remove DNS records for x402email.com subdomains.
 */

const VERCEL_API = 'https://api.vercel.com';
const DOMAIN = process.env.EMAIL_DOMAIN ?? 'x402email.com';

function getToken(): string {
  const token = process.env.VERCEL_TOKEN;
  if (!token) throw new Error('VERCEL_TOKEN is required for DNS management');
  return token;
}

interface DnsRecord {
  name: string;
  type: 'TXT' | 'CNAME' | 'MX' | 'A' | 'AAAA';
  value: string;
  ttl?: number;
}

export async function addDnsRecord(record: DnsRecord): Promise<{ uid: string }> {
  const res = await fetch(`${VERCEL_API}/v2/domains/${DOMAIN}/records`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${getToken()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: record.name,
      type: record.type,
      value: record.value,
      ttl: record.ttl ?? 300,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Vercel DNS add failed (${res.status}): ${body}`);
  }

  const data = await res.json();
  return { uid: data.uid };
}

export async function addDnsRecords(records: DnsRecord[]): Promise<void> {
  // Add records sequentially to avoid rate limiting
  for (const record of records) {
    await addDnsRecord(record);
  }
}
