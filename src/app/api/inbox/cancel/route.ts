/**
 * POST /api/inbox/cancel — Cancel an inbox and receive a pro-rata refund.
 * Protection: SIWX only (NOT an x402 route — no payment).
 * Only the inbox owner can cancel.
 *
 * Calculates remaining value based on days left vs original purchase rate ($1/30 days).
 * Optionally accepts a refundAddress; defaults to the caller's wallet.
 *
 * TODO: Implement on-chain USDC transfer from treasury wallet.
 * Currently deactivates the inbox and returns the refund amount owed.
 */
import { NextRequest, NextResponse } from 'next/server';
import { verifySIWxFromRequest } from '@/lib/siwx/verify';
import { CancelInboxRequestSchema } from '@/schemas/inbox';
import { prisma } from '@/lib/db/client';

const DOMAIN = process.env.EMAIL_DOMAIN ?? 'x402email.com';
const RATE_PER_DAY = 1 / 30; // $1 per 30 days

export async function POST(request: NextRequest) {
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: 'Invalid JSON body' },
      { status: 400 },
    );
  }

  const parsed = CancelInboxRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    const msg = parsed.error.issues
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join('; ');
    return NextResponse.json(
      { success: false, error: 'Validation failed', message: msg },
      { status: 400 },
    );
  }

  const { username, refundAddress } = parsed.data;

  // Verify SIWX
  const resourceUri = `${process.env.NEXT_PUBLIC_BASE_URL}/api/inbox/cancel`;
  const result = await verifySIWxFromRequest(request, resourceUri);
  if (result instanceof NextResponse) return result;

  const callerWallet = result.address.toLowerCase();

  const inbox = await prisma.inbox.findUnique({
    where: { username },
  });

  if (!inbox) {
    return NextResponse.json(
      { success: false, error: 'Inbox not found' },
      { status: 404 },
    );
  }

  if (inbox.ownerWallet.toLowerCase() !== callerWallet) {
    return NextResponse.json(
      { success: false, error: 'Only the inbox owner can cancel' },
      { status: 403 },
    );
  }

  if (!inbox.active) {
    return NextResponse.json(
      { success: false, error: 'Inbox is already cancelled or expired' },
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

  return NextResponse.json({
    success: true,
    inbox: `${username}@${DOMAIN}`,
    cancelled: true,
    refund: {
      amount: `${refundAmount}`,
      currency: 'USDC',
      network: 'eip155:8453',
      to: refundTo,
      status: 'pending',
      note: 'Refund will be processed to the specified address',
    },
    daysRemaining: Math.floor(daysRemaining),
  });
}
