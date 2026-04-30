#!/usr/bin/env python3
"""
AI Symphony Blueprint Diagram Generator
For Roua Trading Platform
Professional data-flow architecture diagram
"""

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
from matplotlib.patches import FancyBboxPatch, FancyArrowPatch
import numpy as np

# ── Color Palette ──
BG_COLOR      = '#0F172A'
TEXT_COLOR     = '#F1F5F9'
ACCENT_TEAL   = '#3AAFA9'
ACCENT_BLUE   = '#4C6EF5'
SUBTLE_BG     = '#1E293B'
BORDER_COLOR  = '#334155'

MODEL_COLORS = {
    'gemini':  '#4C6EF5',
    'groq':    '#F59E0B',
    'glm4':    '#3AAFA9',
    'ollama':  '#8B5CF6',
    'bedrock': '#F43F5E',
    'twelve':  '#10B981',
    'rag':     '#6366F1',
    'ui':      '#EC4899',
}

def draw_model_box(ax, x, y, w, h, color, label_ar, label_en, sublabel,
                   icon_char='', alpha_fill=0.18, border_width=2.5,
                   fontsize_ar=11, fontsize_en=8.5, fontsize_sub=7):
    """Draw a styled rounded rectangle box for an AI model."""
    # Main filled box
    box = FancyBboxPatch(
        (x - w/2, y - h/2), w, h,
        boxstyle="round,pad=0.03",
        facecolor=color,
        edgecolor=color,
        alpha=alpha_fill,
        linewidth=border_width,
        zorder=2
    )
    ax.add_patch(box)

    # Outer glow
    glow = FancyBboxPatch(
        (x - w/2, y - h/2), w, h,
        boxstyle="round,pad=0.03",
        facecolor='none',
        edgecolor=color,
        alpha=0.4,
        linewidth=border_width + 2,
        zorder=1
    )
    ax.add_patch(glow)

    # Icon circle at top of box
    if icon_char:
        icon_circle = plt.Circle((x, y + h/2 - 0.18), 0.13,
                                  facecolor=color, edgecolor='none', alpha=0.6, zorder=3)
        ax.add_patch(icon_circle)
        ax.text(x, y + h/2 - 0.18, icon_char,
                ha='center', va='center', fontsize=7, color=TEXT_COLOR,
                fontweight='bold', zorder=4)

    # Arabic label
    ax.text(x, y + 0.15, label_ar,
            ha='center', va='center', fontsize=fontsize_ar, color=TEXT_COLOR,
            fontweight='bold', zorder=3, fontfamily='DejaVu Sans')

    # English label
    ax.text(x, y - 0.08, label_en,
            ha='center', va='center', fontsize=fontsize_en, color=color,
            fontweight='bold', zorder=3, alpha=0.9, fontfamily='monospace')

    # Sublabel
    if sublabel:
        ax.text(x, y - 0.28, sublabel,
                ha='center', va='center', fontsize=fontsize_sub, color='#94A3B8',
                zorder=3, fontfamily='DejaVu Sans', style='italic')


def draw_flow_arrow(ax, start, end, color, lw=2.0, alpha=0.7,
                    rad=0.0, label='', label_offset=(0, 0.12)):
    """Draw a curved flow arrow with optional label."""
    arrow = FancyArrowPatch(
        start, end,
        arrowstyle='->,head_length=8,head_width=5',
        color=color,
        linewidth=lw,
        alpha=alpha,
        connectionstyle=f'arc3,rad={rad}',
        zorder=4,
        mutation_scale=14
    )
    ax.add_patch(arrow)

    if label:
        mx = (start[0] + end[0]) / 2 + label_offset[0]
        my = (start[1] + end[1]) / 2 + label_offset[1]
        ax.text(mx, my, label,
                ha='center', va='center', fontsize=6.2, color=color,
                fontweight='bold', alpha=0.85, zorder=5,
                fontfamily='DejaVu Sans',
                bbox=dict(boxstyle='round,pad=0.12', facecolor=BG_COLOR,
                         edgecolor='none', alpha=0.85))


