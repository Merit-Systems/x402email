/**
 * Manual SIWX header verification for non-x402 routes (signers, status).
 * These endpoints require wallet identity proof but no payment.
 */
import {
  parseSIWxHeader,
  verifySIWxSignature,
  validateSIWxMessage,
} from '@x402/extensions/sign-in-with-x';
import { NextResponse } from 'next/server';

export interface SIWxVerification {
  address: string;
}

/**
 * Parse and verify the SIGN-IN-WITH-X header from a request.
 * Returns the verified wallet address or a NextResponse error.
 */
export async function verifySIWxFromRequest(
  request: Request,
  resourceUri: string,
): Promise<SIWxVerification | NextResponse> {
  const header = request.headers.get('SIGN-IN-WITH-X');
  if (!header) {
    return NextResponse.json(
      { success: false, error: 'Missing SIGN-IN-WITH-X header' },
      { status: 401 },
    );
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

  return { address: verification.address! };
}
