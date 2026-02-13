/**
 * POST /api/subdomain/inbox/list — List inboxes on a subdomain.
 * Protection: SIWX only (free). Only the subdomain owner can list.
 */
import { NextRequest, NextResponse } from 'next/server';
import { verifySIWxFromRequest } from '@/lib/siwx/verify';
import { ListSubdomainInboxesRequestSchema } from '@/schemas/subdomain';
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

  const parsed = ListSubdomainInboxesRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    const msg = parsed.error.issues
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join('; ');
    return NextResponse.json(
      { success: false, error: 'Validation failed', message: msg },
      { status: 400 },
    );
  }

  const { subdomain: subdomainName } = parsed.data;

  // Verify SIWX
  const resourceUri = `${process.env.NEXT_PUBLIC_BASE_URL}/api/subdomain/inbox/list`;
  const result = await verifySIWxFromRequest(request, resourceUri);
  if (result instanceof NextResponse) return result;

  const callerWallet = result.address.toLowerCase();

  const subdomain = await prisma.subdomain.findUnique({
    where: { name: subdomainName },
  });

  if (!subdomain) {
    return NextResponse.json(
      { success: false, error: 'Subdomain not found' },
      { status: 404 },
    );
  }

  if (subdomain.ownerWallet.toLowerCase() !== callerWallet) {
    return NextResponse.json(
      { success: false, error: 'Only the subdomain owner can list inboxes' },
      { status: 403 },
    );
  }

  const inboxes = await prisma.subdomainInbox.findMany({
    where: { subdomainId: subdomain.id },
    include: {
      _count: { select: { messages: true } },
    },
    orderBy: { createdAt: 'asc' },
  });

  // Count unread per inbox
  const unreadCounts = await prisma.subdomainMessage.groupBy({
    by: ['inboxId'],
    where: {
      inboxId: { in: inboxes.map((i) => i.id) },
      read: false,
    },
    _count: true,
  });
  const unreadMap = new Map(unreadCounts.map((u) => [u.inboxId, u._count]));

  return NextResponse.json({
    success: true,
    subdomain: `${subdomainName}.${DOMAIN}`,
    catchAllForwardTo: subdomain.catchAllForwardTo,
    inboxes: inboxes.map((i) => ({
      localPart: i.localPart,
      address: `${i.localPart}@${subdomainName}.${DOMAIN}`,
      forwardTo: i.forwardTo,
      retainMessages: i.retainMessages,
      active: i.active,
      messageCount: i._count.messages,
      unreadCount: unreadMap.get(i.id) ?? 0,
      createdAt: i.createdAt.toISOString(),
    })),
  });
}
