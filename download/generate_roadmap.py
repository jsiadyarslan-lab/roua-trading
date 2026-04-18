#!/usr/bin/env python3
"""
Roua Trading Platform — Roadmap Timeline Diagram
Creates a professional horizontal timeline with 4 phases.
"""

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
from matplotlib.patches import FancyBboxPatch
import arabic_reshaper
from bidi.algorithm import get_display


def ar(text: str) -> str:
    """Reshape and reorder Arabic text for correct matplotlib rendering."""
    reshaped = arabic_reshaper.reshape(text)
    return get_display(reshaped)


# ── colour palette ──────────────────────────────────────────────────────────
BG       = "#0F172A"
TEXT     = "#F1F5F9"
TEXT_DIM = "#94A3B8"
PHASE_COLORS = ["#3AAFA9", "#4C6EF5", "#C6866A", "#10B981"]

# ── data ────────────────────────────────────────────────────────────────────
phases = [
    {
        "num": 1,
        "ar": "الأساس",
        "en": "Foundation",
        "months": "Months 1–3",
        "items": [
            "Project setup (Turborepo monorepo)",
            "Next.js 15 frontend scaffolding",
            "NestJS microservices architecture",
            "PostgreSQL + Redis setup",
            "WebAuthn authentication",
            "Twelve Data API integration",
            "Basic market dashboard",
        ],
    },
    {
        "num": 2,
        "ar": "الذكاء",
        "en": "Intelligence",
        "months": "Months 4–6",
        "items": [
            "AI Symphony integration",
            "  (Gemini, Groq, GLM-4, Bedrock)",
            "AI Orchestrator service",
            "RAG system with pgvector",
            "Arabic NLP processing",
            "Sentiment analysis pipeline",
            "Smart Lab (backtesting)",
        ],
    },
    {
        "num": 3,
        "ar": "الثورة",
        "en": "Revolution",
        "months": "Months 7–9",
        "items": [
            "Roua Signals generation",
            "Portfolio Sanctuary",
            "  (risk management)",
            "Autonomous Newsroom",
            "  (multi-agent)",
            "Strapi CMS integration",
            "CCXT crypto exchange integration",
            "Advanced security hardening",
        ],
    },
    {
        "num": 4,
        "ar": "الإطلاق",
        "en": "Launch",
        "months": "Months 10–12",
        "items": [
            "Beta testing program",
            "Performance optimization",
            "Legal compliance review",
            "Marketing & community building",
            "Freemium / Premium launch",
            "Full production deployment",
        ],
    },
]

# ── figure ──────────────────────────────────────────────────────────────────
fig, ax = plt.subplots(figsize=(18, 10), dpi=200, facecolor=BG)
ax.set_facecolor(BG)
ax.set_xlim(0, 100)
ax.set_ylim(0, 100)
ax.axis("off")

# ── title ───────────────────────────────────────────────────────────────────
ax.text(
    50, 95.5,
    ar("خارطة الطريق إلى الثورة"),
    fontsize=24, fontweight="bold", color=TEXT,
    ha="center", va="center",
    fontfamily="DejaVu Sans",
)
ax.text(
    50, 91.5,
    "Roadmap to Revolution  —  Roua Trading Platform",
    fontsize=13, color=TEXT_DIM,
    ha="center", va="center",
    fontfamily="DejaVu Sans",
)

# ── layout constants ────────────────────────────────────────────────────────
NUM_PHASES  = 4
BOX_W       = 21.5
BOX_H       = 70
GAP         = 2.0
TOTAL_W     = NUM_PHASES * BOX_W + (NUM_PHASES - 1) * GAP
X_START     = (100 - TOTAL_W) / 2
Y_BOTTOM    = 6

# ── draw timeline spine ────────────────────────────────────────────────────
SPINE_Y = Y_BOTTOM + BOX_H + 3.5
ax.plot(
    [X_START - 1, X_START + TOTAL_W + 1],
    [SPINE_Y, SPINE_Y],
    color=TEXT_DIM, linewidth=1.8, zorder=1, solid_capstyle="round",
)

