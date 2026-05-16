const ccxt = require('ccxt');

async function test() {
  const exchange = new ccxt.binance({
    apiKey: 'test',
    secret: 'test'
  });
  exchange.setSandboxMode(true);
  console.log("URLs:", exchange.urls.api);
}

test();
