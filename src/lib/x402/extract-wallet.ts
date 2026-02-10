import { NextRequest } from 'next/server';

/**
 * Extract the payer wallet address from x402 request headers.
 * The x-wallet-address header is set by x402 clients after payment.
 * Falls back to decoding the payment-signature header.
 */
export function extractPayerWallet(request: NextRequest): string | null {
  // x402 clients set this header directly
  const walletHeader = request.headers.get('x-wallet-address') || request.headers.get('x-client-id');
  if (walletHeader) return walletHeader.toLowerCase();

  // Fallback: decode from payment-signature header
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
