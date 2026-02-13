/**
 * POST /api/subdomain/inbox/messages — List messages in a subdomain inbox.
 * Protection: x402 payment ($0.001). Wallet must own the subdomain.
 */
import { NextRequest, NextResponse } from 'next/server';
import { withX402 } from '@x402/next';
import { declareDiscoveryExtension } from '@x402/extensions/bazaar';
import { z } from 'zod';
import { getX402Server } from '@/lib/x402/server';
import { PRICES } from '@/lib/x402/pricing';
import { SubdomainInboxMessagesRequestSchema } from '@/schemas/subdomain';
import { prisma } from '@/lib/db/client';
import { extractPayerWallet } from '@/lib/x402/extract-wallet';

const inputJsonSchema = z.toJSONSchema(SubdomainInboxMessagesRequestSchema, {
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
          messages: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                fromEmail: { type: 'string' },
                subject: { type: 'string' },
                receivedAt: { type: 'string' },
                read: { type: 'boolean' },
              },
            },
          },
          nextCursor: { type: 'string' },
        },
        required: ['success', 'messages'],
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

  const parsed = SubdomainInboxMessagesRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    const msg = parsed.error.issues
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join('; ');
    return NextResponse.json(
      { success: false, error: 'Validation failed', message: msg },
      { status: 400 },
    );
  }

  const { subdomain: subdomainName, localPart, cursor, limit } = parsed.data;

  const walletAddress = extractPayerWallet(request);
  if (!walletAddress) {
    return NextResponse.json(
      { success: false, error: 'Could not determine payer wallet' },
      { status: 401 },
    );
  }

  const subdomain = await prisma.subdomain.findUnique({
    where: { name: subdomainName },
  });

  if (!subdomain) {
    return NextResponse.json(
      { success: false, error: 'Subdomain not found' },
      { status: 404 },
    );
  }

  if (subdomain.ownerWallet.toLowerCase() !== walletAddress) {
    return NextResponse.json(
      { success: false, error: 'Wallet not authorized for this subdomain' },
      { status: 403 },
    );
  }

  const inbox = await prisma.subdomainInbox.findUnique({
    where: { subdomainId_localPart: { subdomainId: subdomain.id, localPart } },
  });

  if (!inbox) {
    return NextResponse.json(
      { success: false, error: 'Inbox not found on this subdomain' },
      { status: 404 },
    );
  }

  const MESSAGE_LIMIT = 500;

  const [messages, totalCount] = await Promise.all([
    prisma.subdomainMessage.findMany({
      where: { inboxId: inbox.id },
      orderBy: { receivedAt: 'desc' },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    }),
    prisma.subdomainMessage.count({ where: { inboxId: inbox.id } }),
  ]);

  const hasMore = messages.length > limit;
  const page = hasMore ? messages.slice(0, limit) : messages;
  const nextCursor = hasMore ? page[page.length - 1].id : undefined;

  // Capacity warning when near or at limit
  let warning: string | undefined;
  if (totalCount >= MESSAGE_LIMIT) {
    warning = `Inbox is at capacity (${totalCount}/${MESSAGE_LIMIT} messages). New inbound messages will not be retained. Delete old messages to free up space using POST /api/subdomain/inbox/messages/delete.`;
  } else if (totalCount >= MESSAGE_LIMIT * 0.8) {
    warning = `Inbox is near capacity (${totalCount}/${MESSAGE_LIMIT} messages). Delete old messages to free up space using POST /api/subdomain/inbox/messages/delete.`;
  }

  return NextResponse.json({
    success: true,
    messages: page.map((m) => ({
      id: m.id,
      fromEmail: m.fromEmail,
      subject: m.subject,
      receivedAt: m.receivedAt.toISOString(),
      read: m.read,
    })),
    ...(nextCursor ? { nextCursor } : {}),
    messageCount: totalCount,
    messageLimit: MESSAGE_LIMIT,
    ...(warning ? { warning } : {}),
  });
};

const routeConfig = {
  description: 'List messages in a subdomain inbox ($0.001 via x402)',
  extensions,
  accepts: [PRICES.subdomainInboxMessages],
};

export const POST = withX402(coreHandler, routeConfig, getX402Server());
