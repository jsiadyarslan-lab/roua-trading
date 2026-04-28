"""
وكيل المشاعر لمنصة روعة التجارية.
يجمع الإشارات إلى العلامة التجارية من الويب ويحلل مشاعر الجمهور.
يعمل كخدمة مستمرة على Railway.
"""

import os
import sys
import time
import signal
from datetime import datetime, timezone

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '.'))

from shared.config_base import BaseConfig
from shared.telegram_utils import TelegramAlerter
from shared.logger import ColoredLogger
from shared.health_server import HealthCheckServer

from config import SentimentConfig
from brand_monitor import (
    search_brand_mentions,
    analyze_sentiment,
    save_mention_history,
    format_sentiment_report,
)

# جسر الربط بموقع الأخبار
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'shared'))
try:
    from news_bridge import NewsBridge
except ImportError:
    NewsBridge = None


class SentimentAgent:
    """وكيل المشاعر — يراقب سمعة العلامة التجارية عبر الويب."""

    def __init__(self) -> None:
        self.config = SentimentConfig()
        self.logger = ColoredLogger(
            self.config.AGENT_NAME, self.config.LOG_LEVEL
        )
        self.alerter = TelegramAlerter(
            token=self.config.TELEGRAM_TOKEN,
            chat_id=self.config.TELEGRAM_CHAT_ID,
            cooldown=3600,  # ساعة تبريد
        )
        self.health = HealthCheckServer(
            self.config.AGENT_NAME, self.config.HEALTH_PORT
        )

        self._running = False
        self._total_checks = 0
        self._total_negative_alerts = 0
        self._total_errors = 0
        self._last_report_day = ""
        self._last_sentiment_score = 0.0

        # جسر الربط بموقع الأخبار المالي
        self.news: NewsBridge | None = None
        if NewsBridge and self.config.NEWS_SITE_URL:
            self.news = NewsBridge(
                news_url=self.config.NEWS_SITE_URL,
                api_key=self.config.NEWS_API_KEY,
                logger=self.logger,
            )

    def start(self) -> None:
        """يبدأ تشغيل وكيل المشاعر."""
        self._running = True

        self.logger.banner([
            "💬 وكيل المشاعر — روعة التجارية",
            "",
            f"  المنصة: {self.config.PLATFORM_URL}",
            f"  فترة الفحص: {self.config.CHECK_INTERVAL} ثانية",
            f"  عبارات البحث: {', '.join(self.config.SEARCH_QUERIES)}",
            f"  تحليل AI: {'✅ GLM' if self.config.GLM_API_KEY else '⚠️ كلمات مفتاحية فقط'}",
            f"  عتبة السلبية: {self.config.NEGATIVE_THRESHOLD}",
            f"  تقرير يومي: الساعة {self.config.DAILY_REPORT_HOUR}:00 UTC",
            f"  Telegram: {'✅' if self.alerter.is_configured else '❌'}",
            f"  موقع الأخبار: {'✅ مربوط' if self.news and self.news.is_configured else '⚠️ غير مربوط'}",
            "",
            "  بدء مراقبة المشاعر...",
        ])

        self.health.start()
        signal.signal(signal.SIGINT, self._handle_signal)
        signal.signal(signal.SIGTERM, self._handle_signal)

        # فحص أولي
        self._run_sentiment_check()

        self._main_loop()

    def _main_loop(self) -> None:
        """حلقة المراقبة الدورية."""
        while self._running:
            try:
                self._check_daily_report()
                self._run_sentiment_check()

                self._sleep(self.config.CHECK_INTERVAL)

            except Exception as e:
                self._total_errors += 1
                self.logger.error(f"خطأ في حلقة المراقبة: {e}")
                self._update_health(healthy=False)
                self._sleep(300)

    def _run_sentiment_check(self) -> None:
        """ينفذ فحص المشاعر."""
        self.logger.info("بدء فحص المشاعر...")

        # البحث عن إشارات
        mentions = search_brand_mentions(
            self.config.SEARCH_QUERIES, self.logger
        )

        # تحليل المشاعر
        sentiment = analyze_sentiment(
            mentions,
            self.config.GLM_API_KEY,
            self.config.GLM_API_URL,
            self.config.GLM_MODEL,
            self.logger,
        )

        score = sentiment.get("score", 0)
        label = sentiment.get("label", "neutral")

        # ── جلب بيانات مشاعر السوق من موقع الأخبار ──
        market_sentiment_str = ""
        if self.news and self.news.is_configured:
            try:
                market_data = self.news.get_market_sentiment()
                if market_data:
                    market_sentiment_str = NewsBridge.format_sentiment_summary(market_data)
                    self.logger.info("تم جلب بيانات مشاعر السوق من موقع الأخبار")

                    # دمج مؤشر الخوف والطمع في النتيجة
                    fg = market_data.get("fearGreedIndex", {})
                    fg_value = fg.get("value", 50)
                    sentiment["fear_greed_index"] = fg_value
                    sentiment["market_sentiment_source"] = "rouatradingnews"

            except Exception as e:
                self.logger.error(f"خطأ في جلب مشاعر السوق من الموقع: {e}")

        self._total_checks += 1
        self._last_sentiment_score = score

        self.logger.info(
            f"اكتمل الفحص — {len(mentions)} إشارة | "
            f"مشاعر: {label} ({score:+.2f})"
            + (f" | خوف/طمع: {sentiment.get('fear_greed_index', '—')}" if market_sentiment_str else "")
        )

        # حفظ في السجل
        save_mention_history(
            mentions, sentiment, self.config.HISTORY_FILE, self.logger
        )

        # تنبيه عند مشاعر سلبية
        if score < self.config.NEGATIVE_THRESHOLD:
            self._total_negative_alerts += 1
            self._send_negative_alert(sentiment, mentions)

        self._update_health(healthy=True)

    def _check_daily_report(self) -> None:
        """يتحقق مما إذا حان وقت التقرير اليومي."""
        now = datetime.now(timezone.utc)
        today = now.strftime("%Y-%m-%d")

        if now.hour != self.config.DAILY_REPORT_HOUR:
            return

        if today == self._last_report_day:
            return

        self._last_report_day = today
        self._send_daily_report()

    def _send_daily_report(self) -> None:
        """يرسل التقرير اليومي عبر Telegram."""
        if not self.alerter.is_configured:
            return

        self.logger.info("إعداد تقرير المشاعر اليومي...")

        mentions = search_brand_mentions(
            self.config.SEARCH_QUERIES, self.logger
        )

        sentiment = analyze_sentiment(
            mentions,
            self.config.GLM_API_KEY,
            self.config.GLM_API_URL,
            self.config.GLM_MODEL,
            self.logger,
        )

        report = format_sentiment_report(mentions, sentiment, self.logger)

        # إضافة بيانات مشاعر السوق من موقع الأخبار
        if market_sentiment_str:
            report += f"\n\n── مشاعر السوق (موقع رؤى) ──\n{market_sentiment_str}"

        # إضافة آخر الأخبار المالية
        if self.news and self.news.is_configured:
            try:
                news_data = self.news.get_news(limit=5, lang="ar")
                if news_data and news_data.get("data"):
                    news_brief = NewsBridge.format_news_brief(news_data, max_items=5)
                    report += f"\n\n── آخر الأخبار المالية ──\n{news_brief}"
            except Exception:
                pass

        self.alerter.send(report, cooldown=0)

        save_mention_history(
            mentions, sentiment, self.config.HISTORY_FILE, self.logger
        )

        self.logger.info("تم إرسال تقرير المشاعر اليومي")

    def _send_negative_alert(self, sentiment: dict, mentions: list[dict]) -> None:
        """يرسل تنبيه عند مشاعر سلبية."""
        if not self.alerter.is_configured:
            return

        negative_mentions = [m for m in mentions if sentiment.get("label") == "negative"]

        msg = self.alerter.format_alert(
            agent_name="💬 وكيل المشاعر",
            title="مشاعر سلبية تجاه العلامة التجارية",
            details=[
                f"مؤشر المشاعر: {sentiment.get('score', 0):+.2f}",
                f"التصنيف: {sentiment.get('label', 'unknown')}",
                sentiment.get("summary", ""),
                "",
                "يجب التفاعل مع أي انتقادات مبكراً",
            ],
            severity="⚠️",
        )
        self.alerter.send(msg, cooldown=0)

    def _update_health(self, healthy: bool = True) -> None:
        self.health.update(
            healthy=healthy,
            total_checks=self._total_checks,
            total_errors=self._total_errors,
            last_check=datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
        )

    def _sleep(self, seconds: int) -> None:
        for _ in range(seconds):
            if not self._running:
                break
            time.sleep(1)

    def _handle_signal(self, signum: int, frame) -> None:
        self.logger.info(f"تم استلام إشارة {signal.Signals(signum).name} — إيقاف آمن...")
        self._running = False

    def stop(self) -> None:
        self._running = False
        self.health.stop()
        self.logger.info("تم إيقاف وكيل المشاعر")


def main() -> None:
    agent = SentimentAgent()
    try:
        agent.start()
    except KeyboardInterrupt:
        agent._handle_signal(signal.SIGINT, None)
    except Exception as e:
        agent.logger.critical(f"خطأ قاتل: {e}")
        agent._update_health(healthy=False)
        agent.stop()
        sys.exit(1)
    agent.stop()


if __name__ == "__main__":
    main()
