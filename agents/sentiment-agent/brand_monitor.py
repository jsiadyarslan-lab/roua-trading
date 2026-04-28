"""
مراقب المشاعر لوكيل المشاعر.
يجلب الإشارات إلى العلامة التجارية من الويب ويحلل مشاعرها.
"""

import json
import os
import requests
from datetime import datetime, timezone
from typing import Optional


def search_brand_mentions(
    queries: list[str],
    logger,
) -> list[dict]:
    """
    يبحث عن إشارات للعلامة التجارية عبر الويب.

    المعاملات:
        queries: قائمة بعبارات البحث
        logger: مسجل الأحداث

    يعيد:
        قائمة بالإشارات: [{title, snippet, url, source, query}]
    """
    all_mentions = []

    for query in queries:
        try:
            # استخدام z-ai-web-dev-sdk عبر واجهة HTTP الداخلية
            # أو البحث المباشر عبر DuckDuckGo/Bing API البديل
            mentions = _search_web(query, logger)
            all_mentions.extend(mentions)

        except Exception as e:
            logger.error(f"خطأ في البحث عن '{query}': {e}")

    # إزالة التكرارات بناءً على الرابط
    seen_urls = set()
    unique_mentions = []
    for m in all_mentions:
        url = m.get("url", "")
        if url and url not in seen_urls:
            seen_urls.add(url)
            unique_mentions.append(m)

    return unique_mentions


def _search_web(query: str, logger) -> list[dict]:
    """
    يبحث في الويب باستخدام DuckDuckGo HTML API (مجاني، بدون مفتاح).
    """
    mentions = []

    try:
        # DuckDuckGo HTML search — no API key needed
        url = "https://html.duckduckgo.com/html/"
        params = {"q": f'"{query}"', "kl": "wt-wt"}

        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
        }

        resp = requests.post(url, data=params, headers=headers, timeout=15)

        if resp.status_code != 200:
            logger.warning(f"فشل البحث عن '{query}': HTTP {resp.status_code}")
            return mentions

        # Parse HTML results simply
        text = resp.text

        # DuckDuckGo HTML uses result__a for titles and result__snippet for descriptions
        import re

        # Extract results using regex (simple approach for DDG HTML)
        result_blocks = re.findall(
            r'<a[^>]*class="result__a"[^>]*href="([^"]*)"[^>]*>(.*?)</a>.*?'
            r'<(?:a|td)[^>]*class="result__snippet"[^>]*>(.*?)</(?:a|td)>',
            text, re.DOTALL
        )

        for link, title, snippet in result_blocks[:10]:
            # Clean HTML tags
            clean_title = re.sub(r'<[^>]+>', '', title).strip()
            clean_snippet = re.sub(r'<[^>]+>', '', snippet).strip()

            if clean_title and (query.lower() in clean_title.lower() or query.lower() in clean_snippet.lower()):
                mentions.append({
                    "title": clean_title[:200],
                    "snippet": clean_snippet[:300],
                    "url": link[:500],
                    "source": "web",
                    "query": query,
                })

        logger.info(f"تم العثور على {len(mentions)} إشارة لـ '{query}'")

    except requests.exceptions.Timeout:
        logger.warning(f"انتهت مهلة البحث عن '{query}'")
    except Exception as e:
        logger.error(f"خطأ في البحث عن '{query}': {e}")

    return mentions


def analyze_sentiment(
    mentions: list[dict],
    glm_api_key: str,
    glm_api_url: str,
    glm_model: str,
    logger,
) -> dict:
    """
    يحلل مشاعر الإشارات باستخدام GLM API.

    يعيد:
        {score: -1 to 1, label: positive/negative/neutral, summary: str, details: list}
    """
    if not mentions:
        return {
            "score": 0.0,
            "label": "neutral",
            "summary": "لا توجد إشارات للعلامة التجارية",
            "details": [],
        }

    if not glm_api_key:
        # تحليل بسيط بدون AI
        return _simple_sentiment(mentions, logger)

    # تجميع النصوص للتحليل
    texts = []
    for m in mentions[:20]:
        texts.append(f"- {m['title']}: {m['snippet'][:100]}")

    combined_text = "\n".join(texts)

    try:
        headers = {
            "Authorization": f"Bearer {glm_api_key}",
            "Content-Type": "application/json",
        }

        payload = {
            "model": glm_model,
            "messages": [
                {
                    "role": "system",
                    "content": (
                        "أنت محلل مشاعر للعلامات التجارية. حلل الإشارات التالية وأعطِ نتيجة. "
                        "أجب فقط بتنسيق JSON: "
                        '{"score": number(-1 to 1), "label": "positive/negative/neutral", '
                        '"summary": "ملخص قصير بالعربية", "highlights": ["نقطة1", "نقطة2"]}'
                    ),
                },
                {
                    "role": "user",
                    "content": f"حلل مشاعر هذه الإشارات عن Roua Trading:\n\n{combined_text}",
                },
            ],
            "max_tokens": 300,
            "temperature": 0.3,
        }

        resp = requests.post(glm_api_url, headers=headers, json=payload, timeout=30)

        if resp.status_code == 200:
            data = resp.json()
            content = data.get("choices", [{}])[0].get("message", {}).get("content", "")

            # محاولة تحليل JSON من الرد
            try:
                # البحث عن JSON في الرد
                import re
                json_match = re.search(r'\{[^{}]*\}', content, re.DOTALL)
                if json_match:
                    result = json.loads(json_match.group())
                    return {
                        "score": float(result.get("score", 0)),
                        "label": result.get("label", "neutral"),
                        "summary": result.get("summary", ""),
                        "details": result.get("highlights", []),
                    }
            except (json.JSONDecodeError, ValueError):
                pass

        # Fallback إلى تحليل بسيط
        return _simple_sentiment(mentions, logger)

    except Exception as e:
        logger.error(f"خطأ في تحليل المشاعر بالذكاء الاصطناعي: {e}")
        return _simple_sentiment(mentions, logger)


