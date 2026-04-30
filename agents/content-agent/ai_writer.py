"""
كاتب المحتوى بالذكاء الاصطناعي لوكيل المحتوى.
يُولّد تحليلات سوقية احترافية باستخدام GLM API.
"""

import requests
from typing import Optional


def generate_analysis(
    market_data: dict[str, dict],
    glm_api_key: str,
    glm_api_url: str,
    glm_model: str,
    language: str,
    logger,
) -> Optional[str]:
    """
    يُولّد تحليلاً مختصراً بأسلوب التغريدة باستخدام GLM API.

    المعاملات:
        market_data: بيانات السوق من fetch_market_data
        glm_api_key: مفتاح GLM API
        glm_api_url: رابط GLM API
        glm_model: اسم النموذج
        language: اللغة (ar أو en أو both)
        logger: مسجل ColoredLogger

    يعيد:
        نص التحليل المختصر أو None عند الفشل
    """
    from market_fetcher import format_market_summary

    summary = format_market_summary(market_data)

    if language == "ar":
        system_prompt = (
            "أنت محلل أسواق مالية محترف. اكتب تحليلاً مختصراً وجذاباً لمنصة تداول. "
            "استخدم لغة عربية فصيحة مع مصطلحات مالية دقيقة."
        )
        user_prompt = (
            "اكتب تحليلاً احترافياً مختصراً عن أداء الأسواق اليوم. "
            "أقصى طول 280 حرفاً. "
            "ابدأ بـ 📊 ثم اسم السهم ثم الاتجاه.\n\n"
            f"بيانات السوق:\n{summary}"
        )
    elif language == "en":
        system_prompt = (
            "You are a professional financial market analyst. Write concise and engaging "
            "analysis for a trading platform. Use precise financial terminology."
        )
        user_prompt = (
            "Write a concise professional market analysis for today. "
            "Max 280 characters. "
            "Start with 📊 then ticker then direction.\n\n"
            f"Market data:\n{summary}"
        )
    else:  # both
        system_prompt = (
            "أنت محلل أسواق مالية محترف. اكتب التحليل بالعربية مع الرموز الإنجليزية. "
            "استخدم لغة عربية فصيحة مع مصطلحات مالية دقيقة."
        )
        user_prompt = (
            "اكتب تحليلاً احترافياً مختصراً عن أداء الأسواق اليوم. "
            "أقصى طول 280 حرفاً. "
            "ابدأ بـ 📊 ثم اسم السهم ثم الاتجاه.\n\n"
            f"بيانات السوق:\n{summary}"
        )

    return _call_glm(
        api_key=glm_api_key,
        api_url=glm_api_url,
        model=glm_model,
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        max_tokens=200,
        temperature=0.7,
        logger=logger,
    )


