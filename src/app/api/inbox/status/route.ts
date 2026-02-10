/**
 * GET /api/inbox/status — Check inbox status.
 * Protection: SIWX only (NOT an x402 route — no payment).
 * Only the inbox owner can check status.
 */
import { NextRequest, NextResponse } from 'next/server';
import { verifySIWxFromRequest } from '@/lib/siwx/verify';
import { prisma } from '@/lib/db/client';

const DOMAIN = process.env.EMAIL_DOMAIN ?? 'x402email.com';

export async function GET(request: NextRequest) {
  const username = request.nextUrl.searchParams.get('username');
  if (!username) {
    return NextResponse.json(
      { success: false, error: 'Missing username query parameter' },
      { status: 400 },
    );
  }

  // Verify SIWX
  const resourceUri = `${process.env.NEXT_PUBLIC_BASE_URL}/api/inbox/status`;
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
      { success: false, error: 'Not authorized to view this inbox' },
      { status: 403 },
    );
  }

  const now = Date.now();
  const daysRemaining = Math.max(0, Math.ceil((inbox.expiresAt.getTime() - now) / (24 * 60 * 60 * 1000)));
  const daysOwned = Math.floor((now - inbox.createdAt.getTime()) / (24 * 60 * 60 * 1000));

  return NextResponse.json({
    inbox: `${username}@${DOMAIN}`,
    ownerWallet: inbox.ownerWallet,
    forwardTo: inbox.forwardTo,
    expiresAt: inbox.expiresAt.toISOString(),
    daysRemaining,
    daysOwned,
    active: inbox.active && inbox.expiresAt > new Date(),
    pricing: {
      topup: { price: '$1', days: 30, perDay: '$0.033', endpoint: '/api/inbox/topup' },
      quarter: { price: '$2.50', days: 90, perDay: '$0.028', savings: '17%', endpoint: '/api/inbox/topup/quarter' },
      year: { price: '$8', days: 365, perDay: '$0.022', savings: '34%', endpoint: '/api/inbox/topup/year' },
    },
  });
}
