-- Fix credentials where testnet flag was stored as false
-- despite the exchange name containing 'test'.
-- These were saved with an older version of the code.

UPDATE "ExchangeCredential"
SET testnet = true
WHERE testnet = false
  AND (
    exchange LIKE '%test%'
    OR exchange LIKE '%sandbox%'
    OR exchange LIKE '%demo%'
  );
