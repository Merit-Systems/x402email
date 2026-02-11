/**
 * GET /api/cron/treasury-sweep — Daily cron to sweep excess funds to treasury.
 * Protected by CRON_SECRET bearer token (Vercel Cron).
 *
 * The operational wallet receives all x402 payments and sends refunds.
 * This cron sweeps profits above a buffer threshold to the treasury multisig.
 */
import { NextRequest, NextResponse } from 'next/server';
import { privateKeyToAccount } from 'viem/accounts';
import { x402Client, x402HTTPClient } from '@x402/core/client';
import { registerExactEvmScheme } from '@x402/evm/exact/client';
import { getUsdcBalance } from '@/lib/x402/balance';

const BUFFER = 10; // Keep $10 in operational wallet for refunds
const SWEEP_THRESHOLD = 20; // Only sweep when above $20
const X402SCAN_SEND_URL = 'https://x402scan.com/api/send';

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 });
  }
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const TREASURY_ADDRESS = process.env.TREASURY_WALLET_ADDRESS ?? '';

  const operationalKey = process.env.OPERATIONAL_WALLET_PRIVATE_KEY;
  if (!operationalKey) {
    return NextResponse.json({
      success: false,
      error: 'Missing OPERATIONAL_WALLET_PRIVATE_KEY',
    }, { status: 500 });
  }

  if (!TREASURY_ADDRESS) {
    return NextResponse.json({
      success: false,
      error: 'Missing TREASURY_WALLET_ADDRESS',
    }, { status: 500 });
  }

  const operationalAccount = privateKeyToAccount(operationalKey as `0x${string}`);
  const operationalAddress = operationalAccount.address;

  try {
    const balance = await getUsdcBalance(operationalAddress);
    console.log(`[treasury-sweep] Operational wallet balance: $${balance.toFixed(4)}`);

    if (balance < SWEEP_THRESHOLD) {
      return NextResponse.json({
        success: true,
        action: 'none',
        balance: balance.toFixed(4),
        message: `Balance $${balance.toFixed(2)} is below sweep threshold $${SWEEP_THRESHOLD}`,
      });
    }

    // Sweep everything above the buffer
    const sweepAmount = (balance - BUFFER).toFixed(2);
    console.log(`[treasury-sweep] Sweeping $${sweepAmount} to treasury ${TREASURY_ADDRESS}...`);

    const client = new x402Client();
    registerExactEvmScheme(client, { signer: operationalAccount });
    const httpClient = new x402HTTPClient(client);

    const url = `${X402SCAN_SEND_URL}?address=${TREASURY_ADDRESS}&amount=${sweepAmount}&chain=base`;

    const initialResponse = await fetch(url, { method: 'POST' });
    if (initialResponse.status !== 402) {
      const text = await initialResponse.text();
      return NextResponse.json({
        success: false,
        error: `Expected 402, got ${initialResponse.status}: ${text}`,
      }, { status: 500 });
    }

    const body = await initialResponse.json();
    const paymentRequired = httpClient.getPaymentRequiredResponse(
      (name) => initialResponse.headers.get(name),
      body,
    );

    const paymentPayload = await httpClient.createPaymentPayload(paymentRequired);
    const retryHeaders = httpClient.encodePaymentSignatureHeader(paymentPayload);

    const paidResponse = await fetch(url, {
      method: 'POST',
      headers: retryHeaders,
    });

    if (!paidResponse.ok) {
      const errorText = await paidResponse.text();
      return NextResponse.json({
        success: false,
        error: `Sweep payment failed (${paidResponse.status}): ${errorText}`,
      }, { status: 500 });
    }

    const settleResponse = httpClient.getPaymentSettleResponse(
      (name) => paidResponse.headers.get(name),
    );

    const newBalance = await getUsdcBalance(operationalAddress);

    return NextResponse.json({
      success: true,
      action: 'swept',
      previousBalance: balance.toFixed(4),
      swept: sweepAmount,
      treasury: TREASURY_ADDRESS,
      newBalance: newBalance.toFixed(4),
      transactionHash: settleResponse?.transaction,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[treasury-sweep] Error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
