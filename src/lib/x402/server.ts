/**
 * x402 Resource Server singleton with SIWX extension + hooks.
 */
import { x402ResourceServer, HTTPFacilitatorClient } from '@x402/core/server';
import { registerExactEvmScheme } from '@x402/evm/exact/server';
import { facilitator } from '@coinbase/x402';
import {
  siwxResourceServerExtension,
  createSIWxSettleHook,
} from '@x402/extensions/sign-in-with-x';
import { DatabaseSIWxStorage } from '@/lib/siwx/storage';

let _server: x402ResourceServer | undefined;
let _storage: DatabaseSIWxStorage | undefined;

export function getStorage(): DatabaseSIWxStorage {
  if (!_storage) {
    _storage = new DatabaseSIWxStorage();
  }
  return _storage;
}

export function getX402Server(): x402ResourceServer {
  if (!_server) {
    const storage = getStorage();
    const httpFacilitator = new HTTPFacilitatorClient(facilitator);
    _server = new x402ResourceServer(httpFacilitator);
    registerExactEvmScheme(_server);

    // Register SIWX extension
    _server.registerExtension(siwxResourceServerExtension);

    // Hook: after payment settles, record wallet → resource in SIWxStorage
    // (Used for subdomain purchase tracking)
    _server.onAfterSettle(createSIWxSettleHook({ storage }));
  }
  return _server;
}
