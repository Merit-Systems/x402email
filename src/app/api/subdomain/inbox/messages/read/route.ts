/**
 * POST /api/subdomain/inbox/messages/read — Read a single subdomain inbox message.
 * Protection: x402 payment ($0.001). Wallet must own the subdomain.
 */
import { NextRequest, NextResponse } from 'next/server';
import { withX402 } from '@x402/next';
import { declareDiscoveryExtension } from '@x402/extensions/bazaar';
import { z } from 'zod';
import { getX402Server } from '@/lib/x402/server';
import { PRICES } from '@/lib/x402/pricing';
import { SubdomainInboxReadMessageRequestSchema } from '@/schemas/subdomain';
import { prisma } from '@/lib/db/client';
import { extractPayerWallet } from '@/lib/x402/extract-wallet';
import { getRawEmail } from '@/lib/email/s3';
import { parseRawEmail } from '@/lib/email/parse';

const inputJsonSchema = z.toJSONSchema(SubdomainInboxReadMessageRequestSchema, {
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
          message: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              from: { type: 'string' },
              to: { type: 'array', items: { type: 'string' } },
              subject: { type: 'string' },
              date: { type: 'string' },
              text: { type: 'string' },
              html: { type: 'string' },
              attachments: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    filename: { type: 'string' },
                    contentType: { type: 'string' },
                    size: { type: 'number' },
                  },
                },
              },
            },
          },
        },
        required: ['success', 'message'],
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

  const parsed = SubdomainInboxReadMessageRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    const msg = parsed.error.issues
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join('; ');
    return NextResponse.json(
      { success: false, error: 'Validation failed', message: msg },
      { status: 400 },
    );
  }

  const { messageId } = parsed.data;

  const walletAddress = extractPayerWallet(request);
  if (!walletAddress) {
    return NextResponse.json(
      { success: false, error: 'Could not determine payer wallet' },
      { status: 401 },
    );
  }

  const message = await prisma.subdomainMessage.findUnique({
    where: { id: messageId },
    include: { inbox: { include: { subdomain: true } } },
  });

  if (!message) {
    return NextResponse.json(
      { success: false, error: 'Message not found' },
      { status: 404 },
    );
  }

  if (message.inbox.subdomain.ownerWallet.toLowerCase() !== walletAddress) {
    return NextResponse.json(
      { success: false, error: 'Wallet not authorized for this subdomain' },
      { status: 403 },
    );
  }

  let rawEmail: Buffer;
  try {
    rawEmail = await getRawEmail(message.s3Key);
  } catch (error) {
    console.error('[x402email] Failed to fetch message from S3:', error);
    return NextResponse.json(
      { success: false, error: 'Message content unavailable (may have been deleted from storage)' },
      { status: 410 },
    );
  }

  let email;
  try {
    email = await parseRawEmail(rawEmail);
  } catch (error) {
    console.error('[x402email] Failed to parse email:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to parse email content' },
      { status: 500 },
    );
  }

  if (!message.read) {
    await prisma.subdomainMessage.update({
      where: { id: messageId },
      data: { read: true },
    });
  }

  return NextResponse.json({
    success: true,
    message: {
      id: message.id,
      from: email.from,
      to: email.to,
      subject: email.subject,
      date: email.date,
      text: email.text,
      html: email.html,
      attachments: email.attachments,
      receivedAt: message.receivedAt.toISOString(),
    },
  });
};

const routeConfig = {
  description: 'Read a single subdomain inbox message ($0.001 via x402)',
  extensions,
  accepts: [PRICES.subdomainInboxMessages],
};

export const POST = withX402(coreHandler, routeConfig, getX402Server());
