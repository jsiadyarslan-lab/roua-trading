"""Affiliate Agent configuration."""
import os
import sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '.'))
from shared.config_base import BaseConfig


class AffiliateConfig(BaseConfig):
    AGENT_NAME: str = "affiliate-agent"
    HEALTH_PORT: int = int(os.environ.get("HEALTH_PORT", "8089"))

    # Check interval (how often to check referral performance)
    CHECK_INTERVAL: int = int(os.environ.get("CHECK_INTERVAL", "3600"))  # 1 hour

    # Binance affiliate tracking
    BINANCE_REFERRAL_ID: str = os.environ.get("BINANCE_REFERRAL_ID", "")
    BINANCE_API_KEY: str = os.environ.get("BINANCE_API_KEY", "")
    BINANCE_API_SECRET: str = os.environ.get("BINANCE_API_SECRET", "")

    # Alpaca referral tracking
    ALPACA_REFERRAL_CODE: str = os.environ.get("ALPACA_REFERRAL_CODE", "")

    # Commission rates (for estimation)
    BINANCE_SPOT_COMMISSION_RATE: float = float(os.environ.get("BINANCE_SPOT_COMMISSION_RATE", "0.001"))  # 0.1%
    BINANCE_FUTURES_COMMISSION_RATE: float = float(os.environ.get("BINANCE_FUTURES_COMMISSION_RATE", "0.0005"))  # 0.05%
    ALPACA_REFERRAL_BONUS: float = float(os.environ.get("ALPACA_REFERRAL_BONUS", "5.0"))  # $5 per referral

    # Monthly targets
    MONTHLY_TARGET_REFERRALS: int = int(os.environ.get("MONTHLY_TARGET_REFERRALS", "10"))
    MONTHLY_TARGET_REVENUE: float = float(os.environ.get("MONTHLY_TARGET_REVENUE", "100"))  # USD

    # Daily report hour (UTC)
    DAILY_REPORT_HOUR: int = int(os.environ.get("DAILY_REPORT_HOUR", "10"))

    # History file
    HISTORY_FILE: str = os.environ.get("HISTORY_FILE", "/tmp/affiliate_history.json")

    # Referral link templates
    BINANCE_REFERRAL_URL: str = os.environ.get(
        "BINANCE_REFERRAL_URL",
        "https://www.binance.com/en/register?ref={referral_id}"
    )
    ALPACA_REFERRAL_URL: str = os.environ.get(
        "ALPACA_REFERRAL_URL",
        "https://app.alpaca.markets/signup?referral_code={referral_code}"
    )
