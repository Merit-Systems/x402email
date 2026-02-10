/**
 * POST /api/subdomain/buy — Purchase a subdomain.
 * Protection: x402 payment ($50) + SIWX extension.
 * The buyer's wallet is extracted from the SIWX proof.
 */
import { NextRequest, NextResponse } from 'next/server';
import { withX402 } from '@x402/next';
import { declareDiscoveryExtension } from '@x402/extensions/bazaar';
import { declareSIWxExtension, parseSIWxHeader } from '@x402/extensions/sign-in-with-x';
import { z } from 'zod';
import { getX402Server } from '@/lib/x402/server';
import { PRICES } from '@/lib/x402/pricing';
import { BuySubdomainRequestSchema } from '@/schemas/subdomain';
import { prisma } from '@/lib/db/client';
import { provisionSubdomain } from '@/lib/dns/provision';

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
  ...declareSIWxExtension({
    statement: 'Purchase a subdomain on x402email.com',
    expirationSeconds: 300,
  }),
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

  // Extract wallet from SIWX header
  const siwxHeader = request.headers.get('SIGN-IN-WITH-X');
  if (!siwxHeader) {
    return NextResponse.json(
      { success: false, error: 'Missing SIGN-IN-WITH-X header' },
      { status: 401 },
    );
  }

  let ownerWallet: string;
  try {
    const payload = parseSIWxHeader(siwxHeader);
    ownerWallet = payload.address.toLowerCase();
  } catch {
    return NextResponse.json(
      { success: false, error: 'Invalid SIGN-IN-WITH-X header' },
      { status: 401 },
    );
  }

  // Check availability
  const existing = await prisma.subdomain.findUnique({
    where: { name: subdomain },
  });
  if (existing) {
    return NextResponse.json(
      { success: false, error: 'Subdomain already taken' },
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
