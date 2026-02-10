/**
 * Send USDC refunds via x402scan's /api/send endpoint.
 *
 * The x402 payment itself IS the transfer — the amount "paid" via x402
 * gets sent directly to the address specified in the query params.
 */
import { privateKeyToAccount } from 'viem/accounts';
import { x402Client, x402HTTPClient } from '@x402/core/client';
import { registerExactEvmScheme } from '@x402/evm/exact/client';

const X402SCAN_SEND_URL = 'https://x402scan.com/api/send';

interface RefundResult {
  success: boolean;
  transactionHash?: string;
  error?: string;
}

function getRefundClient(): x402HTTPClient {
  const privateKey = process.env.REFUND_WALLET_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error('REFUND_WALLET_PRIVATE_KEY not configured');
  }

  const account = privateKeyToAccount(privateKey as `0x${string}`);
  const client = new x402Client();
  registerExactEvmScheme(client, { signer: account });
  return new x402HTTPClient(client);
}

/**
 * Send USDC to an address via x402scan's /api/send endpoint.
 * The x402 payment amount equals the refund amount and goes directly to the recipient.
 */
export async function sendRefund(
  toAddress: string,
  amount: string,
): Promise<RefundResult> {
  const url = `${X402SCAN_SEND_URL}?address=${encodeURIComponent(toAddress)}&amount=${encodeURIComponent(amount)}&chain=base`;

  try {
    const httpClient = getRefundClient();

    // Step 1: Hit the endpoint to get 402 payment requirements
    const initialResponse = await fetch(url, { method: 'POST' });

    if (initialResponse.status !== 402) {
      return {
        success: false,
        error: `Expected 402, got ${initialResponse.status}: ${await initialResponse.text()}`,
      };
    }

    // Step 2: Parse payment requirements from 402 response
    const body = await initialResponse.json();
    const paymentRequired = httpClient.getPaymentRequiredResponse(
      (name) => initialResponse.headers.get(name),
      body,
    );

    // Step 3: Create payment payload (signs EIP-3009 authorization)
    const paymentPayload = await httpClient.createPaymentPayload(paymentRequired);
    const retryHeaders = httpClient.encodePaymentSignatureHeader(paymentPayload);

    // Step 4: Retry with payment header
    const paidResponse = await fetch(url, {
      method: 'POST',
      headers: retryHeaders,
    });

    if (!paidResponse.ok) {
      const errorText = await paidResponse.text();
      return {
        success: false,
        error: `Payment failed (${paidResponse.status}): ${errorText}`,
      };
    }

    // Step 5: Extract transaction hash from settle response header
    const settleResponse = httpClient.getPaymentSettleResponse(
      (name) => paidResponse.headers.get(name),
    );

    return {
      success: true,
      transactionHash: settleResponse?.transaction ?? undefined,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown refund error';
    console.error('[x402email] Refund error:', message);
    return { success: false, error: message };
  }
}
