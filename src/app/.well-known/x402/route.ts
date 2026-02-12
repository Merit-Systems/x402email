import { NextResponse } from 'next/server';

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://x402email.com';

export async function GET() {
  return NextResponse.json({
    version: 1,
    resources: [
      `${BASE_URL}/api/send`,
      `${BASE_URL}/api/subdomain/buy`,
      `${BASE_URL}/api/subdomain/send`,
      `${BASE_URL}/api/inbox/buy`,
      `${BASE_URL}/api/inbox/topup`,
      `${BASE_URL}/api/inbox/topup/quarter`,
      `${BASE_URL}/api/inbox/topup/year`,
      `${BASE_URL}/api/inbox/send`,
      `${BASE_URL}/api/inbox/messages`,
      `${BASE_URL}/api/inbox/messages/read`,
    ],
  });
}
