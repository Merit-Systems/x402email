/**
 * POST /api/inbox/buy — Purchase a forwarding inbox.
 * Protection: x402 payment ($1).
 * The buyer's wallet is extracted from the x402 payment header.
 */
import { NextRequest, NextResponse } from 'next/server';
import { withX402 } from '@x402/next';
import { declareDiscoveryExtension } from '@x402/extensions/bazaar';
import { z } from 'zod';
import { getX402Server } from '@/lib/x402/server';
import { PRICES } from '@/lib/x402/pricing';
import { BuyInboxRequestSchema } from '@/schemas/inbox';
import { prisma } from '@/lib/db/client';
import { extractPayerWallet } from '@/lib/x402/extract-wallet';

const DOMAIN = process.env.EMAIL_DOMAIN ?? 'x402email.com';

const inputJsonSchema = z.toJSONSchema(BuyInboxRequestSchema, {
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
          inbox: { type: 'string' },
          forwardTo: { type: 'string' },
          expiresAt: { type: 'string' },
          daysRemaining: { type: 'number' },
        },
        required: ['success', 'inbox', 'forwardTo', 'expiresAt', 'daysRemaining'],
      },
      example: {
        success: true,
        inbox: 'alice@x402email.com',
        forwardTo: 'alice@gmail.com',
        expiresAt: '2025-07-15T12:00:00.000Z',
        daysRemaining: 30,
      },
    },
  } as never),
};

const coreHandler = async (request: NextRequest): Promise<NextResponse> => {
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: 'Invalid JSON body' },
      { status: 400 },
    );
  }

  const parsed = BuyInboxRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    const msg = parsed.error.issues
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join('; ');
    return NextResponse.json(
      { success: false, error: 'Validation failed', message: msg },
      { status: 400 },
    );
  }

  const { username, forwardTo } = parsed.data;

  const ownerWallet = extractPayerWallet(request);
  if (!ownerWallet) {
    return NextResponse.json(
      { success: false, error: 'Could not determine payer wallet' },
      { status: 400 },
    );
  }

  // Cross-table uniqueness check: reject if inbox OR subdomain with this name exists
  const [existingInbox, existingSubdomain] = await prisma.$transaction([
    prisma.inbox.findUnique({ where: { username } }),
    prisma.subdomain.findUnique({ where: { name: username } }),
  ]);

  if (existingInbox) {
    return NextResponse.json(
      { success: false, error: 'Username already taken as an inbox' },
      { status: 409 },
    );
  }

  if (existingSubdomain) {
    return NextResponse.json(
      { success: false, error: 'Username already taken as a subdomain' },
      { status: 409 },
    );
  }

  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  await prisma.inbox.create({
    data: {
      username,
      forwardTo,
      ownerWallet,
      expiresAt,
    },
  });

  return NextResponse.json({
    success: true,
    inbox: `${username}@${DOMAIN}`,
    forwardTo,
    expiresAt: expiresAt.toISOString(),
    daysRemaining: 30,
  });
};

const routeConfig = {
  description: `Buy a forwarding inbox on ${DOMAIN} ($1 via x402, 30 days)`,
  extensions,
  accepts: [PRICES.inboxBuy],
};

export const POST = withX402(coreHandler, routeConfig, getX402Server());
