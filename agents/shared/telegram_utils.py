"""
أدوات Telegram موحدة لجميع وكلاء Roua Trading.
يتضمن نظام تبريد لمنع إرسال نفس التنبيه مراراً.
"""

import time
import requests
from datetime import datetime, timezone
from typing import Optional


class TelegramAlerter:
    """
    مرسل تنبيهات Telegram مع نظام تبريد مدمج.
    كل وكيل ينشئ نسخة خاصة منه.
    """

    def __init__(self, token: str, chat_id: str, cooldown: int = 1800):
        self._token = token
        self._chat_id = chat_id
        self._cooldown = cooldown
        self._alert_timestamps: dict[str, float] = {}
        self._total_sent: int = 0

    @property
    def is_configured(self) -> bool:
        """هل إعدادات Telegram صحيحة؟"""
        return bool(self._token and self._chat_id)

    def _should_send(self, key: str) -> bool:
        """يتحقق مما إذا كان يجب إرسال التنبيه (لم يُرسل خلال فترة التبريد)."""
        now = time.time()
        last = self._alert_timestamps.get(key, 0)
        if now - last >= self._cooldown:
            self._alert_timestamps[key] = now
            return True
        return False

    def send(
        self,
        message: str,
        cooldown: Optional[int] = None,
        parse_mode: str = "HTML",
    ) -> bool:
        """
        يرسل رسالة تنبيه عبر Telegram.

        المعاملات:
            message: نص الرسالة
            cooldown: فترة التبريد بالثواني (None = استخدام الافتراضي)
            parse_mode: وضع التحليل (HTML أو Markdown)

        يعيد:
            True إذا نجح الإرسال، False إذا فشل أو كان مكرراً
        """
        if not self.is_configured:
            print("⚠️ Telegram غير مضبوط — تخطي الإرسال")
            return False

        effective_cooldown = cooldown if cooldown is not None else self._cooldown
        alert_key = f"tg:{hash(message) % 10000}"

        if not self._should_send(alert_key) and effective_cooldown > 0:
            print(f"⏳ تنبيه مكرر — تخطي (تبريد: {effective_cooldown}ث)")
            return False

        url = f"https://api.telegram.org/bot{self._token}/sendMessage"
        payload = {
            "chat_id": self._chat_id,
            "text": message,
            "parse_mode": parse_mode,
            "disable_web_page_preview": True,
        }

        try:
            resp = requests.post(url, json=payload, timeout=10)
            if resp.status_code == 200:
                self._total_sent += 1
                print("📲 تم إرسال تنبيه Telegram بنجاح")
                return True
            else:
                print(f"❌ فشل إرسال Telegram: HTTP {resp.status_code}")
                return False
        except Exception as e:
            print(f"❌ فشل إرسال Telegram: {e}")
            return False

    def format_alert(
        self,
        agent_name: str,
        title: str,
        details: list[str],
        analysis: str = "",
        severity: str = "🚨",
    ) -> str:
        """
        ينسّق رسالة تنبيه احترافية لـ Telegram.

        المعاملات:
            agent_name: اسم الوكيل المرسل
            title: عنوان التنبيه
            details: قائمة التفاصيل
            analysis: تحليل إضافي (اختياري)
            severity: رمز الخطورة (🚨 حرج، ⚠️ تحذير، ℹ️ معلومة)
        """
        now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
        details_text = "\n".join(f"  • {d}" for d in details)

        parts = [
            f"{severity} <b>{agent_name}</b>",
            "",
            f"<b>{title}</b>",
            "",
            details_text,
        ]

        if analysis:
            parts.extend([
                "",
                f"<b>تحليل:</b>",
                analysis,
            ])

        parts.extend(["", f"🕐 {now}"])
        return "\n".join(parts)

    def format_summary(
        self,
        agent_name: str,
        stats: dict[str, str | int | float],
        sections: Optional[list[tuple[str, list[str]]]] = None,
    ) -> str:
        """
        ينسّق ملخصاً دورياً لـ Telegram.

        المعاملات:
            agent_name: اسم الوكيل
            stats: إحصائيات رئيسية (مفتاح → قيمة)
            sections: أقسام إضافية (عنوان → قائمة أسطر)
        """
        now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")

        stats_text = "\n".join(
            f"  • {k}: <b>{v}</b>" for k, v in stats.items()
        )

        parts = [
            f"📋 <b>{agent_name} — ملخص دوري</b>",
            "",
            f"📊 <b>الإحصائيات:</b>",
            stats_text,
        ]

        if sections:
            for section_title, section_lines in sections:
                parts.extend([
                    "",
                    f"<b>{section_title}:</b>",
                ])
                parts.extend(f"  {line}" for line in section_lines)

        parts.extend(["", f"🕐 {now}"])
        return "\n".join(parts)
