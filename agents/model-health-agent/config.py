"""Model Health Agent configuration."""
import os
import sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '.'))
from shared.config_base import BaseConfig


class ModelHealthConfig(BaseConfig):
    AGENT_NAME: str = "model-health-agent"
    HEALTH_PORT: int = int(os.environ.get("HEALTH_PORT", "8086"))

    # Check interval (how often to check API usage)
    CHECK_INTERVAL: int = int(os.environ.get("CHECK_INTERVAL", "900"))  # 15 minutes

    # Budget thresholds (USD) per provider per month
    # Alert at 70%, critical at 90%, block at 100%
    MONTHLY_BUDGET_GROQ: float = float(os.environ.get("MONTHLY_BUDGET_GROQ", "50"))
    MONTHLY_BUDGET_GLM: float = float(os.environ.get("MONTHLY_BUDGET_GLM", "30"))
    MONTHLY_BUDGET_GEMINI: float = float(os.environ.get("MONTHLY_BUDGET_GEMINI", "50"))
    MONTHLY_BUDGET_BEDROCK: float = float(os.environ.get("MONTHLY_BUDGET_BEDROCK", "100"))
    MONTHLY_BUDGET_HF: float = float(os.environ.get("MONTHLY_BUDGET_HF", "20"))
    MONTHLY_BUDGET_OLLAMA: float = float(os.environ.get("MONTHLY_BUDGET_OLLAMA", "0"))  # self-hosted, free
    MONTHLY_BUDGET_OPENAI: float = float(os.environ.get("MONTHLY_BUDGET_OPENAI", "50"))
    MONTHLY_BUDGET_CEREBRAS: float = float(os.environ.get("MONTHLY_BUDGET_CEREBRAS", "0"))  # FREE tier
    MONTHLY_BUDGET_NVIDIA: float = float(os.environ.get("MONTHLY_BUDGET_NVIDIA", "0"))  # FREE tier
    MONTHLY_BUDGET_MISTRAL: float = float(os.environ.get("MONTHLY_BUDGET_MISTRAL", "0"))  # FREE tier
    MONTHLY_BUDGET_DEEPSEEK: float = float(os.environ.get("MONTHLY_BUDGET_DEEPSEEK", "20"))

    # Global monthly budget
    MONTHLY_BUDGET_TOTAL: float = float(os.environ.get("MONTHLY_BUDGET_TOTAL", "300"))

    # Alert thresholds (percentage)
    ALERT_THRESHOLD: float = float(os.environ.get("ALERT_THRESHOLD", "70"))
    CRITICAL_THRESHOLD: float = float(os.environ.get("CRITICAL_THRESHOLD", "90"))

    # Daily report hour (UTC)
    DAILY_REPORT_HOUR: int = int(os.environ.get("DAILY_REPORT_HOUR", "8"))

    # Latency thresholds (ms)
    LATENCY_WARNING_MS: int = int(os.environ.get("LATENCY_WARNING_MS", "5000"))
    LATENCY_CRITICAL_MS: int = int(os.environ.get("LATENCY_CRITICAL_MS", "15000"))

    # Cache hit rate threshold
    CACHE_HIT_MIN_PERCENT: float = float(os.environ.get("CACHE_HIT_MIN_PERCENT", "10"))

    # ── ربط موقع الأخبار المالي ──
    NEWS_SITE_URL: str = os.environ.get("NEWS_SITE_URL", "")  # https://rouatradingnews-production.up.railway.app
    NEWS_API_KEY: str = os.environ.get("NEWS_API_KEY", "")