def generate_detailed_report(
    market_data: dict[str, dict],
    glm_api_key: str,
    glm_api_url: str,
    glm_model: str,
    language: str,
    logger,
    report_type: str = "afternoon",
) -> Optional[str]:
    """
    يُولّد تقريراً مفصلاً للنشر عبر Telegram باستخدام GLM API.

    المعاملات:
        market_data: بيانات السوق من fetch_market_data
        glm_api_key: مفتاح GLM API
        glm_api_url: رابط GLM API
        glm_model: اسم النموذج
        language: اللغة (ar أو en أو both)
        logger: مسجل ColoredLogger
        report_type: نوع التقرير (afternoon أو evening)

    يعيد:
        نص التقرير المفصل أو None عند الفشل
    """
    from market_fetcher import format_market_summary

    summary = format_market_summary(market_data)

    if report_type == "afternoon":
        if language == "ar":
            system_prompt = (
                "أنت محلل أسواق مالية خبير. اكتب تقريراً تحليلياً شاملاً يتضمن "
                "توصيات عملية للمستثمرين. استخدم لغة عربية فصيحة مع مصطلحات مالية دقيقة."
            )
            user_prompt = (
                "اكتب تقريراً تحليلياً مفصلاً عن أداء الأسواق اليوم يتضمن:\n"
                "1. ملخص حركة السوق\n"
                "2. أبرز الأصول صعوداً وهبوطاً\n"
                "3. تحليل الاتجاه العام\n"
                "4. توصيات عملية للمستثمرين\n\n"
                f"بيانات السوق:\n{summary}"
            )
        elif language == "en":
            system_prompt = (
                "You are an expert financial market analyst. Write a comprehensive analytical "
                "report with actionable recommendations for investors."
            )
            user_prompt = (
                "Write a detailed market analysis report for today including:\n"
                "1. Market movement summary\n"
                "2. Top gainers and losers\n"
                "3. Overall trend analysis\n"
                "4. Actionable recommendations for investors\n\n"
                f"Market data:\n{summary}"
            )
        else:  # both
            system_prompt = (
                "أنت محلل أسواق مالية خبير. اكتب التقرير بالعربية مع الرموز الإنجليزية. "
                "تضمن توصيات عملية للمستثمرين."
            )
            user_prompt = (
                "اكتب تقريراً تحليلياً مفصلاً عن أداء الأسواق اليوم يتضمن:\n"
                "1. ملخص حركة السوق\n"
                "2. أبرز الأصول صعوداً وهبوطاً\n"
                "3. تحليل الاتجاه العام\n"
                "4. توصيات عملية للمستثمرين\n\n"
                f"بيانات السوق:\n{summary}"
            )
    else:  # evening wrap-up
        if language == "ar":
            system_prompt = (
                "أنت محلل أسواق مالية خبير. اكتب ملخصاً يومياً شاملاً يغطي "
                "أهم أحداث يوم التداول. استخدم لغة عربية فصيحة."
            )
            user_prompt = (
                "اكتب ملخص يوم التداول يتضمن:\n"
                "1. خلاصة أداء السوق اليوم\n"
                "2. أهم المحركات والأحداث\n"
                "3. نظرة استشرافية لليوم التالي\n"
                "4. مستويات مهمة يجب مراقبتها\n\n"
                f"بيانات السوق:\n{summary}"
            )
        elif language == "en":
            system_prompt = (
                "You are an expert financial market analyst. Write a comprehensive "
                "daily wrap-up covering the key trading day events."
            )
            user_prompt = (
                "Write a daily trading wrap-up including:\n"
                "1. Market performance summary\n"
                "2. Key drivers and events\n"
                "3. Forward-looking outlook\n"
                "4. Key levels to watch\n\n"
                f"Market data:\n{summary}"
            )
        else:  # both
            system_prompt = (
                "أنت محلل أسواق مالية خبير. اكتب الملخص اليومي بالعربية مع الرموز الإنجليزية. "
                "غطّ أهم أحداث يوم التداول."
            )
            user_prompt = (
                "اكتب ملخص يوم التداول يتضمن:\n"
                "1. خلاصة أداء السوق اليوم\n"
                "2. أهم المحركات والأحداث\n"
                "3. نظرة استشرافية لليوم التالي\n"
                "4. مستويات مهمة يجب مراقبتها\n\n"
                f"بيانات السوق:\n{summary}"
            )

    return _call_glm(
        api_key=glm_api_key,
        api_url=glm_api_url,
        model=glm_model,
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        max_tokens=800,
        temperature=0.7,
        logger=logger,
    )


def _call_glm(
    api_key: str,
    api_url: str,
    model: str,
    system_prompt: str,
    user_prompt: str,
    max_tokens: int = 400,
    temperature: float = 0.7,
    logger=None,
) -> Optional[str]:
    """
    يرسل طلباً إلى GLM API ويعيد النص المُولّد.

    المعاملات:
        api_key: مفتاح API
        api_url: رابط API
        model: اسم النموذج
        system_prompt: تعليمات النظام
        user_prompt: طلب المستخدم
        max_tokens: أقصى عدد من الرموز المُولّدة
        temperature: درجة العشوائية
        logger: مسجل ColoredLogger

    يعيد:
        النص المُولّد أو None عند الفشل
    """
    if not api_key:
        if logger:
            logger.error("مفتاح GLM API غير مضبوط — لا يمكن توليد المحتوى")
        return None

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "max_tokens": max_tokens,
        "temperature": temperature,
    }

    try:
        if logger:
            logger.debug(f"إرسال طلب إلى GLM API (النموذج: {model})")

        resp = requests.post(
            api_url,
            headers=headers,
            json=payload,
            timeout=60,
        )

        if resp.status_code == 200:
            data = resp.json()
            choices = data.get("choices", [])
            if choices:
                content = choices[0].get("message", {}).get("content", "").strip()
                if content:
                    if logger:
                        logger.info(
                            f"تم توليد المحتوى بنجاح ({len(content)} حرف)"
                        )
                    return content
                else:
                    if logger:
                        logger.warning("GLM API أعاد محتوى فارغاً")
                    return None
            else:
                if logger:
                    logger.warning("GLM API لم يُعد خيارات")
                return None
        else:
            if logger:
                logger.error(
                    f"فشل طلب GLM API: HTTP {resp.status_code} — {resp.text[:200]}"
                )
            return None

    except requests.exceptions.Timeout:
        if logger:
            logger.error("انتهت مهلة طلب GLM API (60 ثانية)")
        return None
    except requests.exceptions.ConnectionError:
        if logger:
            logger.error("فشل الاتصال بخادم GLM API")
        return None
    except Exception as e:
        if logger:
            logger.error(f"خطأ غير متوقع في طلب GLM API: {e}")
        return None
