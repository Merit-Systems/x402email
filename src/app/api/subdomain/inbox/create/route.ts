/**
 * POST /api/subdomain/inbox/create — Create an inbox on a subdomain.
 * Protection: x402 payment ($0.25). Wallet must own the subdomain.
 * Cap: 100 inboxes per subdomain, 500 messages per inbox.
 */
import { NextRequest, NextResponse } from 'next/server';
import { withX402 } from '@x402/next';
import { declareDiscoveryExtension } from '@x402/extensions/bazaar';
import { z } from 'zod';
import { getX402Server } from '@/lib/x402/server';
import { PRICES } from '@/lib/x402/pricing';
import { CreateSubdomainInboxRequestSchema } from '@/schemas/subdomain';
import { prisma } from '@/lib/db/client';
import { extractPayerWallet } from '@/lib/x402/extract-wallet';

const DOMAIN = process.env.EMAIL_DOMAIN ?? 'x402email.com';
const MAX_INBOXES_PER_SUBDOMAIN = 100;

const inputJsonSchema = z.toJSONSchema(CreateSubdomainInboxRequestSchema, {
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
          id: { type: 'string' },
          forwardTo: { type: 'string' },
          retainMessages: { type: 'boolean' },
        },
        required: ['success', 'inbox', 'id', 'retainMessages'],
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

  const parsed = CreateSubdomainInboxRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    const msg = parsed.error.issues
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join('; ');
    return NextResponse.json(
      { success: false, error: 'Validation failed', message: msg },
      { status: 400 },
    );
  }

  const { subdomain: subdomainName, localPart, forwardTo } = parsed.data;

  const walletAddress = extractPayerWallet(request);
  if (!walletAddress) {
    return NextResponse.json(
      { success: false, error: 'Could not determine payer wallet' },
      { status: 401 },
    );
  }

  const subdomain = await prisma.subdomain.findUnique({
    where: { name: subdomainName },
    include: { _count: { select: { inboxes: true } } },
  });

  if (!subdomain) {
    return NextResponse.json(
      { success: false, error: 'Subdomain not found' },
      { status: 404 },
    );
  }

  if (subdomain.ownerWallet.toLowerCase() !== walletAddress) {
    return NextResponse.json(
      { success: false, error: 'Only the subdomain owner can create inboxes' },
      { status: 403 },
    );
  }

  if (subdomain._count.inboxes >= MAX_INBOXES_PER_SUBDOMAIN) {
    return NextResponse.json(
      { success: false, error: `Maximum ${MAX_INBOXES_PER_SUBDOMAIN} inboxes per subdomain` },
      { status: 409 },
    );
  }

  // Check for existing inbox with same localPart
  const existing = await prisma.subdomainInbox.findUnique({
    where: { subdomainId_localPart: { subdomainId: subdomain.id, localPart } },
  });

  if (existing) {
    return NextResponse.json(
      { success: false, error: 'Inbox already exists on this subdomain' },
      { status: 409 },
    );
  }

  const retainMessages = !forwardTo;

  const inbox = await prisma.subdomainInbox.create({
    data: {
      subdomainId: subdomain.id,
      localPart,
      forwardTo: forwardTo ?? null,
      retainMessages,
    },
  });

  return NextResponse.json({
    success: true,
    inbox: `${localPart}@${subdomainName}.${DOMAIN}`,
    id: inbox.id,
    ...(forwardTo ? { forwardTo } : {}),
    retainMessages,
    messageLimit: 500,
  });
};

const routeConfig = {
  description: 'Create an inbox on your subdomain ($0.25 via x402). Max 100 inboxes, 500 messages each.',
  extensions,
  accepts: [PRICES.subdomainInboxCreate],
};

export const POST = withX402(coreHandler, routeConfig, getX402Server());
