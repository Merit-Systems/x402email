/**
 * GET /api/cron/inbox-reminders — Daily cron to deactivate expired inboxes and send reminders.
 * Protected by CRON_SECRET bearer token (Vercel Cron).
 */
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { sendEmail } from '@/lib/email/ses';
import { buildReminderEmailHtml, buildReminderEmailText } from '@/lib/email/templates';

const DOMAIN = process.env.EMAIL_DOMAIN ?? 'x402email.com';
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://x402email.com';

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 });
  }
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = new Date();
  const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  // Deactivation pass: mark expired inboxes as inactive
  const deactivated = await prisma.inbox.updateMany({
    where: {
      expiresAt: { lt: now },
      active: true,
    },
    data: { active: false },
  });

  // Reminder pass: find active inboxes expiring within 7 days, not reminded in last 24h
  const expiring = await prisma.inbox.findMany({
    where: {
      active: true,
      expiresAt: { gt: now, lt: sevenDaysFromNow },
      OR: [
        { lastReminderAt: null },
        { lastReminderAt: { lt: twentyFourHoursAgo } },
      ],
    },
  });

  let remindersSent = 0;

  for (const inbox of expiring) {
    try {
      const params = {
        username: inbox.username,
        domain: DOMAIN,
        expiresAt: inbox.expiresAt,
        createdAt: inbox.createdAt,
        baseUrl: BASE_URL,
      };

      await sendEmail({
        from: `relay@${DOMAIN}`,
        to: [inbox.forwardTo],
        subject: `Your inbox ${inbox.username}@${DOMAIN} expires soon`,
        html: buildReminderEmailHtml(params),
        text: buildReminderEmailText(params),
      });

      await prisma.inbox.update({
        where: { id: inbox.id },
        data: { lastReminderAt: now },
      });

      remindersSent++;
    } catch (error) {
      console.error(`[x402email] Reminder error for ${inbox.username}:`, error);
    }
  }

  return NextResponse.json({
    success: true,
    deactivated: deactivated.count,
    remindersSent,
    checked: expiring.length,
  });
}
