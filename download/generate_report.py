# -*- coding: utf-8 -*-
"""Roua Trading Platform — Comprehensive Evaluation Report"""

import os
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import inch, cm
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_RIGHT, TA_JUSTIFY
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, 
    PageBreak, KeepTogether, Image
)
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfbase.pdfmetrics import registerFontFamily

# ── Font Registration ──
pdfmetrics.registerFont(TTFont('WQY', '/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc'))
pdfmetrics.registerFont(TTFont('Carlito', '/usr/share/fonts/truetype/english/Carlito-Regular.ttf'))
pdfmetrics.registerFont(TTFont('CarlitoBold', '/usr/share/fonts/truetype/english/Carlito-Bold.ttf'))
pdfmetrics.registerFont(TTFont('DejaVuSans', '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'))
pdfmetrics.registerFont(TTFont('DejaVuSansBold', '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'))
registerFontFamily('WQY', normal='WQY', bold='WQY')
registerFontFamily('Carlito', normal='Carlito', bold='CarlitoBold')
registerFontFamily('DejaVuSans', normal='DejaVuSans', bold='DejaVuSansBold')

# ── Palette ──
PAGE_BG       = colors.HexColor('#f6f6f5')
SECTION_BG    = colors.HexColor('#ebeae8')
CARD_BG       = colors.HexColor('#edebe8')
TABLE_STRIPE  = colors.HexColor('#f3f3f2')
HEADER_FILL   = colors.HexColor('#685f43')
BORDER        = colors.HexColor('#dad5c3')
ICON          = colors.HexColor('#877336')
ACCENT        = colors.HexColor('#5133ab')
ACCENT_2      = colors.HexColor('#53c18a')
TEXT_PRIMARY   = colors.HexColor('#262522')
TEXT_MUTED     = colors.HexColor('#79766f')
SEM_SUCCESS   = colors.HexColor('#4f8460')
SEM_WARNING   = colors.HexColor('#a2864f')
SEM_ERROR     = colors.HexColor('#9d5049')
SEM_INFO      = colors.HexColor('#486f96')

# ── Styles ──
body_ar = ParagraphStyle(
    'ArabicBody', fontName='WQY', fontSize=10.5, leading=18,
    alignment=TA_RIGHT, wordWrap='CJK', spaceAfter=6
)
body_en = ParagraphStyle(
    'EnglishBody', fontName='Carlito', fontSize=10.5, leading=17,
    alignment=TA_LEFT, spaceAfter=6
)
h1_style = ParagraphStyle(
    'H1', fontName='WQY', fontSize=20, leading=28,
    alignment=TA_RIGHT, textColor=ACCENT, spaceBefore=18, spaceAfter=12
)
h2_style = ParagraphStyle(
    'H2', fontName='WQY', fontSize=15, leading=22,
    alignment=TA_RIGHT, textColor=HEADER_FILL, spaceBefore=14, spaceAfter=8
)
h3_style = ParagraphStyle(
    'H3', fontName='WQY', fontSize=12, leading=18,
    alignment=TA_RIGHT, textColor=ICON, spaceBefore=10, spaceAfter=6
)
header_cell = ParagraphStyle(
    'HeaderCell', fontName='WQY', fontSize=9.5, leading=14,
    alignment=TA_CENTER, textColor=colors.white, wordWrap='CJK'
)
cell_style = ParagraphStyle(
    'Cell', fontName='WQY', fontSize=9, leading=13,
    alignment=TA_CENTER, wordWrap='CJK'
)
cell_left = ParagraphStyle(
    'CellLeft', fontName='WQY', fontSize=9, leading=13,
    alignment=TA_LEFT, wordWrap='CJK'
)
cell_right = ParagraphStyle(
    'CellRight', fontName='WQY', fontSize=9, leading=13,
    alignment=TA_RIGHT, wordWrap='CJK'
)
caption_style = ParagraphStyle(
    'Caption', fontName='WQY', fontSize=8.5, leading=13,
    alignment=TA_CENTER, textColor=TEXT_MUTED, spaceBefore=3, spaceAfter=12
)
grade_a = ParagraphStyle('GradeA', fontName='WQY', fontSize=9, leading=13, alignment=TA_CENTER, textColor=SEM_SUCCESS)
grade_b = ParagraphStyle('GradeB', fontName='WQY', fontSize=9, leading=13, alignment=TA_CENTER, textColor=SEM_INFO)
grade_c = ParagraphStyle('GradeC', fontName='WQY', fontSize=9, leading=13, alignment=TA_CENTER, textColor=SEM_WARNING)
grade_f = ParagraphStyle('GradeF', fontName='WQY', fontSize=9, leading=13, alignment=TA_CENTER, textColor=SEM_ERROR)

