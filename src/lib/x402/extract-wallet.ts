import { NextRequest } from 'next/server';

/**
 * Extract the payer wallet address from the cryptographically-signed
 * payment-signature header. This header is verified by the x402 facilitator
 * before settlement — withX402 ensures only verified payments reach handlers.
 *
 * SECURITY: Do NOT trust client-set headers like x-wallet-address or x-client-id.
 * Those are unverified and can be spoofed by a malicious caller to impersonate
 * another wallet's identity while paying from their own.
 */
export function extractPayerWallet(request: NextRequest): string | null {
  const paymentHeader = request.headers.get('payment-signature') || request.headers.get('x-payment');
  if (!paymentHeader) return null;
  try {
    const decoded = JSON.parse(Buffer.from(paymentHeader, 'base64').toString());
    const from = decoded.payload?.authorization?.from;
    return from?.toLowerCase() ?? decoded.payer?.toLowerCase() ?? null;
  } catch {
    return null;
  }
}
