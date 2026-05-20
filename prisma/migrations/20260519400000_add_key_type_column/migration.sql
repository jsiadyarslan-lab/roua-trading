-- V170: Add keyType column to ExchangeCredential for Ed25519/RSA key support
-- This field stores whether the API key uses HMAC (default), Ed25519, or RSA signing.
-- Ed25519/RSA keys don't require IP whitelisting in Binance, which is a major UX improvement.
ALTER TABLE "ExchangeCredential" ADD COLUMN "keyType" TEXT NOT NULL DEFAULT 'hmac';
