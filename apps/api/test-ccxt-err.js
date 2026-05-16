const ccxt = require('ccxt');

async function test() {
  const exchange = new ccxt.binance({
    apiKey: 'invalid_key',
    secret: 'invalid_secret',
    options: { defaultType: 'future', adjustForTimeDifference: true }
  });
  exchange.setSandboxMode(true);
  try {
    await exchange.fetchBalance();
  } catch (e) {
    console.log("Error Name:", e.name);
    console.log("Error Message:", e.message);
  }
}
test();
