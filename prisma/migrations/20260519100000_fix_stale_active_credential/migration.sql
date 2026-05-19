-- CRITICAL FIX: Clean up stale activeCredentialId settings.
-- When a user deletes a credential and adds a new one,
-- the old activeCredentialId in Setting still points to the deleted credential.
-- This caused SmartExecutor to fall through to paper trading mode,
-- making ALL users see the same paper balance.

DELETE FROM "Setting"
WHERE key LIKE 'user:%:activeCredentialId'
  AND value NOT IN (SELECT id FROM "ExchangeCredential");
