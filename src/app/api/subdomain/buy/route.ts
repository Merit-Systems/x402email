/**
 * POST /api/subdomain/buy — Purchase a subdomain.
 * Protection: x402 payment ($5).
 * The buyer's wallet is extracted from the x402 payment header.
 */
import { NextRequest, NextResponse } from 'next/server';
import { withX402 } from '@x402/next';
import { declareDiscoveryExtension } from '@x402/extensions/bazaar';
import { z } from 'zod';
import { getX402Server } from '@/lib/x402/server';
import { PRICES } from '@/lib/x402/pricing';
import { BuySubdomainRequestSchema } from '@/schemas/subdomain';
import { prisma } from '@/lib/db/client';
import { provisionSubdomain } from '@/lib/dns/provision';
import { extractPayerWallet } from '@/lib/x402/extract-wallet';

const inputJsonSchema = z.toJSONSchema(BuySubdomainRequestSchema, {
  target: 'draft-2020-12',
});

const extensions = {
  ...declareDiscoveryExtension({
    bodyType: 'json',
    inputSchema: inputJsonSchema,
    output: {
      schema: {
        type: 'object',
        properties: {
          success: { type: 'boolean', const: true },
          subdomain: { type: 'string' },
          dnsStatus: { type: 'string' },
          estimatedVerificationMinutes: { type: 'number' },
        },
        required: ['success', 'subdomain', 'dnsStatus'],
      },
      example: {
        success: true,
        subdomain: 'alice.x402email.com',
        dnsStatus: 'pending',
        estimatedVerificationMinutes: 5,
      },
    },
  } as never),
};

const DOMAIN = process.env.EMAIL_DOMAIN ?? 'x402email.com';

const coreHandler = async (request: NextRequest): Promise<NextResponse> => {
  // Parse body
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: 'Invalid JSON body' },
      { status: 400 },
    );
  }

  const parsed = BuySubdomainRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    const msg = parsed.error.issues
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join('; ');
    return NextResponse.json(
      { success: false, error: 'Validation failed', message: msg },
      { status: 400 },
    );
  }

  const { subdomain } = parsed.data;

  // Extract wallet from x402 payment header (verified by facilitator before handler runs)
  const ownerWallet = extractPayerWallet(request);
  if (!ownerWallet) {
    return NextResponse.json(
      { success: false, error: 'Could not determine payer wallet' },
      { status: 400 },
    );
  }

  // Cross-table uniqueness check: reject if subdomain OR inbox with this name exists
  const [existingSubdomain, existingInbox] = await prisma.$transaction([
    prisma.subdomain.findUnique({ where: { name: subdomain } }),
    prisma.inbox.findUnique({ where: { username: subdomain } }),
  ]);
  if (existingSubdomain) {
    return NextResponse.json(
      { success: false, error: 'Subdomain already taken' },
      { status: 409 },
    );
  }
  if (existingInbox) {
    return NextResponse.json(
      { success: false, error: 'Name already taken as a forwarding inbox' },
      { status: 409 },
    );
  }

  // Provision DNS + SES verification
  try {
    await provisionSubdomain(subdomain);
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'DNS provisioning failed';
    console.error('[x402email] Provision error:', msg);
    return NextResponse.json(
      { success: false, error: msg },
      { status: 500 },
    );
  }

  // Store in DB
  await prisma.subdomain.create({
    data: {
      name: subdomain,
      ownerWallet,
    },
  });

  return NextResponse.json({
    success: true,
    subdomain: `${subdomain}.${DOMAIN}`,
    dnsStatus: 'pending',
    estimatedVerificationMinutes: 5,
  });
};

const routeConfig = {
  description: `Purchase a custom email subdomain on ${DOMAIN} ($5 via x402)`,
  extensions,
  accepts: [PRICES.subdomainBuy],
};

export const POST = withX402(coreHandler, routeConfig, getX402Server());
