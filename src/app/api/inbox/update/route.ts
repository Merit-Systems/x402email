/**
 * POST /api/inbox/update — Update inbox settings (forwarding address, message retention).
 * Protection: SIWX only (NOT an x402 route — no payment).
 * Only the inbox owner can update.
 */
import { NextRequest, NextResponse } from 'next/server';
import { verifySIWxFromRequest } from '@/lib/siwx/verify';
import { UpdateInboxRequestSchema } from '@/schemas/inbox';
import { prisma } from '@/lib/db/client';

const DOMAIN = process.env.EMAIL_DOMAIN ?? 'x402email.com';

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

  const parsed = UpdateInboxRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    const msg = parsed.error.issues
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join('; ');
    return NextResponse.json(
      { success: false, error: 'Validation failed', message: msg },
      { status: 400 },
    );
  }

  const { username, forwardTo, retainMessages } = parsed.data;

  // Verify SIWX
  const resourceUri = `${process.env.NEXT_PUBLIC_BASE_URL}/api/inbox/update`;
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
      { success: false, error: 'Only the inbox owner can update forwarding' },
      { status: 403 },
    );
  }

  const updateData: { forwardTo?: string | null; retainMessages?: boolean } = {};
  if (forwardTo !== undefined) updateData.forwardTo = forwardTo;
  if (retainMessages !== undefined) updateData.retainMessages = retainMessages;

  const updated = await prisma.inbox.update({
    where: { username },
    data: updateData,
  });

  return NextResponse.json({
    success: true,
    inbox: `${username}@${DOMAIN}`,
    forwardTo: updated.forwardTo,
    retainMessages: updated.retainMessages,
  });
}
