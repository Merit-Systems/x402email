/**
 * POST /api/send — Shared domain email send.
 * Protection: x402 payment ($0.02), no SIWX.
 * Sends from relay@x402email.com via AWS SES.
 */
import { router, DOMAIN } from '@/lib/routes';
import { SendEmailRequestSchema } from '@/schemas/send';
import { sendEmail } from '@/lib/email/ses';
import { prisma } from '@/lib/db/client';

const FROM = `"x402email" <relay@${DOMAIN}>`;

export const POST = router
  .route('send')
  .paid('0.02', { protocols: ['x402', 'mpp'] })
  .body(SendEmailRequestSchema)
  .description(`Send an email from ${FROM} ($0.02 via x402)`)
  .handler(async ({ body }) => {
    const result = await sendEmail({
      from: FROM,
      to: body.to,
      subject: body.subject,
      html: body.html,
      text: body.text,
      replyTo: body.replyTo,
      attachments: body.attachments,
    });

    await prisma.sendLog.create({
      data: {
        fromEmail: FROM,
        toEmails: body.to,
        subject: body.subject,
        sesMessageId: result.messageId,
      },
    });

    return {
      success: true,
      messageId: result.messageId,
      from: FROM,
    };
  });
