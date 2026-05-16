const ccxt = require('ccxt');

async function test() {
  const exchange = new ccxt.binance({
    apiKey: 'invalid_key',
    secret: 'invalid_secret'
  });
  exchange.setSandboxMode(true);
  try {
    console.log("Fetching balance...");
    await exchange.fetchBalance();
  } catch (e) {
    console.log("Error:", e.message);
  }
}

test();
