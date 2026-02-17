/**
 * POST /api/inbox/cancel — Cancel an inbox and receive a pro-rata refund.
 * Protection: SIWX only (NOT an x402 route — no payment).
 * Only the inbox owner can cancel.
 *
 * Calculates remaining value based on days left vs original purchase rate ($1/30 days).
 * Sends USDC refund on-chain via x402scan's /api/send endpoint.
 * Optionally accepts a refundAddress; defaults to the caller's wallet.
 */
import { router, DOMAIN } from '@/lib/routes';
import { CancelInboxRequestSchema } from '@/schemas/inbox';
import { prisma } from '@/lib/db/client';
import { sendRefund } from '@/lib/x402/refund';

const RATE_PER_DAY = 1 / 30; // $1 per 30 days
const MIN_REFUND = 0.01; // Don't refund less than $0.01 (gas cost not worth it)

export const POST = router
  .route('inbox/cancel')
  .siwx()
  .body(CancelInboxRequestSchema)
  .description('Cancel inbox and get pro-rata USDC refund (SIWX, free)')
  .handler(async ({ body, wallet }) => {
    const callerWallet = wallet!.toLowerCase();
    const { username, refundAddress } = body;

    const inbox = await prisma.inbox.findUnique({
      where: { username },
    });

    if (!inbox) {
      throw Object.assign(new Error('Inbox not found'), { status: 404 });
    }

    if (inbox.ownerWallet.toLowerCase() !== callerWallet) {
      throw Object.assign(
        new Error('Only the inbox owner can cancel'),
        { status: 403 },
      );
    }

    if (!inbox.active) {
      throw Object.assign(
        new Error('Inbox is already cancelled or expired'),
        { status: 400 },
      );
    }

    // Calculate pro-rata refund
    const now = new Date();
    const daysRemaining = Math.max(0, (inbox.expiresAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
    const refundAmount = parseFloat((daysRemaining * RATE_PER_DAY).toFixed(4));
    const refundTo = refundAddress?.toLowerCase() ?? callerWallet;

    // Deactivate the inbox
    await prisma.inbox.update({
      where: { username },
      data: { active: false },
    });

    // Send on-chain refund if amount is above minimum
    if (refundAmount >= MIN_REFUND) {
      const refundResult = await sendRefund(refundTo, refundAmount.toString());

      if (refundResult.success) {
        return {
          success: true,
          inbox: `${username}@${DOMAIN}`,
          cancelled: true,
          refund: {
            amount: `${refundAmount}`,
            currency: 'USDC',
            network: 'eip155:8453',
            to: refundTo,
            status: 'completed',
            transactionHash: refundResult.transactionHash,
          },
          daysRemaining: Math.floor(daysRemaining),
        };
      }

      // Refund transfer failed — inbox is already deactivated, log the failure
      console.error('[x402email] Refund transfer failed:', refundResult.error);
      throw Object.assign(
        new Error('Inbox cancelled but refund transfer failed. Contact support.'),
        {
          status: 500,
          inbox: `${username}@${DOMAIN}`,
          cancelled: true,
          refund: {
            amount: `${refundAmount}`,
            currency: 'USDC',
            network: 'eip155:8453',
            to: refundTo,
            status: 'failed',
            error: refundResult.error,
          },
          daysRemaining: Math.floor(daysRemaining),
        },
      );
    }

    // Refund too small to send
    return {
      success: true,
      inbox: `${username}@${DOMAIN}`,
      cancelled: true,
      refund: {
        amount: `${refundAmount}`,
        currency: 'USDC',
        network: 'eip155:8453',
        to: refundTo,
        status: 'waived',
        note: `Refund amount ($${refundAmount}) below minimum ($${MIN_REFUND})`,
      },
      daysRemaining: Math.floor(daysRemaining),
    };
  });
