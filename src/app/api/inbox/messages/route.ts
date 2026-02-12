/**
 * POST /api/inbox/messages — List messages in an inbox.
 * Protection: x402 payment ($0.001). Wallet must own the inbox.
 */
import { NextRequest, NextResponse } from 'next/server';
import { withX402 } from '@x402/next';
import { declareDiscoveryExtension } from '@x402/extensions/bazaar';
import { z } from 'zod';
import { getX402Server } from '@/lib/x402/server';
import { PRICES } from '@/lib/x402/pricing';
import { ListMessagesRequestSchema } from '@/schemas/inbox';
import { prisma } from '@/lib/db/client';
import { extractPayerWallet } from '@/lib/x402/extract-wallet';

const inputJsonSchema = z.toJSONSchema(ListMessagesRequestSchema, {
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

  const parsed = ListMessagesRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    const msg = parsed.error.issues
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join('; ');
    return NextResponse.json(
      { success: false, error: 'Validation failed', message: msg },
      { status: 400 },
    );
  }

  const { username, cursor, limit } = parsed.data;

  const walletAddress = extractPayerWallet(request);
  if (!walletAddress) {
    return NextResponse.json(
      { success: false, error: 'Could not determine payer wallet' },
      { status: 401 },
    );
  }

  const inbox = await prisma.inbox.findUnique({ where: { username } });
  if (!inbox) {
    return NextResponse.json(
      { success: false, error: 'Inbox not found' },
      { status: 404 },
    );
  }

  if (inbox.ownerWallet.toLowerCase() !== walletAddress) {
    return NextResponse.json(
      { success: false, error: 'Wallet not authorized for this inbox' },
      { status: 403 },
    );
  }

  if (!inbox.retainMessages) {
    return NextResponse.json(
      { success: false, error: 'Message retention is not enabled for this inbox. Enable it via POST /api/inbox/update with { "retainMessages": true }' },
      { status: 400 },
    );
  }

  const messages = await prisma.inboxMessage.findMany({
    where: {
      inboxId: inbox.id,
      ...(cursor ? { receivedAt: { lt: new Date(cursor) } } : {}),
    },
    orderBy: { receivedAt: 'desc' },
    take: limit + 1, // fetch one extra to determine if there's a next page
  });

  const hasMore = messages.length > limit;
  const page = hasMore ? messages.slice(0, limit) : messages;
  const nextCursor = hasMore ? page[page.length - 1].receivedAt.toISOString() : undefined;

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
  });
};

const routeConfig = {
  description: 'List messages in your inbox ($0.001 via x402)',
  extensions,
  accepts: [PRICES.inboxMessages],
};

export const POST = withX402(coreHandler, routeConfig, getX402Server());
