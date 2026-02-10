/**
 * POST /api/send — Shared domain email send.
 * Protection: x402 payment ($0.001), no SIWX.
 * Sends from noreply@x402email.com via AWS SES.
 */
import { NextResponse } from 'next/server';
import { createX402PostRoute } from '@/lib/x402/route-wrapper';
import { PRICES } from '@/lib/x402/pricing';
import { SendEmailRequestSchema } from '@/schemas/send';
import { sendEmail } from '@/lib/email/ses';
import { prisma } from '@/lib/db/client';

const DOMAIN = process.env.EMAIL_DOMAIN ?? 'x402email.com';
const FROM = `noreply@${DOMAIN}`;

export const POST = createX402PostRoute({
  description: `Send an email from ${FROM} ($0.001 via x402)`,
  inputSchema: SendEmailRequestSchema,
  outputExample: {
    success: true as const,
    messageId: 'ses-message-id',
    from: FROM,
  },
  outputSchema: {
    type: 'object',
    properties: {
      success: { type: 'boolean', const: true },
      messageId: { type: 'string' },
      from: { type: 'string' },
    },
    required: ['success', 'messageId', 'from'],
  },
  accepts: [PRICES.send],
  handler: async (body) => {
    try {
      const result = await sendEmail({
        from: FROM,
        to: body.to,
        subject: body.subject,
        html: body.html,
        text: body.text,
        replyTo: body.replyTo,
      });

      // Log the send
      await prisma.sendLog.create({
        data: {
          fromEmail: FROM,
          toEmails: body.to,
          subject: body.subject,
          sesMessageId: result.messageId,
        },
      });

      return NextResponse.json({
        success: true,
        messageId: result.messageId,
        from: FROM,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Email send failed';
      console.error('[x402email] Send error:', message);
      return NextResponse.json(
        { success: false, error: message },
        { status: 500 },
      );
    }
  },
});
