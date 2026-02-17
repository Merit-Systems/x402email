/**
 * POST /api/inbox/send — Send email from a forwarding inbox.
 * Protection: x402 payment ($0.005). Wallet identity extracted from payment.
 */
import { router, DOMAIN } from '@/lib/routes';
import { InboxSendRequestSchema } from '@/schemas/inbox';
import { prisma } from '@/lib/db/client';
import { sendEmail } from '@/lib/email/ses';

export const POST = router
  .route('inbox/send')
  .body(InboxSendRequestSchema)
  .description(`Send email from your forwarding inbox on ${DOMAIN} ($0.005 via x402)`)
  .handler(async ({ body, wallet }) => {
    const walletAddress = wallet!.toLowerCase();

    const inbox = await prisma.inbox.findUnique({
      where: { username: body.username },
    });

    if (!inbox) {
      throw Object.assign(new Error('Inbox not found'), { status: 404 });
    }

    if (inbox.ownerWallet.toLowerCase() !== walletAddress) {
      throw Object.assign(
        new Error('Wallet not authorized for this inbox'),
        { status: 403 },
      );
    }

    if (!inbox.active || inbox.expiresAt < new Date()) {
      throw Object.assign(
        new Error('Inbox is expired — top up to reactivate'),
        { status: 403 },
      );
    }

    const from = `${body.username}@${DOMAIN}`;

    const result = await sendEmail({
      from,
      to: body.to,
      subject: body.subject,
      html: body.html,
      text: body.text,
      replyTo: body.replyTo,
      attachments: body.attachments,
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

    return {
      success: true,
      messageId: result.messageId,
      from,
    };
  });
