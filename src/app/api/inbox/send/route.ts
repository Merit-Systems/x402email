/**
 * POST /api/inbox/send — Send email from a forwarding inbox.
 * Protection: x402 payment ($0.001). Wallet identity extracted from payment.
 */
import { NextRequest, NextResponse } from 'next/server';
import { withX402 } from '@x402/next';
import { declareDiscoveryExtension } from '@x402/extensions/bazaar';
import { z } from 'zod';
import { getX402Server } from '@/lib/x402/server';
import { PRICES } from '@/lib/x402/pricing';
import { InboxSendRequestSchema } from '@/schemas/inbox';
import { prisma } from '@/lib/db/client';
import { sendEmail } from '@/lib/email/ses';
import { extractPayerWallet } from '@/lib/x402/extract-wallet';

const DOMAIN = process.env.EMAIL_DOMAIN ?? 'x402email.com';

const inputJsonSchema = z.toJSONSchema(InboxSendRequestSchema, {
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
          messageId: { type: 'string' },
          from: { type: 'string' },
        },
        required: ['success', 'messageId', 'from'],
      },
      example: {
        success: true,
        messageId: 'ses-message-id',
        from: 'alice@x402email.com',
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

  const parsed = InboxSendRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    const msg = parsed.error.issues
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join('; ');
    return NextResponse.json(
      { success: false, error: 'Validation failed', message: msg },
      { status: 400 },
    );
  }

  const body = parsed.data;

  // Extract wallet from x402 payment header
  const walletAddress = extractPayerWallet(request);
  if (!walletAddress) {
    return NextResponse.json(
      { success: false, error: 'Could not determine payer wallet' },
      { status: 401 },
    );
  }

  // Look up inbox
  const inbox = await prisma.inbox.findUnique({
    where: { username: body.username },
  });

  if (!inbox) {
    return NextResponse.json(
      { success: false, error: 'Inbox not found' },
      { status: 404 },
    );
  }

  // Verify wallet is owner
  if (inbox.ownerWallet.toLowerCase() !== walletAddress) {
    return NextResponse.json(
      { success: false, error: 'Wallet not authorized for this inbox' },
      { status: 403 },
    );
  }

  // Check inbox is active and not expired
  if (!inbox.active || inbox.expiresAt < new Date()) {
    return NextResponse.json(
      { success: false, error: 'Inbox is expired — top up to reactivate' },
      { status: 403 },
    );
  }

  const from = `${body.username}@${DOMAIN}`;

  try {
    const result = await sendEmail({
      from,
      to: body.to,
      subject: body.subject,
      html: body.html,
      text: body.text,
      replyTo: body.replyTo,
    });

    await prisma.sendLog.create({
      data: {
        inboxId: inbox.id,
        senderWallet: walletAddress,
        fromEmail: from,
        toEmails: body.to,
        subject: body.subject,
        sesMessageId: result.messageId,
      },
    });

    return NextResponse.json({
      success: true,
      messageId: result.messageId,
      from,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Email send failed';
    console.error('[x402email] Inbox send error:', msg);
    return NextResponse.json(
      { success: false, error: msg },
      { status: 500 },
    );
  }
};

const routeConfig = {
  description: `Send email from your forwarding inbox on ${DOMAIN} ($0.001 via x402)`,
  extensions,
  accepts: [PRICES.inboxSend],
};

export const POST = withX402(coreHandler, routeConfig, getX402Server());
