"""Audit Agent configuration."""
import os
import sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '.'))
from shared.config_base import BaseConfig


class AuditConfig(BaseConfig):
    AGENT_NAME: str = "audit-agent"
    HEALTH_PORT: int = int(os.environ.get("HEALTH_PORT", "8087"))

    # Check interval
    CHECK_INTERVAL: int = int(os.environ.get("CHECK_INTERVAL", "3600"))  # 1 hour

    # Anomaly thresholds
    # Multiple countries for same user in 24h
    MAX_COUNTRIES_PER_USER: int = int(os.environ.get("MAX_COUNTRIES_PER_USER", "3"))

    # Max orders per user per hour
    MAX_ORDERS_PER_HOUR: int = int(os.environ.get("MAX_ORDERS_PER_HOUR", "50"))

    # Max API key validations per user per hour
    MAX_API_KEY_VALIDATIONS: int = int(os.environ.get("MAX_API_KEY_VALIDATIONS", "20"))

    # Max login attempts from same IP in 1 hour
    MAX_LOGIN_ATTEMPTS_PER_IP: int = int(os.environ.get("MAX_LOGIN_ATTEMPTS_PER_IP", "10"))

    # Max failed orders per user per day
    MAX_FAILED_ORDERS_PER_DAY: int = int(os.environ.get("MAX_FAILED_ORDERS_PER_DAY", "30"))

    # Daily report hour (UTC)
    DAILY_REPORT_HOUR: int = int(os.environ.get("DAILY_REPORT_HOUR", "7"))
