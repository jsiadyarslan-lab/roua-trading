"""
جسر الربط بين وكلاء روعة وموقع الأخبار المالي (rouatradingnews).
يوفر واجهة برمجية موحدة للتواصل مع API الموقع.
"""

import os
import json
import logging
from typing import Any, Dict, List, Optional
from urllib.request import Request, urlopen
from urllib.error import URLError, HTTPError


class NewsBridge:
    """جسر التواصل مع موقع روعة للأخبار المالية."""

    def __init__(
        self,
        news_url: str = "",
        api_key: str = "",
        cron_secret: str = "",
        admin_secret: str = "",
        logger: Optional[logging.Logger] = None,
    ) -> None:
        self.news_url = news_url or os.environ.get("NEWS_SITE_URL", "")
        self.api_key = api_key or os.environ.get("NEWS_API_KEY", "")
        self.cron_secret = cron_secret or os.environ.get("CRON_SECRET", "")
        self.admin_secret = admin_secret or os.environ.get("NEWS_ADMIN_SECRET", "")
        self.logger = logger

        # إزالة الشرطة المائلة الزائدة
        if self.news_url.endswith("/"):
            self.news_url = self.news_url[:-1]

    @property
    def is_configured(self) -> bool:
        """يتحقق مما إذا كان الجسر مضبوطاً بشكل صحيح."""
        return bool(self.news_url)

    def _log(self, level: str, msg: str) -> None:
        """يسجل رسالة في السجل."""
        if self.logger:
            getattr(self.logger, level)(msg)

    def _request(
        self,
        path: str,
        method: str = "GET",
        data: Optional[Dict] = None,
        timeout: int = 30,
        use_cron_auth: bool = False,
    ) -> Optional[Dict]:
        """
        ينفذ طلب HTTP إلى API موقع الأخبار.

        المعاملات:
            path: مسار API (مثل /api/health)
            method: طريقة HTTP
            data: بيانات الطلب (لـ POST/PUT)
            timeout: مهلة الطلب بالثواني
            use_cron_auth: استخدام CRON_SECRET للمصادقة

        يعيد:
            dict مع بيانات الاستجابة أو None عند الفشل
        """
        if not self.news_url:
            self._log("warning", "NEWS_SITE_URL غير مضبوط — تخطي طلب الأخبار")
            return None

        url = f"{self.news_url}{path}"
        headers = {
            "Content-Type": "application/json",
            "Accept": "application/json",
        }

        # المصادقة
        if use_cron_auth and (self.cron_secret or self.admin_secret):
            # استخدام ADMIN_SECRET أولاً لأنه يعمل مع middleware الموقع
            auth_secret = self.admin_secret or self.cron_secret
            headers["Authorization"] = f"Bearer {auth_secret}"
        elif self.api_key and path.startswith("/api/v1/"):
            headers["Authorization"] = f"Bearer {self.api_key}"

        try:
            body = json.dumps(data).encode("utf-8") if data else None
            req = Request(url, data=body, headers=headers, method=method)

            with urlopen(req, timeout=timeout) as resp:
                response_data = json.loads(resp.read().decode("utf-8"))
                return response_data

        except HTTPError as e:
            self._log("error", f"خطأ HTTP من موقع الأخبار {path}: {e.code}")
            try:
                error_body = e.read().decode("utf-8")
                self._log("debug", f"تفاصيل الخطأ: {error_body[:300]}")
            except Exception:
                pass
            return None

        except URLError as e:
            self._log("error", f"خطأ اتصال بموقع الأخبار {path}: {e.reason}")
            return None

        except Exception as e:
            self._log("error", f"خطأ غير متوقع في طلب الأخبار {path}: {e}")
            return None

    # ── فحص الصحة ──

    def get_health(self) -> Optional[Dict]:
        """يجلب حالة صحة موقع الأخبار."""
        return self._request("/api/health")

    # ── الأخبار ──

    def get_news(
        self,
        category: Optional[str] = None,
        sentiment: Optional[str] = None,
        news_type: str = "live",
        limit: int = 20,
        page: int = 1,
        lang: str = "ar",
    ) -> Optional[Dict]:
        """
        يجلب الأخبار من API الموقع.

        المعاملات:
            category: فئة الأخبار (اقتصاد كلي، أسهم، عملات...)
            sentiment: المشاعر (positive, negative, neutral)
            news_type: نوع الأخبار (live, breaking, article)
            limit: عدد النتائج (أقصى 50)
            page: رقم الصفحة
            lang: اللغة (ar, en)

        يعيد:
            dict مع data و meta أو None
        """
        params = f"?type={news_type}&limit={limit}&page={page}&lang={lang}"
        if category:
            params += f"&category={category}"
        if sentiment:
            params += f"&sentiment={sentiment}"

        return self._request(f"/api/v1/news{params}")

    # ── خط أنابيب الأخبار ──

    def trigger_pipeline(
        self,
        max_items: int = 15,
        min_impact: int = 4,
        focus_area: Optional[str] = None,
        dry_run: bool = False,
    ) -> Optional[Dict]:
        """
        يُشغّل خط أنابيب توليد الأخبار على الموقع.

        المعاملات:
            max_items: أقصى عدد أخبار للبحث
            min_impact: أدنى مستوى تأثير للنشر
            focus_area: منطقة التركيز (اختياري)
            dry_run: تشغيل جاف بدون نشر

        يعيد:
            dict مع نتائج خط الأنابيب أو None
        """
        data = {
            "maxItems": max_items,
            "minImpactLevel": min_impact,
            "dryRun": dry_run,
        }
        if focus_area:
            data["focusArea"] = focus_area

        return self._request(
            "/api/news/pipeline",
            method="POST",
            data=data,
            timeout=120,  # خط الأنابيب قد يستغرق وقتاً
            use_cron_auth=True,
        )

    def get_pipeline_stats(self) -> Optional[Dict]:
        """يجلب إحصائيات خط أنابيب الأخبار."""
        return self._request("/api/news/pipeline")

    # ─ـ بيانات السوق ──

    def get_market_sentiment(self) -> Optional[Dict]:
        """
        يجلب بيانات مشاعر السوق من الموقع.
        يشمل: مؤشر الخوف والطمع، المشاعر العربية، المخاطر الجيوسياسية.
        """
        return self._request("/api/markets/sentiment")

    def get_forex_prices(self) -> Optional[Dict]:
        """يجلب أسعار الفوركس من الموقع."""
        return self._request("/api/markets/prices")

    def get_arab_markets(self) -> Optional[Dict]:
        """يجلب بيانات الأسواق العربية من الموقع."""
        return self._request("/api/markets/arab")

    def get_earnings(self) -> Optional[Dict]:
        """يجلب بيانات الأرباح من الموقع."""
        return self._request("/api/markets/earnings")

    def get_economic_calendar(self) -> Optional[Dict]:
        """يجلب التقويم الاقتصادي من الموقع."""
        return self._request("/api/v1/calendar")

    # ── مساعدات التنسيق ──

    @staticmethod
    def format_sentiment_summary(sentiment: Dict) -> str:
        """
        ينسّق بيانات المشاعر في تقرير نصي.

        المعاملات:
            sentiment: dict من get_market_sentiment()

        يعيد:
            نص منسق جاهز للإرسال
        """
        lines = []

        # مؤشر الخوف والطمع
        fg = sentiment.get("fearGreedIndex", {})
        fg_value = fg.get("value", 50)
        fg_label = fg.get("labelAr", fg.get("label", "—"))
        lines.append(f"📊 مؤشر الخوف والطمع: {fg_value} ({fg_label})")

        # المشاعر العربية
        ar = sentiment.get("arabSentimentIndex", {})
        ar_value = ar.get("value", 50)
        ar_label = ar.get("label", "—")
        ar_vote = ar.get("majorityVote", "—")
        lines.append(f"🌍 مؤشر المشاعر العربية: {ar_value} ({ar_label})")
        lines.append(f"   تصويت الأغلبية: {ar_vote}")

        # المخاطر الجيوسياسية
        geo = sentiment.get("geopoliticalRiskIndex", {})
        geo_value = geo.get("value", 35)
        geo_label = geo.get("label", "—")
        lines.append(f"⚔️ المخاطر الجيوسياسية: {geo_value} ({geo_label})")

        # تأثيرات الأصول
        impacts = geo.get("impacts", {})
        if impacts:
            lines.append("📈 تأثيرات الأصول:")
            for key, val in impacts.items():
                trend = "🟢" if val.get("trend") == "up" else "🔴"
                lines.append(f"   {trend} {key}: {val.get('value', '—')}")

        # ملخص AI
        ai_summary = sentiment.get("aiSummary")
        if ai_summary:
            lines.append(f"\n🤖 ملخص الذكاء الاصطناعي:\n{ai_summary}")

        return "\n".join(lines)

    @staticmethod
    def format_news_brief(news_data: Dict, max_items: int = 5) -> str:
        """
        ينسّق الأخبار في ملخص موجز.

        المعاملات:
            news_data: dict من get_news()
            max_items: أقصى عدد أخبار للعرض

        يعيد:
            نص منسق جاهز للإرسال
        """
        items = news_data.get("data", [])
        if not items:
            return "لا توجد أخبار متاحة حالياً"

        lines = [f"📰 آخر الأخبار المالية ({len(items)} خبر):"]

        for i, item in enumerate(items[:max_items], 1):
            title = item.get("title", "—")
            sentiment = item.get("sentiment", "")
            impact = item.get("impactLevel", "")
            source = item.get("sourceName", "")

            # رموز المشاعر والتأثير
            sent_icon = {"positive": "🟢", "negative": "🔴"}.get(sentiment, "⚪")
            impact_icon = {"high": "🔥", "medium": "⚡"}.get(impact, "")

            lines.append(f"\n{i}. {sent_icon} {title}")
            if source:
                lines.append(f"   المصدر: {source}")
            if impact_icon:
                lines.append(f"   التأثير: {impact_icon} {impact}")

        meta = news_data.get("meta", {})
        total = meta.get("total", 0)
        if total > max_items:
            lines.append(f"\n... و{total - max_items} خبر آخر")

        return "\n".join(lines)
