"""
ناشر المحتوى لوكيل المحتوى.
ينشر المحتوى عبر Telegram و Twitter ويحفظ السجل.
"""

import json
import os
from datetime import datetime, timezone
from typing import Optional


def publish_to_telegram(text: str, alerter, logger) -> bool:
    """
    ينشر المحتوى عبر Telegram باستخدام TelegramAlerter.

    المعاملات:
        text: نص المحتوى للنشر
        alerter: كائن TelegramAlerter
        logger: مسجل ColoredLogger

    يعيد:
        True إذا نجح النشر، False إذا فشل
    """
    if not alerter.is_configured:
        logger.warning("Telegram غير مضبوط — تخطي نشر المحتوى")
        return False

    sent = alerter.send(text, cooldown=0)

    if sent:
        logger.info("تم نشر المحتوى عبر Telegram بنجاح")
    else:
        logger.error("فشل نشر المحتوى عبر Telegram")

    return sent


def publish_to_twitter(text: str, config, logger) -> bool:
    """
    ينشر تغريدة عبر Twitter API v2 (اختياري).

    المعاملات:
        text: نص التغريدة (أقصى طول 280 حرفاً)
        config: كائن ContentConfig
        logger: مسجل ColoredLogger

    يعيد:
        True إذا نجح النشر، False إذا فشل أو لم يكن مضبوطاً
    """
    if not all([
        config.TWITTER_API_KEY,
        config.TWITTER_API_SECRET,
        config.TWITTER_ACCESS_TOKEN,
        config.TWITTER_ACCESS_SECRET,
    ]):
        logger.info("Twitter API غير مضبوط — تخطي نشر التغريدة")
        return False

    try:
        import tweepy

        client = tweepy.Client(
            consumer_key=config.TWITTER_API_KEY,
            consumer_secret=config.TWITTER_API_SECRET,
            access_token=config.TWITTER_ACCESS_TOKEN,
            access_token_secret=config.TWITTER_ACCESS_SECRET,
        )

        # اقتطاع النص إذا تجاوز الحد
        tweet_text = text[:config.MAX_TWEET_LENGTH]

        response = client.create_tweet(text=tweet_text)

        if response.data and response.data.get("id"):
            logger.info(
                f"تم نشر التغريدة بنجاح — المعرف: {response.data['id']}"
            )
            return True
        else:
            logger.error("فشل نشر التغريدة — لم يُعد معرفاً")
            return False

    except ImportError:
        logger.warning("مكتبة tweepy غير مثبتة — تخطي نشر التغريدة")
        return False
    except Exception as e:
        logger.error(f"خطأ في نشر التغريدة: {e}")
        return False


def save_to_history(text: str, history_file: str, logger, content_type: str = "analysis") -> None:
    """
    يحفظ المحتوى المنشور في ملف سجل JSON.

    المعاملات:
        text: نص المحتوى المنشور
        history_file: مسار ملف السجل
        logger: مسجل ColoredLogger
        content_type: نوع المحتوى (analysis أو report أو wrapup)
    """
    try:
        # التأكد من وجود المجلد
        history_dir = os.path.dirname(history_file)
        if history_dir and not os.path.exists(history_dir):
            os.makedirs(history_dir, exist_ok=True)

        # قراءة السجل الحالي
        history: list[dict] = []
        if os.path.exists(history_file):
            try:
                with open(history_file, "r", encoding="utf-8") as f:
                    history = json.load(f)
                    if not isinstance(history, list):
                        history = []
            except (json.JSONDecodeError, IOError):
                history = []

        # إضافة السجل الجديد
        record = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "content": text,
            "type": content_type,
            "length": len(text),
        }
        history.append(record)

        # الاحتفاظ بآخر 500 سجل فقط
        if len(history) > 500:
            history = history[-500:]

        # حفظ الملف
        with open(history_file, "w", encoding="utf-8") as f:
            json.dump(history, f, ensure_ascii=False, indent=2)

        logger.info(f"تم حفظ المحتوى في السجل ({len(history)} سجل)")

    except Exception as e:
        logger.error(f"فشل حفظ المحتوى في السجل: {e}")


def check_duplicate(text: str, history_file: str, logger) -> bool:
    """
    يتحقق مما إذا كان محتوى مشابه نُشر خلال آخر 24 ساعة.

    المعاملات:
        text: نص المحتوى الجديد
        history_file: مسار ملف السجل
        logger: مسجل ColoredLogger

    يعيد:
        True إذا وُجد تكرار، False إذا كان المحتوى جديداً
    """
    try:
        if not os.path.exists(history_file):
            return False

        with open(history_file, "r", encoding="utf-8") as f:
            history = json.load(f)

        if not isinstance(history, list):
            return False

        now = datetime.now(timezone.utc)
        cutoff = now.timestamp() - 86400  # آخر 24 ساعة

        # استخراج كلمات مفتاحية من النص الجديد
        new_keywords = _extract_keywords(text)

        for record in reversed(history):
            ts_str = record.get("timestamp", "")
            try:
                record_time = datetime.fromisoformat(ts_str).timestamp()
            except (ValueError, TypeError):
                continue

            # تجاهل السجلات الأقدم من 24 ساعة
            if record_time < cutoff:
                break

            # مقارنة الكلمات المفتاحية
            old_text = record.get("content", "")
            old_keywords = _extract_keywords(old_text)

            # حساب نسبة التشابه
            overlap = new_keywords & old_keywords
            if len(new_keywords) > 0:
                similarity = len(overlap) / len(new_keywords)
                if similarity > 0.8:
                    logger.warning(
                        f"تم اكتشاف محتوى مكرر (تشابه: {similarity:.0%})"
                    )
                    return True

        return False

    except (json.JSONDecodeError, IOError) as e:
        logger.warning(f"تعذر قراءة سجل المحتوى: {e}")
        return False
    except Exception as e:
        logger.warning(f"خطأ في فحص التكرار: {e}")
        return False


def _extract_keywords(text: str) -> set[str]:
    """
    يستخرج الكلمات المفتاحية من النص للمقارنة.

    المعاملات:
        text: النص المراد تحليله

    يعيد:
        مجموعة الكلمات المفتاحية
    """
    # كلمات شائعة يجب تجاهلها
    stop_words = {
        "في", "من", "على", "إلى", "عن", "مع", "هذا", "هذه", "التي",
        "الذي", "التي", "هو", "هي", "كان", "كانت", "قد", "لا", "لم",
        "لن", "ما", "أن", "إن", "بعد", "قبل", "بين", "حتى", "كل",
        "بعض", "أي", "أو", "ثم", "و", "ف", "ب", "ل", "ك",
        "the", "a", "an", "is", "are", "was", "were", "be", "been",
        "being", "have", "has", "had", "do", "does", "did", "will",
        "would", "could", "should", "may", "might", "can", "shall",
        "to", "of", "in", "for", "on", "with", "at", "by", "from",
        "as", "into", "through", "during", "before", "after", "above",
        "below", "between", "out", "off", "over", "under", "again",
        "further", "then", "once", "and", "but", "or", "nor", "not",
        "so", "yet", "both", "either", "neither", "each", "every",
        "all", "any", "few", "more", "most", "other", "some", "such",
        "no", "only", "own", "same", "than", "too", "very",
    }

    # تقسيم النص وتنظيفه
    words = text.lower().split()
    keywords = set()

    for word in words:
        cleaned = word.strip(".,;:!?()[]{}\"'-")
        if len(cleaned) >= 2 and cleaned not in stop_words:
            keywords.add(cleaned)

    return keywords
