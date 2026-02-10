/**
 * GET /api/cron/refund-topup — Daily cron to replenish refund wallet from payee wallet.
 * Protected by CRON_SECRET bearer token (Vercel Cron).
 *
 * Checks the refund wallet USDC balance on Base. If below MIN_BALANCE,
 * transfers TOPUP_AMOUNT from the payee wallet via x402scan's /api/send.
 */
import { NextRequest, NextResponse } from 'next/server';
import { privateKeyToAccount } from 'viem/accounts';
import { x402Client, x402HTTPClient } from '@x402/core/client';
import { registerExactEvmScheme } from '@x402/evm/exact/client';
import { getUsdcBalance } from '@/lib/x402/balance';

const CRON_SECRET = process.env.CRON_SECRET ?? '';
const MIN_BALANCE = 2; // Top up when refund wallet drops below $2
const TOPUP_AMOUNT = 5; // Transfer $5 each time
const X402SCAN_SEND_URL = 'https://x402scan.com/api/send';

export async function GET(request: NextRequest) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const payeeKey = process.env.PAYEE_WALLET_PRIVATE_KEY;
  const refundKey = process.env.REFUND_WALLET_PRIVATE_KEY;

  if (!payeeKey || !refundKey) {
    return NextResponse.json({
      success: false,
      error: 'Missing PAYEE_WALLET_PRIVATE_KEY or REFUND_WALLET_PRIVATE_KEY',
    }, { status: 500 });
  }

  const refundAccount = privateKeyToAccount(refundKey as `0x${string}`);
  const refundAddress = refundAccount.address;

  try {
    // Check current refund wallet balance
    const balance = await getUsdcBalance(refundAddress);
    console.log(`[refund-topup] Refund wallet balance: $${balance.toFixed(4)}`);

    if (balance >= MIN_BALANCE) {
      return NextResponse.json({
        success: true,
        action: 'none',
        balance: balance.toFixed(4),
        message: `Balance $${balance.toFixed(2)} is above minimum $${MIN_BALANCE}`,
      });
    }

    // Balance is low — transfer from payee wallet
    console.log(`[refund-topup] Balance below $${MIN_BALANCE}, transferring $${TOPUP_AMOUNT}...`);

    const payeeAccount = privateKeyToAccount(payeeKey as `0x${string}`);
    const client = new x402Client();
    registerExactEvmScheme(client, { signer: payeeAccount });
    const httpClient = new x402HTTPClient(client);

    const url = `${X402SCAN_SEND_URL}?address=${refundAddress}&amount=${TOPUP_AMOUNT}&chain=base`;

    // Step 1: Get 402 payment requirements
    const initialResponse = await fetch(url, { method: 'POST' });

    if (initialResponse.status !== 402) {
      const text = await initialResponse.text();
      return NextResponse.json({
        success: false,
        error: `Expected 402, got ${initialResponse.status}: ${text}`,
      }, { status: 500 });
    }

    // Step 2: Parse and sign payment
    const body = await initialResponse.json();
    const paymentRequired = httpClient.getPaymentRequiredResponse(
      (name) => initialResponse.headers.get(name),
      body,
    );

    const paymentPayload = await httpClient.createPaymentPayload(paymentRequired);
    const retryHeaders = httpClient.encodePaymentSignatureHeader(paymentPayload);

    // Step 3: Send with payment
    const paidResponse = await fetch(url, {
      method: 'POST',
      headers: retryHeaders,
    });

    if (!paidResponse.ok) {
      const errorText = await paidResponse.text();
      return NextResponse.json({
        success: false,
        error: `Payment failed (${paidResponse.status}): ${errorText}`,
      }, { status: 500 });
    }

    const settleResponse = httpClient.getPaymentSettleResponse(
      (name) => paidResponse.headers.get(name),
    );

    const newBalance = await getUsdcBalance(refundAddress);

    return NextResponse.json({
      success: true,
      action: 'topped_up',
      previousBalance: balance.toFixed(4),
      transferred: TOPUP_AMOUNT,
      newBalance: newBalance.toFixed(4),
      transactionHash: settleResponse?.transaction,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[refund-topup] Error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