def _simple_sentiment(mentions: list[dict], logger) -> dict:
    """تحليل مشاعر بسيط بدون AI — يعتمد على كلمات مفتاحية."""
    positive_words = {
        "excellent", "great", "amazing", "love", "best", "awesome",
        "ممتاز", "رائع", "أفضل", "مذهل", "أحب", "مبدع",
        "useful", "helpful", "recommend", "recommend",
        "مفيد", "أنصح", "توصية",
    }
    negative_words = {
        "bad", "terrible", "worst", "hate", "scam", "fraud", "poor",
        "سيء", "سئ", "أسوأ", "احتيال", "نصب", "خداع", "مشكلة",
        "crash", "bug", "error", "fail", "broken",
        "خطأ", "عطل", "فشل", "معطل",
    }

    pos_count = 0
    neg_count = 0
    highlights = []

    for m in mentions:
        text = (m.get("title", "") + " " + m.get("snippet", "")).lower()
        words = set(text.split())

        has_pos = bool(words & positive_words)
        has_neg = bool(words & negative_words)

        if has_neg:
            neg_count += 1
            highlights.append(f"👎 {m.get('title', '')[:80]}")
        elif has_pos:
            pos_count += 1
            highlights.append(f"👍 {m.get('title', '')[:80]}")

    total = len(mentions) if mentions else 1
    score = (pos_count - neg_count) / total

    if score > 0.3:
        label = "positive"
    elif score < -0.3:
        label = "negative"
    else:
        label = "neutral"

    return {
        "score": round(score, 2),
        "label": label,
        "summary": f"تحليل تلقائي: {pos_count} إيجابي، {neg_count} سلبي من {total} إشارة",
        "details": highlights[:5],
    }


def save_mention_history(
    mentions: list[dict],
    sentiment: dict,
    history_file: str,
    logger,
) -> None:
    """يحفظ سجل الإشارات في ملف JSON."""
    try:
        history_dir = os.path.dirname(history_file)
        if history_dir and not os.path.exists(history_dir):
            os.makedirs(history_dir, exist_ok=True)

        history = []
        if os.path.exists(history_file):
            try:
                with open(history_file, "r", encoding="utf-8") as f:
                    history = json.load(f)
            except (json.JSONDecodeError, IOError):
                history = []

        record = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "mention_count": len(mentions),
            "sentiment_score": sentiment.get("score", 0),
            "sentiment_label": sentiment.get("label", "neutral"),
            "summary": sentiment.get("summary", ""),
            "mentions": [
                {"title": m.get("title", ""), "url": m.get("url", ""), "query": m.get("query", "")}
                for m in mentions[:20]
            ],
        }
        history.append(record)

        # الاحتفاظ بآخر 100 سجل
        if len(history) > 100:
            history = history[-100:]

        with open(history_file, "w", encoding="utf-8") as f:
            json.dump(history, f, ensure_ascii=False, indent=2)

        logger.info(f"تم حفظ سجل الإشارات ({len(history)} سجل)")

    except Exception as e:
        logger.error(f"فشل حفظ سجل الإشارات: {e}")


def format_sentiment_report(
    mentions: list[dict],
    sentiment: dict,
    logger,
) -> str:
    """يهيئ تقرير المشاعر لـ Telegram."""
    score = sentiment.get("score", 0)
    label = sentiment.get("label", "neutral")
    summary = sentiment.get("summary", "")
    details = sentiment.get("details", [])

    # رمز المشاعر
    if label == "positive":
        emoji = "😊"
        label_ar = "إيجابي"
    elif label == "negative":
        emoji = "😠"
        label_ar = "سلبي"
    else:
        emoji = "😐"
        label_ar = "محايد"

    lines = [
        "💬 <b>وكيل المشاعر — تقرير دوري</b>",
        "",
        f"{emoji} <b>المشاعر العامة: {label_ar}</b> (مؤشر: {score:+.2f})",
        f"  • {summary}",
        "",
        f"📊 <b>الإشارات:</b> {len(mentions)} إشارة مكتشفة",
        "",
    ]

    if details:
        lines.append(f"📝 <b>أبرز النقاط:</b>")
        for d in details[:5]:
            lines.append(f"  {d}")
        lines.append("")

    # أحدث الإشارات
    if mentions:
        lines.append(f"🔗 <b>أحدث الإشارات:</b>")
        for m in mentions[:5]:
            lines.append(f"  • {m.get('title', 'بدون عنوان')[:80]}")
            if m.get("snippet"):
                lines.append(f"    <i>{m['snippet'][:100]}</i>")

    return "\n".join(lines)