# ── draw each phase ─────────────────────────────────────────────────────────
for i, phase in enumerate(phases):
    color = PHASE_COLORS[i]
    x = X_START + i * (BOX_W + GAP)
    y = Y_BOTTOM

    # ── rounded rectangle background ────────────────────────────────────
    box = FancyBboxPatch(
        (x, y), BOX_W, BOX_H,
        boxstyle="round,pad=0.6",
        facecolor=color + "18",
        edgecolor=color,
        linewidth=2,
        zorder=2,
    )
    ax.add_patch(box)

    # ── phase header bar ────────────────────────────────────────────────
    header_h = 18
    header = FancyBboxPatch(
        (x, y + BOX_H - header_h), BOX_W, header_h,
        boxstyle="round,pad=0.6",
        facecolor=color + "CC",
        edgecolor="none",
        zorder=3,
    )
    ax.add_patch(header)

    # Clip the bottom rounded corners of the header by overlaying a rect
    clip_rect = mpatches.Rectangle(
        (x, y + BOX_H - header_h), BOX_W, header_h / 2,
        facecolor=color + "CC",
        edgecolor="none",
        zorder=3,
    )
    ax.add_patch(clip_rect)

    # ── phase number circle on timeline ─────────────────────────────────
    circle_x = x + BOX_W / 2
    circle = plt.Circle(
        (circle_x, SPINE_Y), 1.8,
        facecolor=color, edgecolor=BG, linewidth=2.5, zorder=5,
    )
    ax.add_artist(circle)
    ax.text(
        circle_x, SPINE_Y, str(phase["num"]),
        fontsize=11, fontweight="bold", color=BG,
        ha="center", va="center", zorder=6,
        fontfamily="DejaVu Sans",
    )

    # ── connector line from circle to box top ───────────────────────────
    ax.plot(
        [circle_x, circle_x],
        [SPINE_Y - 1.8, y + BOX_H],
        color=color, linewidth=1.5, zorder=1, alpha=0.6,
    )

    # ── header text ─────────────────────────────────────────────────────
    header_cy = y + BOX_H - header_h / 2
    ax.text(
        x + BOX_W / 2, header_cy + 3.5,
        ar(phase["ar"]),
        fontsize=16, fontweight="bold", color=BG,
        ha="center", va="center", zorder=4,
        fontfamily="DejaVu Sans",
    )
    ax.text(
        x + BOX_W / 2, header_cy - 1.5,
        f'Phase {phase["num"]} — {phase["en"]}',
        fontsize=9.5, fontweight="bold", color=BG,
        ha="center", va="center", zorder=4,
        fontfamily="DejaVu Sans",
    )
    ax.text(
        x + BOX_W / 2, header_cy - 5.5,
        phase["months"],
        fontsize=8.5, color=BG,
        ha="center", va="center", zorder=4,
        fontfamily="DejaVu Sans", alpha=0.75,
    )

    # ── bullet items ────────────────────────────────────────────────────
    item_top = y + BOX_H - header_h - 3
    line_height = 7.0
    bullet_char = "●"
    line_idx = 0
    for item in phase["items"]:
        iy = item_top - line_idx * line_height
        if iy < y + 2:
            break  # safety
        is_sub = item.startswith("  ")
        display_text = item.strip()
        if is_sub:
            # sub-item: smaller text, indented, no bullet
            ax.text(
                x + 5.5, iy,
                display_text,
                fontsize=7, color=TEXT_DIM,
                ha="left", va="center", zorder=4,
                fontfamily="DejaVu Sans",
            )
        else:
            # bullet
            ax.text(
                x + 1.8, iy,
                bullet_char,
                fontsize=5.5, color=color,
                ha="left", va="center", zorder=4,
                fontfamily="DejaVu Sans",
            )
            # item text
            ax.text(
                x + 3.5, iy,
                display_text,
                fontsize=7.8, color=TEXT,
                ha="left", va="center", zorder=4,
                fontfamily="DejaVu Sans",
            )
        line_idx += 1

    # ── month markers on timeline spine ─────────────────────────────────
    month_start = phase["months"].replace("Months ", "").replace("–", "-").replace("—", "-")
    try:
        m_s, m_e = month_start.split("-")
        m_s, m_e = int(m_s.strip()), int(m_e.strip())
        for m in range(m_s, m_e + 1):
            mx = x + BOX_W * (m - m_s + 0.5) / (m_e - m_s + 1)
            ax.plot(mx, SPINE_Y - 0.6, marker="|", markersize=5, color=TEXT_DIM, zorder=2)
            ax.text(mx, SPINE_Y - 2.2, f"M{m}", fontsize=6.5, color=TEXT_DIM,
                    ha="center", va="center", fontfamily="DejaVu Sans")
    except Exception:
        pass

# ── footer ──────────────────────────────────────────────────────────────────
ax.text(
    50, 2,
    "© 2025 Roua Trading  ·  Building the Future of Intelligent Trading",
    fontsize=8, color=TEXT_DIM, ha="center", va="center",
    fontfamily="DejaVu Sans", alpha=0.6,
)

# ── save ────────────────────────────────────────────────────────────────────
out_path = "/home/z/my-project/download/roadmap_timeline.png"
fig.savefig(
    out_path,
    dpi=200,
    facecolor=fig.get_facecolor(),
    edgecolor="none",
    bbox_inches="tight",
    pad_inches=0.3,
)
plt.close(fig)
print(f"✅  Saved roadmap timeline → {out_path}")
