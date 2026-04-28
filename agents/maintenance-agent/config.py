"""إعدادات وكيل الصيانة لمنصة روعة التجارية."""

import os
import sys

# إضافة المسار المشترك لاستيراد الوحدات
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '.'))

from shared.config_base import BaseConfig


class MaintenanceConfig(BaseConfig):
    """إعدادات وكيل الصيانة — النسخ الاحتياطي والتنظيف."""

    AGENT_NAME: str = "maintenance-agent"
    HEALTH_PORT: int = int(os.environ.get("HEALTH_PORT", "8082"))

    # ── إعدادات النسخ الاحتياطي ──
    BACKUP_INTERVAL: int = int(os.environ.get("BACKUP_INTERVAL", "86400"))  # 24 ساعة
    BACKUP_RETENTION_DAILY: int = int(os.environ.get("BACKUP_RETENTION_DAILY", "7"))
    BACKUP_RETENTION_WEEKLY: int = int(os.environ.get("BACKUP_RETENTION_WEEKLY", "4"))
    BACKUP_RETENTION_MONTHLY: int = int(os.environ.get("BACKUP_RETENTION_MONTHLY", "3"))

    # ── إعدادات التنظيف ──
    CLEANUP_INTERVAL: int = int(os.environ.get("CLEANUP_INTERVAL", "21600"))  # 6 ساعات
    SESSION_MAX_AGE_HOURS: int = int(os.environ.get("SESSION_MAX_AGE_HOURS", "168"))  # 7 أيام
    LOG_MAX_AGE_DAYS: int = int(os.environ.get("LOG_MAX_AGE_DAYS", "30"))

    # ── التخزين (متوافق مع S3 أو محلي) ──
    BACKUP_STORAGE_TYPE: str = os.environ.get("BACKUP_STORAGE_TYPE", "local")  # local أو s3
    S3_BUCKET: str = os.environ.get("S3_BUCKET", "")
    S3_ENDPOINT: str = os.environ.get("S3_ENDPOINT", "")
    S3_ACCESS_KEY: str = os.environ.get("S3_ACCESS_KEY", "")
    S3_SECRET_KEY: str = os.environ.get("S3_SECRET_KEY", "")

    # ── التحقق من النسخة الاحتياطية ──
    VERIFY_BACKUP: bool = os.environ.get("VERIFY_BACKUP", "true").lower() == "true"

    # ── مسارات محلية ──
    BACKUP_DIR: str = os.environ.get("BACKUP_DIR", "/app/backups")
    LOG_DIR: str = os.environ.get("LOG_DIR", "/app/logs")
    TEMP_DIR: str = os.environ.get("TEMP_DIR", "/tmp")