# ── Helpers ──
def P(text, style=body_ar):
    return Paragraph(text, style)

def make_table(headers, rows, col_widths=None):
    """Create a styled table with header row."""
    available = A4[0] - 2*inch
    if col_widths is None:
        n = len(headers)
        col_widths = [available / n] * n
    
    data = [[P(h, header_cell) for h in headers]]
    for row in rows:
        data.append([P(str(c), cell_style) for c in row])
    
    t = Table(data, colWidths=col_widths, hAlign='CENTER')
    style_cmds = [
        ('BACKGROUND', (0, 0), (-1, 0), HEADER_FILL),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('GRID', (0, 0), (-1, -1), 0.5, BORDER),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('LEFTPADDING', (0, 0), (-1, -1), 6),
        ('RIGHTPADDING', (0, 0), (-1, -1), 6),
        ('TOPPADDING', (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
    ]
    for i in range(1, len(data)):
        bg = colors.white if i % 2 == 1 else TABLE_STRIPE
        style_cmds.append(('BACKGROUND', (0, i), (-1, i), bg))
    t.setStyle(TableStyle(style_cmds))
    return t

def graded_table(headers, rows, grade_col=0, col_widths=None):
    """Table with colored grade column."""
    available = A4[0] - 2*inch
    if col_widths is None:
        n = len(headers)
        col_widths = [available / n] * n
    
    data = [[P(h, header_cell) for h in headers]]
    for row in rows:
        cells = []
        for i, c in enumerate(row):
            if i == grade_col:
                grade = str(c).strip()
                if grade in ('A', 'A+', 'A-'):
                    cells.append(P(grade, grade_a))
                elif grade in ('B', 'B+', 'B-'):
                    cells.append(P(grade, grade_b))
                elif grade in ('C', 'C+', 'C-'):
                    cells.append(P(grade, grade_c))
                else:
                    cells.append(P(grade, grade_f))
            else:
                cells.append(P(str(c), cell_style))
        data.append(cells)
    
    t = Table(data, colWidths=col_widths, hAlign='CENTER')
    style_cmds = [
        ('BACKGROUND', (0, 0), (-1, 0), HEADER_FILL),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('GRID', (0, 0), (-1, -1), 0.5, BORDER),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('LEFTPADDING', (0, 0), (-1, -1), 6),
        ('RIGHTPADDING', (0, 0), (-1, -1), 6),
        ('TOPPADDING', (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
    ]
    for i in range(1, len(data)):
        bg = colors.white if i % 2 == 1 else TABLE_STRIPE
        style_cmds.append(('BACKGROUND', (0, i), (-1, i), bg))
    t.setStyle(TableStyle(style_cmds))
    return t

# ── Build Document ──
output_path = '/home/z/my-project/download/roua_trading_evaluation.pdf'
doc = SimpleDocTemplate(
    output_path, pagesize=A4,
    leftMargin=1*inch, rightMargin=1*inch,
    topMargin=0.8*inch, bottomMargin=0.8*inch,
    title='Roua Trading Platform - Comprehensive Evaluation',
    author='Z.ai'
)

story = []
available = A4[0] - 2*inch

# ═══════════════════════════════════════════
# TITLE PAGE
# ═══════════════════════════════════════════
story.append(Spacer(1, 120))
story.append(P('<b>Roua Trading</b>', ParagraphStyle('Title', fontName='WQY', fontSize=36, leading=48, alignment=TA_CENTER, textColor=ACCENT)))
story.append(Spacer(1, 16))
story.append(P('Comprehensive Platform Evaluation', ParagraphStyle('Subtitle', fontName='Carlito', fontSize=18, leading=24, alignment=TA_CENTER, textColor=HEADER_FILL)))
story.append(Spacer(1, 30))
story.append(P('vs. Global Trading Analysis Platforms', ParagraphStyle('Sub2', fontName='Carlito', fontSize=14, leading=20, alignment=TA_CENTER, textColor=TEXT_MUTED)))
story.append(Spacer(1, 80))
story.append(P('2026', ParagraphStyle('Year', fontName='Carlito', fontSize=14, alignment=TA_CENTER, textColor=TEXT_MUTED)))
story.append(PageBreak())

# ═══════════════════════════════════════════
# SECTION 1: EXECUTIVE SUMMARY
# ═══════════════════════════════════════════
story.append(P('<b>1. Executive Summary</b>', h1_style))
story.append(P(
    'This report provides an honest, in-depth evaluation of the Roua Trading Smart Analysis Panel, '
    'comparing its features against the leading global trading analysis platforms including AutoChartist, '
    'TradingView, MetaTrader 5, TrendSpider, MotiveWave, and specialized tools like Scott Carney\'s HPC '
    'and Bookmap/Jigsaw. The evaluation covers algorithm quality, feature completeness, visual rendering, '
    'and identifies critical gaps that must be addressed to reach professional-grade quality.', body_en))
story.append(Spacer(1, 8))
story.append(P(
    'The platform demonstrates ambition and has several genuinely strong engines (ZigZag, Harmonic Patterns, '
    'BOS/CHoCH detection), but suffers from a significant gap between claimed features and actual implementation. '
    'Several "Revolutionary" engines are stub implementations that do not perform real analysis. The most critical '
    'issues are: fake Bayesian math, missing multi-timeframe analysis, incomplete Elliott Wave, and no pattern quality scoring.', body_en))

# ═══════════════════════════════════════════
# SECTION 2: FEATURE QUALITY GRADES
# ═══════════════════════════════════════════
story.append(Spacer(1, 12))
story.append(P('<b>2. Feature Quality Grades</b>', h1_style))
story.append(P(
    'Each feature was evaluated for algorithmic correctness, mathematical rigor, visual output quality, '
    'and comparison with best-in-class implementations. Grades: A = Professional quality, B = Functional but simplified, '
    'C = Partially working, F = Stub/fake (does not do what it claims).', body_en))

cw = [available*0.32, available*0.22, available*0.22, available*0.24]
story.append(graded_table(
    ['Feature', 'Grade', 'Best-in-Class', 'Gap Severity'],
    [
        ['ZigZag + Market Structure', 'A', 'AutoChartist', 'Minimal'],
        ['Harmonic Patterns (XABCD)', 'A-', 'HPC/MotiveWave', 'Small'],
        ['BOS/CHoCH Detection', 'A-', 'AutoChartist', 'Small'],
        ['FVG Detection', 'B+', 'AutoChartist', 'Moderate'],
        ['Candlestick Patterns', 'B', 'TradingView (30+)', 'Moderate'],
        ['Support/Resistance', 'B-', 'TrendSpider', 'Moderate'],
        ['Trend Line Detection', 'B-', 'TrendSpider', 'Large'],
        ['Classic Chart Patterns', 'B-', 'AutoChartist (15+)', 'Moderate'],
        ['Volume Profile (POC/VA)', 'B', 'Bookmap', 'Moderate'],
        ['SMC Order Blocks', 'B-', 'AutoChartist', 'Moderate'],
        ['Elliott Wave', 'C', 'MotiveWave', 'Very Large'],
        ['Wyckoff Analysis', 'F', 'None exists', 'Critical'],
        ['Bayesian Consensus', 'F', 'N/A', 'Critical (fake)'],
        ['Pattern State Machine', 'F', 'N/A', 'Critical (stub)'],
        ['Pattern Performance', 'F', 'AutoChartist', 'Critical (stub)'],
        ['Confidence Heatmap', 'F', 'N/A', 'Critical (fake)'],
        ['Audio Alerts', 'F', 'N/A', 'Critical (stub)'],
        ['Elliott+SMC Fusion', 'D', 'N/A', 'Large (hardcoded)'],
        ['Multi-Timeframe', 'F', 'TrendSpider', 'Critical (missing)'],
        ['Pattern Quality Scoring', 'F', 'AutoChartist', 'Critical (missing)'],
        ['Fibonacci Tools', 'F', 'MotiveWave', 'Critical (dead code)'],
        ['Risk/Position Sizing', 'C-', 'AutoChartist', 'Large'],
    ],
    grade_col=1, col_widths=cw
))
story.append(P('Table 1: Feature quality grades vs. best-in-class platforms', caption_style))

# ═══════════════════════════════════════════
# SECTION 3: MARKET COMPARISON
# ═══════════════════════════════════════════
story.append(P('<b>3. Market Comparison Matrix</b>', h1_style))
story.append(P(
    'The following comparison shows how Roua Trading stacks up against the seven leading platforms '
    'in the global market. Each cell indicates whether the feature is present and at what quality level. '
    'This matrix reveals that no single platform dominates all categories, which represents a significant '
    'opportunity for Roua Trading if it can genuinely deliver on its claimed feature set.', body_en))

cw2 = [available*0.18, available*0.13, available*0.13, available*0.13, available*0.14, available*0.14, available*0.15]
story.append(make_table(
    ['Capability', 'AutoChartist', 'TradingView', 'TrendSpider', 'MotiveWave', 'HPC/Carney', 'Roua'],
    [
        ['Chart Patterns', '15+ auto', '10+ auto', '10+ auto', 'Manual', 'No', '6 auto'],
        ['Harmonic Patterns', 'No', 'Scripts', 'Limited', '9+ auto', '9+ (original)', '4 auto'],
        ['Elliott Wave', 'No', 'Scripts', 'Limited', 'Best-in-class', 'No', 'Weak auto'],
        ['Quality Scoring', '6 metrics', 'No', 'Params', 'Ratio valid.', 'PRZ valid.', 'No'],
        ['Multi-Timeframe', 'Scan only', 'Full MTF', 'Best MTF', 'Full MTF', 'Single TF', 'No'],
        ['Volume Profile', 'No', 'Premium', 'Basic', 'Basic', 'No', 'Basic'],
        ['Candlestick', 'No', '30+ built-in', '30+ auto', 'No', 'No', '16 auto'],
        ['Fibonacci', '4 types', '7+ tools', 'Auto levels', '8+ tools', 'PRZ only', 'Dead code'],
        ['Risk Mgmt', 'Vol-based', 'Scripts', 'Alerts', 'Strategy', 'No', 'Basic ATR'],
        ['Backtesting', 'No', 'Pine Script', 'Strategy', 'Full', 'No', 'No'],
    ],
    col_widths=cw2
))
story.append(P('Table 2: Feature comparison across 7 platforms', caption_style))

# ═══════════════════════════════════════════
# SECTION 4: CRITICAL BUGS
# ═══════════════════════════════════════════
story.append(P('<b>4. Critical Bugs Found</b>', h1_style))

story.append(P('<b>4.1 ATR Calculation Error</b>', h2_style))
story.append(P(
    'The ATRAdapter uses Math.abs(high - low) instead of True Range for the main ATR calculation. '
    'True Range is defined as max(high-low, abs(high-prevClose), abs(low-prevClose)). On gap days '
    '(common in crypto and forex), this understates volatility by 20-50%, leading to incorrect SL/TP '
    'calculations. The adaptive TP/SL system also has a counterintuitive formula where higher confidence '
    'produces wider stop-losses, which is the opposite of professional trading practice.', body_en))

story.append(P('<b>4.2 Duplicate Detection Engines</b>', h2_style))
story.append(P(
    'Two independent detection engines exist for the same patterns. AISmartPanel runs detectSMC, '
    'detectElliottWaves, detectWyckoff, and detectGeometricPatterns, while overlay-renderer.ts runs '
    'its own independent detection via chart-detection.ts. These produce different results because they '
    'use different algorithms (e.g., SMCDetector FVG uses middle-candle validation, chart-detection FVG '
    'uses ATR filtering). This creates inconsistency and wastes computation.', body_en))

story.append(P('<b>4.3 Elliott Wave Price Bug</b>', h2_style))
story.append(P(
    'In chart-detection.ts, Wave 5 inherits Wave 4\'s price and time coordinates, making it visually '
    'identical to Wave 4 on the chart. This is a data assignment bug, not an algorithmic issue. Additionally, '
    'the Elliott detection always returns fixed confidence values (0.68 bullish, 0.65 bearish) regardless '
    'of pattern quality, making the confidence metric meaningless for this overlay.', body_en))

story.append(P('<b>4.4 Fibonacci Primitive Dead Code</b>', h2_style))
story.append(P(
    'A fully implemented FibonacciPrimitive (7 retracement levels with labels) exists in chart-primitives.ts '
    'but is never instantiated by any overlay. This is one of the most professionally expected features in '
    'trading analysis (every platform from TradingView to MetaTrader has Fibonacci tools), and the code is '
    'ready but simply unused. Enabling it would be a quick win.', body_en))

# ═══════════════════════════════════════════
# SECTION 5: FAKE ENGINES
# ═══════════════════════════════════════════
story.append(P('<b>5. "Revolutionary" Engines: Reality Check</b>', h1_style))
story.append(P(
    'The codebase labels seven engines as "Revolutionary," but audit reveals that five of them are stubs '
    'or fake implementations. This is the most serious credibility issue: users who rely on these "engines" '
    'for trading decisions are being misled. The Bayesian Consensus, for example, claims to use Bayesian '
    'probability theory but actually performs a simple weighted average with no prior/posterior computation.', body_en))

story.append(graded_table(
    ['Engine', 'Claimed', 'Actually Does', 'Grade'],
    [
        ['Bayesian Consensus', 'Bayesian probability fusion', 'Weighted average, no Bayes theorem', 'F'],
        ['Pattern State Machine', 'Lifecycle: forming to failed', 'Counts patterns, returns empty alerts', 'F'],
        ['Pattern Performance', 'Historical win-rate tracking', 'record() is no-op, getSummary() is empty', 'F'],
        ['Confidence Heatmap', 'Confidence visualization', 'Assigns 0.3 to every candle', 'F'],
        ['Audio Alerts', 'Voice announcements', 'Both methods are empty stubs', 'F'],
        ['Elliott+SMC Fusion', 'Confluence analysis', 'Hardcoded point system (60+50+70+40)', 'D'],
        ['ATR Adapter', 'Adaptive TP/SL + regime', 'Partial: wrong True Range formula', 'C-'],
    ],
    grade_col=3,
    col_widths=[available*0.20, available*0.25, available*0.35, available*0.20]
))
story.append(P('Table 3: Revolutionary engines — claimed vs. actual implementation', caption_style))

# ═══════════════════════════════════════════
# SECTION 6: MISSING FEATURES
# ═══════════════════════════════════════════
story.append(P('<b>6. Critical Missing Features</b>', h1_style))
story.append(P(
    'Based on the market comparison, professional trader expectations, and AutoChartist (the industry '
    'standard) feature set, the following features are either completely missing or so inadequate that '
    'they need complete reimplementation. These are ranked by impact on professional usability.', body_en))

story.append(P('<b>6.1 Pattern Quality Scoring (Critical)</b>', h2_style))
story.append(P(
    'AutoChartist\'s #1 differentiator is its 6-metric quality rating system (Initial Trend, Uniformity, '
    'Clarity, Breakout, Volume, Overall Quality) on a 1-10 scale. Roua has NO quality scoring at all. '
    'Most patterns use fixed confidence values (0.65, 0.68, 0.75) regardless of actual pattern quality. '
    'This means a clean Gartley with perfect Fibonacci ratios gets the same score as a noisy one with '
    'loose ratios. Professional traders will not trust a tool that cannot distinguish good patterns from bad ones.', body_en))

story.append(P('<b>6.2 Multi-Timeframe Analysis (Critical)</b>', h2_style))
story.append(P(
    'Every professional trading decision requires higher-timeframe context. TrendSpider is the market '
    'leader with native MTF overlay (plot daily EMA on 5-min chart). TradingView has full MTF support. '
    'Roua currently has ZERO multi-timeframe capability — all detection runs on a single timeframe. '
    'When switching timeframes, overlays from the previous timeframe accumulate (a recently fixed bug), '
    'but there is no mechanism to show how a 4H harmonic pattern relates to a 15M entry.', body_en))

story.append(P('<b>6.3 Fibonacci Tools (Critical)</b>', h2_style))
story.append(P(
    'Fibonacci tools are the #1 most-used manual drawing tool in trading. MotiveWave offers 8+ Fibonacci '
    'types (retracement, extension, projection, time ratios, spirals). TradingView has 7+ Fibonacci tools. '
    'MetaTrader has 5+. Roua has a fully coded FibonacciPrimitive that is NEVER USED. Additionally, the '
    'codebase lacks Fibonacci time zones and Fibonacci fan tools entirely. The harmonic pattern PRZ zones '
    'are the only Fibonacci-related feature currently active.', body_en))

story.append(P('<b>6.4 Elliott Wave (Major Gap)</b>', h2_style))
story.append(P(
    'MotiveWave provides professional Elliott Wave analysis with all wave degrees (Grand Supercycle to '
    'Subminuette), automatic wave counting, Fibonacci ratio validation between waves, and ABC correction '
    'patterns. Roua\'s Elliott implementation is extremely simplified: it only detects 5-wave impulse patterns, '
    'often falls back to a 3-wave pattern, has no ABC correction detection, and uses fixed confidence values. '
    'The detection requires wave3 to be the longest wave, which is too rigid for real markets where wave 5 '
    'extensions are common.', body_en))

story.append(P('<b>6.5 Real Wyckoff Method (Major Gap)</b>', h2_style))
story.append(P(
    'The current Wyckoff implementation is not real Wyckoff analysis. It uses three simple heuristics '
    '(price position in range, slope, volume ratio) to assign one of four phases (Accumulation, Markup, '
    'Distribution, Markdown). Real Wyckoff method identifies specific events (Spring, Upthrust, Sign of '
    'Strength, Sign of Weakness, Last Point of Support) and requires multi-timeframe analysis to determine '
    'the market phase. The current implementation should either be replaced with proper Wyckoff event detection '
    'or honestly relabeled as "Market Phase Estimation" to avoid misleading users.', body_en))

story.append(P('<b>6.6 Backtesting and Performance Tracking (Major)</b>', h2_style))
story.append(P(
    'AutoChartist provides historical hit-rate statistics per completed pattern type. TradingView has a full '
    'Strategy Tester. MotiveWave has comprehensive backtesting. Roua has a PatternPerformanceTracker that is '
    'entirely a stub — record() does nothing, getSummary() returns empty data. Without backtesting, users '
    'cannot validate which patterns actually work, making the entire analysis system unreliable for real trading.', body_en))

# ═══════════════════════════════════════════
# SECTION 7: WHAT WORKS WELL
# ═══════════════════════════════════════════
story.append(P('<b>7. What Works Well</b>', h1_style))
story.append(P(
    'Despite the gaps, several engines demonstrate genuine professional quality. These should be '
    'preserved and built upon rather than replaced:', body_en))

story.append(P('<b>7.1 ZigZag Algorithm (A grade)</b>', h2_style))
story.append(P(
    'The computeZigZag function in chart-detection.ts uses ATR-adaptive thresholds with a proper 2.0x '
    'multiplier and a state machine (UP/DOWN/UNKNOWN). This is the correct professional approach used by '
    'AutoChartist and is significantly better than the fixed-percentage ZigZag found in most retail tools. '
    'It correctly identifies swing highs and lows, which form the foundation for all other pattern detection.', body_en))

story.append(P('<b>7.2 Harmonic Pattern Detection (A- grade)</b>', h2_style))
story.append(P(
    'ProfessionalHarmonicPatterns.ts uses ATR-based pivot detection (0.3x ATR minimum deviation) which '
    'adapts to volatility, proper Fibonacci ratio validation with 8% tolerance, and variable confidence '
    'based on ratio precision. This is close to HPC/Scott Carney quality and is one of the platform\'s '
    'strongest features. The main improvement needed is tighter tolerance options and more pattern types '
    '(Shark, 5-0, Alternate Bat, Deep Crab).', body_en))

story.append(P('<b>7.3 Overlay Primitive System (A grade)</b>', h2_style))
story.append(P(
    'The ISeriesPrimitive-based overlay system is architecturally correct for lightweight-charts v5. '
    'The primitives (TrendLinePrimitive, HorizontalLinePrimitive, ZonePrimitive, LabelPrimitive, '
    'AlertMarkerPrimitive) are well-implemented with proper coordinate conversion, z-ordering, and visual '
    'styling. The AlertMarkerPrimitive with pulse animation and confidence bar is particularly sophisticated. '
    'The OverlayRegistry lifecycle management (prepareRedraw, clearType, clearAll) is properly designed.', body_en))

story.append(P('<b>7.4 BOS/CHoCH Detection (A- grade)</b>', h2_style))
story.append(P(
    'The detectBOS function correctly distinguishes between Break of Structure (same-direction break '
    'confirming trend continuation) and Change of Character (counter-direction break indicating reversal). '
    'It uses close-based break validation (not wick-based, which is the correct professional approach) and '
    'deduplicates by price level to avoid clutter. This matches the SMC methodology taught by ICT.', body_en))

# ═══════════════════════════════════════════
# SECTION 8: RECOMMENDATIONS
# ═══════════════════════════════════════════
story.append(P('<b>8. Priority Recommendations</b>', h1_style))
story.append(P(
    'Based on impact vs. effort analysis, here are the recommended fixes ranked by priority. '
    'Each recommendation includes estimated effort and expected impact on professional usability.', body_en))

cw3 = [available*0.06, available*0.26, available*0.30, available*0.14, available*0.24]
story.append(make_table(
    ['#', 'Recommendation', 'Details', 'Effort', 'Impact'],
    [
        ['1', 'Fix fake engines or remove them', 'Remove Bayesian, State Machine, Performance, Heatmap, Audio stubs. Replace with honest "Coming Soon" labels', 'Low', 'Credibility'],
        ['2', 'Add Pattern Quality Scoring', 'Implement AutoChartist-style 4-metric scoring (Trend, Clarity, Uniformity, Breakout)', 'Medium', 'Professional trust'],
        ['3', 'Enable Fibonacci Primitive', 'Connect existing FibonacciPrimitive code to overlay renderer. Add retracement + extension', 'Low', 'Quick win'],
        ['4', 'Fix ATR calculation', 'Replace abs(high-low) with True Range. Fix SL/TP formula (higher conf = tighter SL)', 'Low', 'Risk accuracy'],
        ['5', 'Fix Elliott Wave', 'Add ABC correction, wave degree labels, remove fixed confidence, fix Wave 5 price bug', 'Medium', 'Elliott traders'],
        ['6', 'Consolidate detection engines', 'Remove duplicate SMC/Elliott/Wyckoff detection from AISmartPanel, use chart-detection.ts only', 'Medium', 'Consistency'],
        ['7', 'Add Multi-Timeframe Analysis', 'Show HTF patterns on LTF chart. Require async data fetching for multiple timeframes', 'High', 'Professional must-have'],
        ['8', 'Reimplement Wyckoff properly', 'Detect Spring, Upthrust, SOS, SOW events. Use volume spread analysis', 'High', 'Wyckoff traders'],
        ['9', 'Add Backtesting Framework', 'Track pattern completion -> outcome. Calculate win rate per pattern type', 'High', 'Validation'],
        ['10', 'Add more Harmonic patterns', 'Shark, 5-0, Alternate Bat, Deep Crab with Scott Carney original ratios', 'Medium', 'Comprehensiveness'],
    ],
    col_widths=cw3
))
story.append(P('Table 4: Priority recommendations ranked by impact', caption_style))

# ═══════════════════════════════════════════
# SECTION 9: COMPETITIVE POSITION
# ═══════════════════════════════════════════
story.append(P('<b>9. Competitive Position Assessment</b>', h1_style))
story.append(P(
    'The unique value proposition of Roua Trading is the combination of multiple analysis methodologies '
    '(Harmonic + Elliott + SMC + Wyckoff + Bayesian) in a single web-based platform. No other platform '
    'combines all these approaches. However, this advantage is undermined when most of these methodologies '
    'are poorly implemented or fake. The competitive position can be summarized as follows:', body_en))

story.append(P(
    'Current state: Roua Trading is a "wide but shallow" platform. It claims 7+ analysis methodologies '
    'but only 3 of them (ZigZag/Market Structure, Harmonic Patterns, BOS/CHoCH) are genuinely professional '
    'quality. The platform would be more credible with 3-4 well-implemented engines than 7+ where half are fake.', body_en))

story.append(P(
    'Target state: If the 10 recommendations above are implemented, Roua Trading would be the only web-based '
    'platform that combines AutoChartist-level pattern detection with Harmonic patterns, SMC analysis, and '
    'basic Elliott Wave in a single interface. This would be a genuinely differentiated product in the market, '
    'especially for crypto traders who currently lack integrated analysis tools.', body_en))

story.append(P(
    'The biggest risk is credibility loss: if users discover that the "Bayesian Consensus" is just a '
    'weighted average, or that "Pattern Performance Tracking" returns empty data, they will distrust ALL '
    'analysis outputs, including the genuinely good ones. Honest labeling (e.g., "Basic Signal" instead of '
    '"Bayesian Consensus") would preserve trust while improvements are developed.', body_en))

# ═══════════════════════════════════════════
# SECTION 10: CONCLUSION
# ═══════════════════════════════════════════
story.append(P('<b>10. Conclusion</b>', h1_style))
story.append(P(
    'Roua Trading has a solid architectural foundation and several genuinely strong analysis engines. '
    'The ZigZag, Harmonic, and BOS/CHoCH implementations are professional quality. The ISeriesPrimitive '
    'overlay system is well-designed. The platform\'s ambition to combine multiple methodologies is its '
    'greatest strength and greatest risk.', body_en))

story.append(P(
    'The most urgent action is to address the credibility gap: remove or honestly relabel the five fake '
    'engines (Bayesian, State Machine, Performance, Heatmap, Audio) before users lose trust in the entire '
    'platform. Then focus on the quick wins (Fibonacci activation, ATR fix, Elliott Wave fix) before '
    'tackling the larger projects (Multi-Timeframe, Wyckoff, Backtesting).', body_en))

story.append(P(
    'With disciplined execution of the 10 recommendations, Roua Trading has the potential to become the '
    'first web-based platform that genuinely integrates Harmonic + SMC + Elliott + Wyckoff analysis — '
    'a product that does not exist in today\'s market. But this potential will only be realized if every '
    'feature that ships actually works as claimed. Quality over quantity, always.', body_en))

# ── Build ──
doc.build(story)
print(f'Report generated: {output_path}')
print(f'File size: {os.path.getsize(output_path):,} bytes')
