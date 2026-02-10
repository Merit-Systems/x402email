/**
 * POST /api/subdomain/send — Send email from a custom subdomain.
 * Protection: x402 payment ($0.001). Wallet identity extracted from payment.
 */
import { NextRequest, NextResponse } from 'next/server';
import { withX402 } from '@x402/next';
import { declareDiscoveryExtension } from '@x402/extensions/bazaar';
import { z } from 'zod';
import { getX402Server } from '@/lib/x402/server';
import { PRICES } from '@/lib/x402/pricing';
import { SubdomainSendRequestSchema } from '@/schemas/subdomain';
import { prisma } from '@/lib/db/client';
import { sendEmail } from '@/lib/email/ses';
import { extractPayerWallet } from '@/lib/x402/extract-wallet';

const DOMAIN = process.env.EMAIL_DOMAIN ?? 'x402email.com';

const inputJsonSchema = z.toJSONSchema(SubdomainSendRequestSchema, {
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
        from: 'hello@alice.x402email.com',
      },
    },
  } as never),
};

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

  const parsed = SubdomainSendRequestSchema.safeParse(rawBody);
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

  // Extract subdomain from the "from" address
  const fromDomain = body.from.split('@')[1];
  if (!fromDomain?.endsWith(`.${DOMAIN}`)) {
    return NextResponse.json(
      { success: false, error: `from address must be on a *.${DOMAIN} subdomain` },
      { status: 400 },
    );
  }
  const subdomain = fromDomain.replace(`.${DOMAIN}`, '');

  // Extract wallet from x402 payment header
  const walletAddress = extractPayerWallet(request);
  if (!walletAddress) {
    return NextResponse.json(
      { success: false, error: 'Could not determine payer wallet' },
      { status: 401 },
    );
  }

  // Look up subdomain and check authorization
  const subdomainRecord = await prisma.subdomain.findUnique({
    where: { name: subdomain },
    include: { signers: true },
  });

  if (!subdomainRecord) {
    return NextResponse.json(
      { success: false, error: 'Subdomain not found' },
      { status: 404 },
    );
  }

  const isOwner = subdomainRecord.ownerWallet.toLowerCase() === walletAddress;
  const isSigner = subdomainRecord.signers.some(
    (s) => s.walletAddress.toLowerCase() === walletAddress,
  );

  if (!isOwner && !isSigner) {
    return NextResponse.json(
      { success: false, error: 'Wallet not authorized for this subdomain' },
      { status: 403 },
    );
  }

  if (!subdomainRecord.sesVerified) {
    return NextResponse.json(
      { success: false, error: 'Subdomain email not yet verified — check /api/subdomain/status' },
      { status: 503 },
    );
  }

  // Send email
  try {
    const result = await sendEmail({
      from: body.from,
      to: body.to,
      subject: body.subject,
      html: body.html,
      text: body.text,
      replyTo: body.replyTo,
    });

    // Log send
    await prisma.sendLog.create({
      data: {
        subdomainId: subdomainRecord.id,
        senderWallet: walletAddress,
        fromEmail: body.from,
        toEmails: body.to,
        subject: body.subject,
        sesMessageId: result.messageId,
      },
    });

    return NextResponse.json({
      success: true,
      messageId: result.messageId,
      from: body.from,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Email send failed';
    console.error('[x402email] Subdomain send error:', msg);
    return NextResponse.json(
      { success: false, error: msg },
      { status: 500 },
    );
  }
};

const routeConfig = {
  description: `Send email from your custom subdomain on ${DOMAIN} ($0.001 via x402)`,
  extensions,
  accepts: [PRICES.send],
};

export const POST = withX402(coreHandler, routeConfig, getX402Server());
