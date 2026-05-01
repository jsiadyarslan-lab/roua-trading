"""Content Agent configuration."""
import os
import sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '.'))
from shared.config_base import BaseConfig


class ContentConfig(BaseConfig):
    AGENT_NAME: str = "content-agent"
    HEALTH_PORT: int = int(os.environ.get("HEALTH_PORT", "8084"))

    # Content schedule (3 times daily)
    CONTENT_INTERVAL: int = int(os.environ.get("CONTENT_INTERVAL", "28800"))  # 8 hours
    FIRST_POST_HOUR: int = int(os.environ.get("FIRST_POST_HOUR", "6"))  # 6 AM UTC

    # Market data — use slash notation for pairs (BTC/USDT, ETH/USDT)
    # Crypto pairs auto-route to Binance; stocks to Yahoo/TwelveData
    MARKET_SYMBOLS: list = ["BTC/USDT", "ETH/USDT", "AAPL", "TSLA", "SPY"]

    # Content settings
    CONTENT_LANGUAGE: str = os.environ.get("CONTENT_LANGUAGE", "ar")  # ar or en or both
    MAX_TWEET_LENGTH: int = 280

    # Twitter API (optional)
    TWITTER_API_KEY: str = os.environ.get("TWITTER_API_KEY", "")
    TWITTER_API_SECRET: str = os.environ.get("TWITTER_API_SECRET", "")
    TWITTER_ACCESS_TOKEN: str = os.environ.get("TWITTER_ACCESS_TOKEN", "")
    TWITTER_ACCESS_SECRET: str = os.environ.get("TWITTER_ACCESS_SECRET", "")

    # Content history
    HISTORY_FILE: str = os.environ.get("HISTORY_FILE", "/app/data/content_history.json")

    # ── ربط موقع الأخبار المالي ── (موروث من BaseConfig)
    # NEWS_SITE_URL, NEWS_API_KEY, CRON_SECRET
