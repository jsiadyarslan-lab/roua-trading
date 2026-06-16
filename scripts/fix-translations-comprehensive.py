#!/usr/bin/env python3
"""
Comprehensive translation fixer for Roua (رؤى) trading platform.
Translates all remaining untranslated keys in language files.

Reads en.json as reference, finds keys where the value equals the English value
(meaning they're untranslated), and translates them into each language.
"""

import json
import os
import re
import copy
import sys

# ─── Configuration ───────────────────────────────────────────────────────────

MESSAGES_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                            "apps", "web", "messages")
EN_FILE = os.path.join(MESSAGES_DIR, "en.json")

LANGUAGES = [
    "ar", "bn", "cs", "da", "de", "es", "fa", "fi", "fil", "fr",
    "he", "hi", "hu", "id", "it", "ja", "ko", "ms", "nl", "no",
    "pl", "pt", "ro", "ru", "sv", "th", "tr", "uk", "ur", "vi", "zh"
]

# Brand names that should stay in English
BRANDS = {
    "Roua", "Binance", "CoinGecko", "TwelveData", "Yahoo Finance",
    "Metals.dev", "FCSAPI", "GoldPrice", "Alpaca", "ROUA",
    "Roua AI", "Binance Direct", "Binance Live", "Fetch.ai",
}

# Technical abbreviations that should stay as-is
TECH_ABBREV = {
    "RSI", "EMA", "MACD", "VWAP", "ATR", "ADX", "CCI", "OBV", "SAR",
    "POC", "TRIX", "LSTM", "GRU", "DCA", "DeFi", "P&L", "PnL", "AUM",
    "SMC", "PING", "SIM", "IMB", "ECB", "S/R", "R:R", "TP", "SL",
    "FOREX", "VWAP+RSI", "VWAP + RSI",
}

# Cryptocurrency names that should stay in English
CRYPTOS = {
    "Bitcoin", "Ethereum", "Solana", "Cardano", "BNB", "Dogecoin",
    "Filecoin", "Litecoin", "Shiba Inu", "Algorand", "Aptos", "Sui",
    "Celestia", "Uniswap", "VeChain", "TRON", "Polkadot", "Avalanche",
    "Chainlink", "Polygon", "Toncoin", "Cosmos", "Stellar", "XRP",
    "USDT", "USDC", "Fetch.ai",
}

# All keep-as-is terms
KEEP_AS_IS = BRANDS | TECH_ABBREV | CRYPTOS

# ─── Utility Functions ────────────────────────────────────────────────────────

def flatten(d, prefix=""):
    """Flatten a nested dict into dot-notation keys."""
    result = {}
    for k, v in d.items():
        key = f"{prefix}.{k}" if prefix else k
        if isinstance(v, dict):
            result.update(flatten(v, key))
        else:
            result[key] = v
    return result


def set_nested(d, keys, value):
    """Set a value in a nested dict using a list of keys."""
    for key in keys[:-1]:
        if key not in d or not isinstance(d[key], dict):
            d[key] = {}
        d = d[key]
    d[keys[-1]] = value


def should_keep_as_is(value):
    """Determine if a string should stay in English."""
    if value in KEEP_AS_IS:
        return True
    if len(value) <= 3:
        return True
    # All-caps abbreviations
    if re.match(r"^[A-Z]+$", value):
        return True
    # Technical patterns like "TP: 4x ATR"
    if re.match(r"^[A-Z]+:\s*\d+x\s*[A-Z]+$", value):
        return True
    # Pure uppercase combos like "VWAP + RSI"
    if re.match(r"^[A-Z+\s/&]+$", value) and len(value) < 25:
        return True
    # Min/Max patterns
    if re.match(r"^Min:\s*\d+\s*—\s*Max:\s*\d+$", value):
        return True
    # Company names
    if re.match(r"^[A-Z][\w.]+\s+(Inc\.|Corp\.)$", value):
        return True
    # Phone numbers
    if re.match(r"^\+\d", value):
        return True
    # Rate limits
    if re.match(r"^\d+\s*req/", value):
        return True
    return False


# ─── Comprehensive Translation Dictionary ─────────────────────────────────────
# Format: "English string": {"lang_code": "translation", ...}
# Covers ALL common trading platform UI terms for ALL 31 non-English languages.

TRANSLATIONS = {
