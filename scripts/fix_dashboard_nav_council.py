#!/usr/bin/env python3
"""
Add missing dashboard.nav.council key to all 30 non-ar/non-en locale files.

V273 added the council nav item but only synced ar.json + en.json. All other
30 locales show 'dashboard.nav.council' as raw text instead of the localized
"Strategic Council" label.

This script uses the same navLabel translations from translate_council_page.py
to inject dashboard.nav.council into each locale file.
"""

import json
from pathlib import Path

MESSAGES_DIR = Path("/home/z/my-project/rt-full/apps/web/messages")

# Same translations as councilPage.navLabel in translate_council_page.py
NAV_LABEL = {
    "ar": "المجلس الاستراتيجي",
    "en": "Strategic Council",
    "fr": "Conseil Stratégique",
    "tr": "Stratejik Konsey",
    "es": "Consejo Estratégico",
    "zh": "战略委员会",
    "ru": "Стратегический Совет",
    "hi": "सामरिक परिषद",
    "pt": "Conselho Estratégico",
    "de": "Strategischer Rat",
    "ja": "戦略評議会",
    "ko": "전략 평의회",
    "id": "Dewan Strategis",
    "vi": "Hội đồng Chiến lược",
    "th": "สภายุทธศาสตร์",
    "it": "Consiglio Strategico",
    "pl": "Rada Strategiczna",
    "nl": "Strategische Raad",
    "ms": "Majlis Strategik",
    "he": "מועצה אסטרטגית",
    "sv": "Strategiskt Råd",
    "uk": "Стратегічна Рада",
    "fa": "شورای استراتژیک",
    "ur": "اسٹریٹجک کونسل",
    "fil": "Strategic Council",
    "da": "Strategisk Råd",
    "no": "Strategisk Råd",
    "fi": "Strateginen Neuvosto",
    "cs": "Strategická Rada",
    "hu": "Stratégiai Tanács",
    "ro": "Consiliu Strategic",
    "bn": "কৌশলগত কাউন্সিল",
}


def main():
    fixed = 0
    skipped = 0
    for locale, label in NAV_LABEL.items():
        path = MESSAGES_DIR / f"{locale}.json"
        if not path.exists():
            print(f"  ! {locale}: file not found")
            continue

        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)

        # Ensure dashboard.nav exists
        if "dashboard" not in data or not isinstance(data["dashboard"], dict):
            data["dashboard"] = {}
        if "nav" not in data["dashboard"] or not isinstance(data["dashboard"]["nav"], dict):
            data["dashboard"]["nav"] = {}

        existing = data["dashboard"]["nav"].get("council")
        if existing and existing != "dashboard.nav.council":
            # Already has a real translation (not the raw key)
            skipped += 1
            print(f"  - {locale}: already set to '{existing}' (skipped)")
            continue

        data["dashboard"]["nav"]["council"] = label

        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
            f.write("\n")

        fixed += 1
        print(f"  + {locale}: set to '{label}'")

    print(f"\n[OK] Fixed: {fixed} | Skipped (already set): {skipped}")


if __name__ == "__main__":
    main()
