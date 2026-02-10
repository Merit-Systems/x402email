/**
 * Helper to create x402-protected POST route handlers with Bazaar discovery.
 */
import { withX402 } from '@x402/next';
import { declareDiscoveryExtension } from '@x402/extensions/bazaar';
import { type NextRequest, NextResponse } from 'next/server';
import { z, type ZodType } from 'zod';
import { getX402Server } from './server';

interface RouteOptions<TInput extends ZodType, TOutput> {
  description: string;
  inputSchema: TInput;
  outputExample: TOutput;
  outputSchema: Record<string, unknown>;
  accepts: Array<{
    scheme: 'exact';
    network: `${string}:${string}`;
    price: string;
    payTo: string;
  }>;
  extensions?: Record<string, unknown>;
  handler: (body: z.infer<TInput>, request: NextRequest) => Promise<NextResponse>;
}

export function createX402PostRoute<TInput extends ZodType, TOutput>(
  options: RouteOptions<TInput, TOutput>,
) {
  const inputJsonSchema = z.toJSONSchema(options.inputSchema, {
    target: 'draft-2020-12',
  });

  const discoveryConfig = {
    bodyType: 'json' as const,
    inputSchema: inputJsonSchema,
    output: {
      schema: options.outputSchema,
      example: options.outputExample,
    },
  };

  const extensions = {
    ...declareDiscoveryExtension(discoveryConfig as never),
    ...(options.extensions ?? {}),
  };

  const coreHandler = async (request: NextRequest): Promise<NextResponse> => {
    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid JSON body' },
        { status: 400 },
      );
    }

    const parsed = options.inputSchema.safeParse(rawBody);
    if (!parsed.success) {
      const errorMessage = parsed.error.issues
        .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
        .join('; ');
      return NextResponse.json(
        { success: false, error: 'Validation failed', message: errorMessage },
        { status: 400 },
      );
    }

    return options.handler(parsed.data, request);
  };

  const routeConfig = {
    description: options.description,
    extensions,
    accepts: options.accepts,
  };

  return withX402(coreHandler, routeConfig, getX402Server());
}