def draw_step_badge(ax, x, y, number, color, text):
    """Draw a numbered step indicator circle with label."""
    circle = plt.Circle((x, y), 0.18, facecolor=BG_COLOR, edgecolor=color,
                         linewidth=2, alpha=0.9, zorder=6)
    ax.add_patch(circle)
    ax.text(x, y, str(number), ha='center', va='center', fontsize=8.5,
            color=color, fontweight='bold', zorder=7)
    ax.text(x + 0.33, y, text, ha='left', va='center', fontsize=6.2,
            color='#94A3B8', zorder=7, fontfamily='monospace')


def main():
    fig, ax = plt.subplots(1, 1, figsize=(16, 12), dpi=200,
                           facecolor=BG_COLOR, constrained_layout=True)
    ax.set_facecolor(BG_COLOR)
    ax.set_xlim(0, 16)
    ax.set_ylim(0, 12)
    ax.set_aspect('equal')
    ax.axis('off')

    # ════════════════════════════════════
    # BACKGROUND GRID DOTS
    # ════════════════════════════════════
    for gx in np.arange(0.5, 16, 0.8):
        for gy in np.arange(0.5, 12, 0.8):
            ax.plot(gx, gy, '.', color='#1E293B', markersize=1.2, alpha=0.4)

    # ════════════════════════════════════
    # TITLE
    # ════════════════════════════════════
    ax.text(8, 11.55, '\u0645\u062e\u0637\u0637 \u0633\u064a\u0645\u0641\u0648\u0646\u064a\u0629 \u0627\u0644\u0630\u0643\u0627\u0621 \u0627\u0644\u0627\u0635\u0637\u0646\u0627\u0639\u064a',
            ha='center', va='center', fontsize=20, color=TEXT_COLOR,
            fontweight='bold', fontfamily='DejaVu Sans', zorder=10)
    # Decorative line under title
    ax.plot([4.5, 11.5], [11.3, 11.3], color=ACCENT_TEAL, lw=1.5, alpha=0.4, zorder=9)
    ax.text(8, 11.15, 'AI Symphony Blueprint',
            ha='center', va='center', fontsize=12, color=ACCENT_TEAL,
            fontweight='bold', fontfamily='monospace', zorder=10, alpha=0.85)
    ax.text(8, 10.85, 'Roua Trading Platform  \u00b7  \u0645\u062e\u0637\u0637 \u062a\u062f\u0641\u0642 \u0627\u0644\u0628\u064a\u0627\u0646\u0627\u062a',
            ha='center', va='center', fontsize=8, color='#64748B',
            fontfamily='DejaVu Sans', zorder=10)

    # ════════════════════════════════════
    # POSITIONS
    # ════════════════════════════════════
    # User Interface (top)
    ui_x, ui_y, ui_w, ui_h = 8.0, 10.1, 3.6, 0.65

    # Bedrock (upper)
    br_x, br_y, br_w, br_h = 8.0, 8.75, 3.2, 0.85

    # Gemini (center)
    gm_x, gm_y, gm_w, gm_h = 8.0, 7.2, 3.2, 0.85

    # GLM-4 (center-lower)
    gl_x, gl_y, gl_w, gl_h = 8.0, 5.65, 3.2, 0.85

    # Groq (lower-left)
    gr_x, gr_y, gr_w, gr_h = 4.5, 3.9, 3.0, 0.85

    # Ollama (lower-right)
    ol_x, ol_y, ol_w, ol_h = 11.5, 3.9, 3.0, 0.85

    # Twelve Data (bottom)
    td_x, td_y, td_w, td_h = 8.0, 2.0, 4.5, 0.85

    # RAG (right side)
    rag_x, rag_y, rag_w, rag_h = 14.2, 6.4, 1.9, 2.1

    # ════════════════════════════════════
    # DRAW MODEL BOXES
    # ════════════════════════════════════

    # User Interface
    draw_model_box(ax, ui_x, ui_y, ui_w, ui_h,
                   MODEL_COLORS['ui'],
                   '\u0648\u0627\u062c\u0647\u0629 \u0627\u0644\u0645\u0633\u062a\u062e\u062f\u0645',
                   'User Interface',
                   'Final Signals & Reports Output',
                   icon_char='UI', fontsize_ar=10, fontsize_en=8)

    # Amazon Bedrock
    draw_model_box(ax, br_x, br_y, br_w, br_h,
                   MODEL_COLORS['bedrock'],
                   '\u0627\u0644\u0645\u0633\u062a\u0634\u0627\u0631 \u0627\u0644\u062e\u0627\u0635',
                   'Amazon Bedrock',
                   'Claude 4.6 \u00b7 Final Signals & Deep Reports',
                   icon_char='BR')

    # Google Gemini
    draw_model_box(ax, gm_x, gm_y, gm_w, gm_h,
                   MODEL_COLORS['gemini'],
                   '\u0627\u0644\u0639\u0642\u0644 \u0627\u0644\u0645\u062f\u0628\u0631',
                   'Google Gemini',
                   'AI Studio \u00b7 gemini-2.5-pro \u00b7 Creative Analysis',
                   icon_char='GM')

    # GLM-4
    draw_model_box(ax, gl_x, gl_y, gl_w, gl_h,
                   MODEL_COLORS['glm4'],
                   '\u0627\u0644\u0645\u062d\u0644\u0644 \u0627\u0644\u0645\u0627\u0644\u064a',
                   'GLM-4',
                   'Zhipu AI \u00b7 Financial Analysis \u00b7 200K Context \u00b7 Arabic',
                   icon_char='GL')

    # Groq
    draw_model_box(ax, gr_x, gr_y, gr_w, gr_h,
                   MODEL_COLORS['groq'],
                   '\u0627\u0644\u0633\u0631\u0639\u0629 \u0627\u0644\u0635\u0627\u0631\u0648\u062e\u064a\u0629',
                   'Groq',
                   'Llama 3 \u00b7 Instant Translation & Sentiment',
                   icon_char='GQ')

    # Ollama Cloud
    draw_model_box(ax, ol_x, ol_y, ol_w, ol_h,
                   MODEL_COLORS['ollama'],
                   '\u0627\u0644\u062c\u0646\u062f\u064a \u0645\u062a\u0639\u062f\u062f \u0627\u0644\u0645\u0647\u0627\u0645',
                   'Ollama Cloud',
                   'Drafts \u00b7 General Translation \u00b7 Backup Tasks',
                   icon_char='OC')

    # Twelve Data
    draw_model_box(ax, td_x, td_y, td_w, td_h,
                   MODEL_COLORS['twelve'],
                   '\u0645\u0635\u062f\u0631 \u0627\u0644\u0628\u064a\u0627\u0646\u0627\u062a \u0627\u0644\u0623\u0633\u0627\u0633\u064a',
                   'Twelve Data',
                   'Stocks \u00b7 Forex \u00b7 Crypto \u00b7 Real-time Market Data',
                   icon_char='TD', fontsize_ar=10)

    # RAG System
    draw_model_box(ax, rag_x, rag_y, rag_w, rag_h,
                   MODEL_COLORS['rag'],
                   '\u0646\u0638\u0627\u0645 RAG',
                   'RAG System',
                   'News Archive\nPostgreSQL + pgvector',
                   icon_char='RG', fontsize_ar=9, fontsize_en=7.5, fontsize_sub=6.5)

    # ════════════════════════════════════
    # DATA FLOW ARROWS
    # ════════════════════════════════════

    # --- Twelve Data feeds all models ---

    # TD → Groq
    draw_flow_arrow(ax, (6.3, td_y + td_h/2), (gr_x, gr_y - gr_h/2),
                    color=MODEL_COLORS['twelve'], lw=1.8, alpha=0.6, rad=0.15,
                    label='Market Data')

    # TD → GLM-4
    draw_flow_arrow(ax, (7.8, td_y + td_h/2 + 0.05), (gl_x - 0.2, gl_y - gl_h/2 - 0.05),
                    color=MODEL_COLORS['twelve'], lw=1.8, alpha=0.6, rad=0.0,
                    label='Market Data', label_offset=(0.55, 0))

    # TD → Gemini (lighter - shown as background feed)
    draw_flow_arrow(ax, (8.6, td_y + td_h/2 + 0.05), (gm_x + 0.3, gm_y - gm_h/2 - 0.05),
                    color=MODEL_COLORS['twelve'], lw=1.2, alpha=0.3, rad=-0.08)

    # TD → Ollama
    draw_flow_arrow(ax, (9.6, td_y + td_h/2), (ol_x, ol_y - ol_h/2),
                    color=MODEL_COLORS['twelve'], lw=1.2, alpha=0.3, rad=-0.15)

    # TD → Bedrock (very light - background)
    draw_flow_arrow(ax, (9.6, td_y + td_h/2), (br_x + 0.9, br_y - br_h/2),
                    color=MODEL_COLORS['twelve'], lw=0.8, alpha=0.2, rad=-0.25)

    # --- Main Pipeline: Groq → GLM-4 → Gemini → Bedrock → UI ---

    # Groq → GLM-4
    draw_flow_arrow(ax, (gr_x + gr_w/2, gr_y + 0.05), (gl_x - gl_w/2, gl_y - 0.1),
                    color=MODEL_COLORS['groq'], lw=2.5, alpha=0.8, rad=0.12,
                    label='Sentiment Analysis')

    # GLM-4 → Gemini
    draw_flow_arrow(ax, (gl_x, gl_y + gl_h/2), (gm_x, gm_y - gm_h/2),
                    color=MODEL_COLORS['glm4'], lw=2.5, alpha=0.8, rad=0.0,
                    label='Financial Assessment', label_offset=(0.78, 0))

    # Gemini → Bedrock
    draw_flow_arrow(ax, (gm_x, gm_y + gm_h/2), (br_x, br_y - br_h/2),
                    color=MODEL_COLORS['gemini'], lw=2.5, alpha=0.8, rad=0.0,
                    label='Creative Analysis', label_offset=(0.7, 0))

    # Bedrock → UI
    draw_flow_arrow(ax, (br_x, br_y + br_h/2), (ui_x, ui_y - ui_h/2),
                    color=MODEL_COLORS['bedrock'], lw=3.0, alpha=0.9, rad=0.0,
                    label='Final Signals & Reports', label_offset=(0.88, 0))

    # --- Ollama assistance arrows (lighter) ---

    # Ollama → GLM-4
    draw_flow_arrow(ax, (ol_x - ol_w/2 + 0.2, ol_y + 0.05), (gl_x + gl_w/2, gl_y - 0.1),
                    color=MODEL_COLORS['ollama'], lw=1.5, alpha=0.4, rad=-0.12,
                    label='Drafts/Translation', label_offset=(0.05, 0.05))

    # Ollama → Gemini
    draw_flow_arrow(ax, (ol_x - ol_w/2, ol_y + ol_h/2), (gm_x + gm_w/2, gm_y - 0.0),
                    color=MODEL_COLORS['ollama'], lw=1.0, alpha=0.3, rad=-0.18,
                    label='Assist')

    # Ollama → Bedrock
    draw_flow_arrow(ax, (ol_x - ol_w/2, ol_y + ol_h/2 + 0.05), (br_x + br_w/2, br_y + 0.1),
                    color=MODEL_COLORS['ollama'], lw=0.8, alpha=0.25, rad=-0.3)

    # --- RAG System arrows ---

    # RAG → GLM-4
    draw_flow_arrow(ax, (rag_x - rag_w/2, rag_y - 0.35), (gl_x + gl_w/2, gl_y + 0.05),
                    color=MODEL_COLORS['rag'], lw=2.0, alpha=0.65, rad=0.12,
                    label='News Context')

    # RAG → Gemini
    draw_flow_arrow(ax, (rag_x - rag_w/2, rag_y + 0.5), (gm_x + gm_w/2, gm_y + 0.0),
                    color=MODEL_COLORS['rag'], lw=2.0, alpha=0.65, rad=0.12,
                    label='News Context')

    # ════════════════════════════════════
    # STEP BADGES (pipeline numbering)
    # ════════════════════════════════════

    draw_step_badge(ax, 2.8, 2.95, 1, MODEL_COLORS['twelve'], 'Data Ingestion')
    draw_step_badge(ax, 2.8, 4.65, 2, MODEL_COLORS['groq'], 'Sentiment Analysis')
    draw_step_badge(ax, 2.8, 6.25, 3, MODEL_COLORS['glm4'], 'Financial Impact')
    draw_step_badge(ax, 2.8, 7.8, 4, MODEL_COLORS['gemini'], 'Creative Synthesis')
    draw_step_badge(ax, 2.8, 9.35, 5, MODEL_COLORS['bedrock'], 'Signal Generation')

    # Vertical dashed line connecting steps
    ax.plot([2.8, 2.8], [3.15, 9.15], '--', color='#334155', lw=1.0, alpha=0.4, zorder=0)

    # ════════════════════════════════════
    # LEGEND
    # ════════════════════════════════════

    lx, ly = 0.8, 1.1
    ax.text(lx, ly + 0.55, 'LEGEND', ha='left', va='center',
            fontsize=7, color='#64748B', fontweight='bold', fontfamily='monospace')

    legend_data = [
        (MODEL_COLORS['twelve'],  'Primary Data Feed'),
        (MODEL_COLORS['groq'],    'Analysis Pipeline'),
        (MODEL_COLORS['ollama'],  'Assistance / Backup'),
        (MODEL_COLORS['rag'],     'RAG Context Feed'),
    ]
    for i, (c, desc) in enumerate(legend_data):
        yy = ly + 0.2 - i * 0.25
        ax.plot([lx, lx + 0.5], [yy, yy], color=c, lw=2.5, alpha=0.65, solid_capstyle='round')
        ax.text(lx + 0.62, yy, desc, ha='left', va='center',
                fontsize=6, color='#94A3B8', fontfamily='monospace')

    # ════════════════════════════════════
    # DECORATIVE ELEMENTS
    # ════════════════════════════════════

    # Pipeline direction indicator (left side arrows)
    for ay in np.arange(3.5, 9.2, 0.55):
        ax.annotate('', xy=(2.1, ay + 0.3), xytext=(2.1, ay),
                    arrowprops=dict(arrowstyle='->', color='#334155', lw=0.7, alpha=0.25))
    ax.text(2.1, 9.5, 'PIPELINE', ha='center', va='bottom',
            fontsize=5, color='#475569', fontfamily='monospace')
    ax.text(2.1, 3.3, 'FLOW', ha='center', va='top',
            fontsize=5, color='#475569', fontfamily='monospace')

    # Bottom decorative bar
    ax.fill_between([0, 16], [0, 0], [0.18, 0.18], color=ACCENT_TEAL, alpha=0.1, zorder=1)
    ax.text(8, 0.08, 'ROUA TRADING  \u00b7  AI Symphony Architecture  \u00b7  2025',
            ha='center', va='center', fontsize=5.5, color='#475569',
            fontfamily='monospace', zorder=2)

    # ════════════════════════════════════
    # SAVE
    # ════════════════════════════════════
    output_path = '/home/z/my-project/download/ai_symphony_blueprint.png'
    fig.savefig(output_path, dpi=200, bbox_inches='tight',
                facecolor=BG_COLOR, edgecolor='none', pad_inches=0.3)
    plt.close(fig)
    print(f'Blueprint saved to: {output_path}')
    return output_path


if __name__ == '__main__':
    main()
