/**
 * AWS Route53 DNS client for managing subdomain DNS records.
 * Uses a scoped IAM user with access only to the x402email.com hosted zone.
 */
import {
  Route53Client,
  ChangeResourceRecordSetsCommand,
  type Change,
} from '@aws-sdk/client-route-53';

const route53 = new Route53Client({
  region: (process.env.AWS_REGION ?? 'us-east-1').trim(),
  credentials: {
    accessKeyId: (process.env.AWS_ACCESS_KEY_ID ?? '').trim(),
    secretAccessKey: (process.env.AWS_SECRET_ACCESS_KEY ?? '').trim(),
  },
});

function getHostedZoneId(): string {
  const id = process.env.ROUTE53_HOSTED_ZONE_ID;
  if (!id) throw new Error('ROUTE53_HOSTED_ZONE_ID is required for DNS management');
  return id;
}

const DOMAIN = process.env.EMAIL_DOMAIN ?? 'x402email.com';

interface DnsRecord {
  name: string;
  type: 'TXT' | 'CNAME' | 'MX' | 'A' | 'AAAA';
  value: string;
  ttl?: number;
}

function toRoute53Change(record: DnsRecord): Change {
  const fullName = record.name.endsWith(DOMAIN)
    ? `${record.name}.`
    : `${record.name}.${DOMAIN}.`;

  const value =
    record.type === 'TXT' ? `"${record.value}"` : record.value.endsWith('.') ? record.value : `${record.value}.`;

  return {
    Action: 'UPSERT',
    ResourceRecordSet: {
      Name: fullName,
      Type: record.type,
      TTL: record.ttl ?? 300,
      ResourceRecords: [{ Value: value }],
    },
  };
}

export async function addDnsRecords(records: DnsRecord[]): Promise<void> {
  const changes = records.map(toRoute53Change);

  await route53.send(
    new ChangeResourceRecordSetsCommand({
      HostedZoneId: getHostedZoneId(),
      ChangeBatch: {
        Changes: changes,
        Comment: `x402email subdomain provisioning`,
      },
    }),
  );
}

export async function addDnsRecord(record: DnsRecord): Promise<void> {
  await addDnsRecords([record]);
}
