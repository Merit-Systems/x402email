/**
 * Manual SIWX header verification for non-x402 routes (signers, status, cancel, update).
 * These endpoints require wallet identity proof but no payment.
 *
 * When the SIGN-IN-WITH-X header is missing, returns a 402 with PAYMENT-REQUIRED
 * header containing SIWX extension info. This allows x402 clients (like the MCP)
 * to discover the SIWX challenge, sign it, and retry — same flow as x402 routes.
 */
import { randomBytes } from 'crypto';
import {
  parseSIWxHeader,
  verifySIWxSignature,
  validateSIWxMessage,
  buildSIWxSchema,
} from '@x402/extensions/sign-in-with-x';
import { encodePaymentRequiredHeader } from '@x402/core/http';
import { NextResponse } from 'next/server';
import { DatabaseSIWxStorage } from './storage';

const NETWORK = 'eip155:8453' as const;
const siwxStorage = new DatabaseSIWxStorage();

export interface SIWxVerification {
  address: string;
}

/**
 * Build a 402 response with SIWX challenge in PAYMENT-REQUIRED header.
 * This mimics what withX402 does for paid routes, but with $0 payment
 * so the MCP's wrapFetchWithSIWx can discover and complete SIWX auth.
 */
function buildSIWxChallengeResponse(resourceUri: string): NextResponse {
  const url = new URL(resourceUri);
  const nonce = randomBytes(16).toString('hex');
  const issuedAt = new Date().toISOString();
  const expirationTime = new Date(Date.now() + 300_000).toISOString(); // 5 min

  const paymentRequired = {
    x402Version: 2,
    error: 'SIWX authentication required',
    resource: {
      url: resourceUri,
      description: 'SIWX-protected endpoint (free, no payment)',
      mimeType: 'application/json',
    },
    accepts: [
      {
        scheme: 'exact' as const,
        network: NETWORK,
        asset: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
        amount: '0',
        payTo: '0x0000000000000000000000000000000000000000',
        maxTimeoutSeconds: 300,
        extra: {},
      },
    ],
    extensions: {
      'sign-in-with-x': {
        info: {
          domain: url.hostname,
          uri: resourceUri,
          version: '1',
          nonce,
          issuedAt,
          expirationTime,
          statement: 'Sign in to verify your wallet identity',
          resources: [resourceUri],
        },
        supportedChains: [
          { chainId: NETWORK, type: 'eip191' },
        ],
        schema: buildSIWxSchema(),
      },
    },
  };

  const encoded = encodePaymentRequiredHeader(paymentRequired);

  return new NextResponse(JSON.stringify(paymentRequired), {
    status: 402,
    headers: {
      'Content-Type': 'application/json',
      'PAYMENT-REQUIRED': encoded,
    },
  });
}

/**
 * Parse and verify the SIGN-IN-WITH-X header from a request.
 * Returns the verified wallet address or a response (402 challenge or 401 error).
 */
export async function verifySIWxFromRequest(
  request: Request,
  resourceUri: string,
): Promise<SIWxVerification | NextResponse> {
  const header = request.headers.get('SIGN-IN-WITH-X');
  if (!header) {
    // Return 402 with SIWX challenge so clients can discover and complete auth
    return buildSIWxChallengeResponse(resourceUri);
  }

  let payload;
  try {
    payload = parseSIWxHeader(header);
  } catch {
    return NextResponse.json(
      { success: false, error: 'Invalid SIGN-IN-WITH-X header' },
      { status: 401 },
    );
  }

  // Validate message fields (expiration, domain, resource URI)
  const messageValidation = await validateSIWxMessage(payload, resourceUri);
  if (!messageValidation.valid) {
    return NextResponse.json(
      { success: false, error: `SIWX validation failed: ${messageValidation.error}` },
      { status: 401 },
    );
  }

  // Verify the cryptographic signature
  const verification = await verifySIWxSignature(payload);
  if (!verification.valid) {
    return NextResponse.json(
      { success: false, error: 'SIWX signature verification failed' },
      { status: 401 },
    );
  }

  // Prevent nonce replay — reject if this nonce was already used
  const nonce = payload.nonce;
  if (nonce) {
    if (await siwxStorage.hasUsedNonce(nonce)) {
      return NextResponse.json(
        { success: false, error: 'SIWX nonce already used' },
        { status: 401 },
      );
    }
    await siwxStorage.recordNonce(nonce);
  }

  return { address: verification.address! };
}
