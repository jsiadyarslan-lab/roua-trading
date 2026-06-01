"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConnectionMode = exports.ExchangeType = void 0;
var ExchangeType;
(function (ExchangeType) {
    ExchangeType["BINANCE"] = "binance";
    ExchangeType["ALPACA"] = "alpaca";
    ExchangeType["PAPER"] = "paper";
})(ExchangeType || (exports.ExchangeType = ExchangeType = {}));
var ConnectionMode;
(function (ConnectionMode) {
    ConnectionMode["WEBSOCKET"] = "WEBSOCKET";
    ConnectionMode["REST_POLLING"] = "REST_POLLING";
})(ConnectionMode || (exports.ConnectionMode = ConnectionMode = {}));
//# sourceMappingURL=execution.types.js.map