"""Sentiment Agent configuration."""
import os
import sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '.'))
from shared.config_base import BaseConfig


class SentimentConfig(BaseConfig):
    AGENT_NAME: str = "sentiment-agent"
    HEALTH_PORT: int = int(os.environ.get("HEALTH_PORT", "8088"))

    # Search interval (how often to check brand mentions)
    CHECK_INTERVAL: int = int(os.environ.get("CHECK_INTERVAL", "7200"))  # 2 hours

    # Search queries
    SEARCH_QUERIES: list = [
        "Roua Trading",
        "روعة للتداول",
        "roua-trading",
        "RouaTrading",
    ]

    # GLM API for sentiment analysis
    GLM_API_KEY: str = os.environ.get("GLM_API_KEY", "")
    GLM_API_URL: str = os.environ.get(
        "GLM_API_URL",
        "https://open.bigmodel.cn/api/paas/v4/chat/completions"
    )
    GLM_MODEL: str = os.environ.get("GLM_MODEL", "glm-4-flash")

    # Sentiment thresholds
    NEGATIVE_THRESHOLD: float = float(os.environ.get("NEGATIVE_THRESHOLD", "-0.3"))
    POSITIVE_THRESHOLD: float = float(os.environ.get("POSITIVE_THRESHOLD", "0.3"))

    # Daily report hour (UTC)
    DAILY_REPORT_HOUR: int = int(os.environ.get("DAILY_REPORT_HOUR", "9"))

    # History file for tracking mentions over time
    HISTORY_FILE: str = os.environ.get("HISTORY_FILE", "/app/data/sentiment_history.json")

    # ── ربط موقع الأخبار المالي ── (موروث من BaseConfig)
    # NEWS_SITE_URL, NEWS_API_KEY, CRON_SECRET
