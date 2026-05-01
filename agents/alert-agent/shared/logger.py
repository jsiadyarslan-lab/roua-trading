"""
مسجل موحد مع ألوان لجميع وكلاء Roua Trading.
يدعم الطباعة على الطرفية مع بادئة اسم الوكيل.
"""

import sys
from datetime import datetime, timezone


class ColoredLogger:
    """
    مسجل ملون لطرفية Railway.
    كل وكيل ينشئ نسخة باسمه الخاص.
    """

    # رموز ANSI للألوان
    COLORS = {
        "DEBUG":    "\033[36m",   # سماوي
        "INFO":     "\033[32m",   # أخضر
        "WARNING":  "\033[33m",   # أصفر
        "ERROR":    "\033[31m",   # أحمر
        "CRITICAL": "\033[35m",   # بنفسجي
    }
    RESET = "\033[0m"
    BOLD = "\033[1m"

    def __init__(self, agent_name: str, level: str = "INFO"):
        self._agent_name = agent_name
        self._level = level
        self._level_order = {
            "DEBUG": 10, "INFO": 20, "WARNING": 30,
            "ERROR": 40, "CRITICAL": 50,
        }

    def _should_log(self, level: str) -> bool:
        return self._level_order.get(level, 0) >= self._level_order.get(self._level, 0)

    def _format(self, level: str, msg: str) -> str:
        now = datetime.now(timezone.utc).strftime("%H:%M:%S")
        color = self.COLORS.get(level, "")
        icon = {
            "DEBUG": "🔍", "INFO": "✅", "WARNING": "⚠️",
            "ERROR": "❌", "CRITICAL": "🔥",
        }.get(level, "•")
        return (
            f"{color}[{now}] {icon} [{self._agent_name}] {msg}{self.RESET}"
        )

    def debug(self, msg: str) -> None:
        if self._should_log("DEBUG"):
            print(self._format("DEBUG", msg))

    def info(self, msg: str) -> None:
        if self._should_log("INFO"):
            print(self._format("INFO", msg))

    def warning(self, msg: str) -> None:
        if self._should_log("WARNING"):
            print(self._format("WARNING", msg))

    def error(self, msg: str) -> None:
        if self._should_log("ERROR"):
            print(self._format("ERROR", msg))

    def critical(self, msg: str) -> None:
        if self._should_log("CRITICAL"):
            print(self._format("CRITICAL", msg))

    def banner(self, lines: list[str]) -> None:
        """يطبع بانر بدء التشغيل."""
        print()
        print(f"{self.BOLD}{'━' * 55}{self.RESET}")
        for line in lines:
            print(f"  {line}")
        print(f"{self.BOLD}{'━' * 55}{self.RESET}")
        print()
