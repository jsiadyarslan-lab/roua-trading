"use strict";
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Roua Trading (رؤى) — Shared Types & DTOs
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Object.defineProperty(exports, "__esModule", { value: true });
exports.Tier = exports.AssetType = void 0;
// ── Asset Types ──
var AssetType;
(function (AssetType) {
    AssetType["STOCK"] = "STOCK";
    AssetType["FOREX"] = "FOREX";
    AssetType["CRYPTO"] = "CRYPTO";
    AssetType["COMMODITY"] = "COMMODITY";
    AssetType["INDEX"] = "INDEX";
})(AssetType || (exports.AssetType = AssetType = {}));
// ── User Tier ──
var Tier;
(function (Tier) {
    Tier["FREE"] = "FREE";
    Tier["PRO"] = "PRO";
    Tier["PLUS"] = "PLUS";
    Tier["PREMIUM"] = "PREMIUM";
    Tier["INSTITUTIONAL"] = "INSTITUTIONAL";
})(Tier || (exports.Tier = Tier = {}));
