import { NextResponse } from 'next/server';

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://x402email.com';

export async function GET() {
  return NextResponse.json({
    version: 1,
    resources: [
      `${BASE_URL}/api/send`,
      `${BASE_URL}/api/subdomain/buy`,
      `${BASE_URL}/api/subdomain/send`,
    ],
  });
}
