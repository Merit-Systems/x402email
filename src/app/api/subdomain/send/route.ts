/**
 * POST /api/subdomain/send — Send email from a custom subdomain.
 * Protection: x402 payment ($0.005). Wallet identity extracted from payment.
 */
import { router, DOMAIN } from '@/lib/routes';
import { SubdomainSendRequestSchema } from '@/schemas/subdomain';
import { prisma } from '@/lib/db/client';
import { sendEmail } from '@/lib/email/ses';

export const POST = router
  .route('subdomain/send')
  .paid('0.005', { protocols: ['x402', 'mpp'] })
  .body(SubdomainSendRequestSchema)
  .description(`Send email from your custom subdomain on ${DOMAIN} ($0.005 via x402)`)
  .handler(async ({ body, wallet }) => {
    const walletAddress = wallet!.toLowerCase();

    // Extract subdomain from the "from" address
    const fromDomain = body.from.split('@')[1];
    if (!fromDomain?.endsWith(`.${DOMAIN}`)) {
      throw Object.assign(
        new Error(`from address must be on a *.${DOMAIN} subdomain`),
        { status: 400 },
      );
    }
    const subdomain = fromDomain.replace(`.${DOMAIN}`, '');

    // Look up subdomain and check authorization
    const subdomainRecord = await prisma.subdomain.findUnique({
      where: { name: subdomain },
      include: { signers: true },
    });

    if (!subdomainRecord) {
      throw Object.assign(new Error('Subdomain not found'), { status: 404 });
    }

    const isOwner = subdomainRecord.ownerWallet.toLowerCase() === walletAddress;
    const isSigner = subdomainRecord.signers.some(
      (s) => s.walletAddress.toLowerCase() === walletAddress,
    );

    if (!isOwner && !isSigner) {
      throw Object.assign(
        new Error('Wallet not authorized for this subdomain'),
        { status: 403 },
      );
    }

    if (!subdomainRecord.dnsVerified || !subdomainRecord.sesVerified) {
      throw Object.assign(
        new Error('Subdomain not yet verified — check /api/subdomain/status'),
        { status: 503 },
      );
    }

    const result = await sendEmail({
      from: body.from,
      to: body.to,
      subject: body.subject,
      html: body.html,
      text: body.text,
      replyTo: body.replyTo,
      attachments: body.attachments,
    });

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

    return {
      success: true,
      messageId: result.messageId,
      from: body.from,
    };
  });
