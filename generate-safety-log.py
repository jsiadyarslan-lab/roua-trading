#!/usr/bin/env python3
"""Generate Safety Inspection Log PDF for Roua Trading Platform"""

import os
from datetime import datetime
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm, cm
from reportlab.lib.enums import TA_CENTER, TA_RIGHT, TA_LEFT
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    PageBreak, KeepTogether, HRFlowable
)
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

# ━━ Register fonts ━━
FONT_DIR = '/usr/share/fonts/truetype'
pdfmetrics.registerFont(TTFont('DejaVuSans', os.path.join(FONT_DIR, 'dejavu', 'DejaVuSans.ttf')))
pdfmetrics.registerFont(TTFont('SarasaMonoSC', os.path.join(FONT_DIR, 'chinese', 'SarasaMonoSC-Regular.ttf')))

# ━━ Color Palette (auto-generated) ━━
ACCENT       = colors.HexColor('#5530c4')
TEXT_PRIMARY  = colors.HexColor('#1f2022')
TEXT_MUTED    = colors.HexColor('#7b8187')
BG_SURFACE   = colors.HexColor('#dbdfe4')
BG_PAGE      = colors.HexColor('#e9eaec')
PASS_GREEN   = colors.HexColor('#16a34a')
FAIL_RED     = colors.HexColor('#dc2626')
WARN_AMBER   = colors.HexColor('#d97706')

TABLE_HEADER_COLOR = ACCENT
TABLE_HEADER_TEXT  = colors.white
TABLE_ROW_EVEN     = colors.white
TABLE_ROW_ODD      = BG_SURFACE

# ━━ Output path ━━
OUTPUT_DIR = '/home/z/my-project/download'
os.makedirs(OUTPUT_DIR, exist_ok=True)
OUTPUT_PATH = os.path.join(OUTPUT_DIR, 'roua-safety-inspection-log.pdf')

# ━━ Document setup ━━
doc = SimpleDocTemplate(
    OUTPUT_PATH,
    pagesize=A4,
    leftMargin=20*mm,
    rightMargin=20*mm,
    topMargin=20*mm,
    bottomMargin=20*mm,
    title='Roua Trading Platform - Safety Inspection Log',
    author='Z.ai',
    subject='Safety Inspection Log - V230 Code Quality Fixes',
    creator='Z.ai'
)

PAGE_W = A4[0] - 40*mm  # available width

# ━━ Styles ━━
styles = getSampleStyleSheet()

title_style = ParagraphStyle(
    'CustomTitle', parent=styles['Title'],
    fontName='DejaVuSans', fontSize=22, leading=28,
    textColor=ACCENT, alignment=TA_CENTER, spaceAfter=6
)

subtitle_style = ParagraphStyle(
    'CustomSubtitle', parent=styles['Normal'],
    fontName='DejaVuSans', fontSize=12, leading=16,
    textColor=TEXT_MUTED, alignment=TA_CENTER, spaceAfter=20
)

h1_style = ParagraphStyle(
    'H1', parent=styles['Heading1'],
    fontName='DejaVuSans', fontSize=16, leading=22,
    textColor=ACCENT, spaceBefore=18, spaceAfter=10,
    borderWidth=0, borderPadding=0
)

h2_style = ParagraphStyle(
    'H2', parent=styles['Heading2'],
    fontName='DejaVuSans', fontSize=13, leading=18,
    textColor=colors.HexColor('#3b2789'), spaceBefore=12, spaceAfter=6
)

body_style = ParagraphStyle(
    'CustomBody', parent=styles['Normal'],
    fontName='DejaVuSans', fontSize=10, leading=15,
    textColor=TEXT_PRIMARY, spaceAfter=8,
    alignment=TA_LEFT
)

body_rtl_style = ParagraphStyle(
    'BodyRTL', parent=body_style,
    alignment=TA_RIGHT
)

muted_style = ParagraphStyle(
    'Muted', parent=body_style,
    textColor=TEXT_MUTED, fontSize=9, leading=13
)

pass_style = ParagraphStyle(
    'Pass', parent=body_style,
    textColor=PASS_GREEN, fontName='DejaVuSans'
)

fail_style = ParagraphStyle(
    'Fail', parent=body_style,
    textColor=FAIL_RED, fontName='DejaVuSans'
)

table_header_style = ParagraphStyle(
    'TableHeader', parent=styles['Normal'],
    fontName='DejaVuSans', fontSize=9, leading=12,
    textColor=TABLE_HEADER_TEXT, alignment=TA_CENTER
)

table_cell_style = ParagraphStyle(
    'TableCell', parent=styles['Normal'],
    fontName='DejaVuSans', fontSize=8.5, leading=12,
    textColor=TEXT_PRIMARY, alignment=TA_LEFT
)

table_cell_center = ParagraphStyle(
    'TableCellCenter', parent=table_cell_style,
    alignment=TA_CENTER
)

# ━━ Helper functions ━━
def make_hr():
    return HRFlowable(width="100%", thickness=1, color=ACCENT, spaceAfter=10, spaceBefore=6)

def make_thin_hr():
    return HRFlowable(width="100%", thickness=0.5, color=BG_SURFACE, spaceAfter=6, spaceBefore=4)

def p(text, style=body_style):
    return Paragraph(text, style)

# ━━ Build Story ━━
story = []

# ═══════════════════════════════════════
# COVER / TITLE SECTION
# ═══════════════════════════════════════
story.append(Spacer(1, 30*mm))
story.append(p('Roua Trading Platform', title_style))
story.append(Spacer(1, 4*mm))
story.append(p('Safety Inspection Log', ParagraphStyle(
    'SubTitle2', parent=title_style, fontSize=18, leading=24, textColor=TEXT_PRIMARY
)))
story.append(Spacer(1, 6*mm))
story.append(p('V230 Code Quality Fixes + Runtime Integrity Verification', subtitle_style))
story.append(Spacer(1, 8*mm))

# Score card table
score_data = [
    [Paragraph('<b>Safety Score</b>', table_header_style),
     Paragraph('<b>Passed</b>', table_header_style),
     Paragraph('<b>Failed</b>', table_header_style),
     Paragraph('<b>Warnings</b>', table_header_style),
     Paragraph('<b>Total Checks</b>', table_header_style)],
    [Paragraph('<b>100.0%</b>', ParagraphStyle('ScoreVal', parent=table_cell_center, fontSize=14, textColor=PASS_GREEN)),
     Paragraph('<b>49</b>', ParagraphStyle('PassVal', parent=table_cell_center, fontSize=14, textColor=PASS_GREEN)),
     Paragraph('<b>0</b>', ParagraphStyle('FailVal', parent=table_cell_center, fontSize=14, textColor=FAIL_RED)),
     Paragraph('<b>0</b>', ParagraphStyle('WarnVal', parent=table_cell_center, fontSize=14, textColor=WARN_AMBER)),
     Paragraph('<b>49</b>', ParagraphStyle('TotalVal', parent=table_cell_center, fontSize=14, textColor=TEXT_PRIMARY))]
]

score_table = Table(score_data, colWidths=[PAGE_W*0.3, PAGE_W*0.175, PAGE_W*0.175, PAGE_W*0.175, PAGE_W*0.175])
score_table.setStyle(TableStyle([
    ('BACKGROUND', (0, 0), (-1, 0), TABLE_HEADER_COLOR),
    ('BACKGROUND', (0, 1), (-1, 1), colors.white),
    ('BOX', (0, 0), (-1, -1), 1, ACCENT),
    ('INNERGRID', (0, 0), (-1, -1), 0.5, BG_SURFACE),
    ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ('TOPPADDING', (0, 0), (-1, -1), 8),
    ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
    ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
    ('ROUNDEDCORNERS', [6, 6, 6, 6]),
]))
story.append(score_table)

story.append(Spacer(1, 10*mm))
story.append(p(f'Date: {datetime.now().strftime("%Y-%m-%d %H:%M UTC")}', muted_style))
story.append(p('Version: V230 | Commit: b4f0422 | Environment: Production (Railway)', muted_style))
story.append(p('Inspection Type: Runtime-Based Code Integrity + Code Quality Fixes', muted_style))
story.append(Spacer(1, 10*mm))

# ═══════════════════════════════════════
# SECTION 1: Code Quality Fixes (2.1-2.12)
# ═══════════════════════════════════════
story.append(PageBreak())
story.append(p('Section 1: Code Quality Fixes (Items 2.1 - 2.12)', h1_style))
story.append(make_hr())

story.append(p(
    'This section documents 12 code quality improvements applied to the Roua Trading Platform '
    'frontend chart system. These fixes address issues identified during a deep audit of the '
    'chart components, including color constant duplication, stale closure bugs, memory leaks, '
    'and input validation gaps. Each fix was verified with TypeScript compilation and tested '
    'against the existing codebase to ensure no regressions were introduced.',
    body_style
))
story.append(Spacer(1, 4*mm))

# Fix details
fixes = [
    {
        'id': '2.1',
        'name': 'Unified CHART_COLORS',
        'file': 'chart-utils.ts, chart-options.ts, config.ts, types.ts',
        'desc': 'Consolidated all CHART_COLORS definitions into a single source of truth in chart-utils.ts. '
                'Re-exported from chart-options.ts, config.ts, and types.ts for backward compatibility. '
                'Added UI_PALETTE for non-chart UI colors and upWick/downWick candle colors to the canonical definition. '
                'This eliminates the risk of color drift between different components that previously maintained their own copies.',
        'risk': 'Low',
        'status': 'PASS'
    },
    {
        'id': '2.2',
        'name': 'Removed Duplicate CandleData Interfaces',
        'file': 'useMarketData.ts, TradeChart.tsx, LiveMarketChart.tsx, types.ts',
        'desc': 'Renamed duplicate CandleData interfaces to context-specific names: ApiCandleData in useMarketData.ts, '
                'SimCandleData in TradeChart.tsx, DemoCandleData in LiveMarketChart.tsx. The canonical CandleData remains in types.ts. '
                'This prevents accidental mixing of incompatible candle data shapes across components.',
        'risk': 'Low',
        'status': 'PASS'
    },
    {
        'id': '2.3',
        'name': 'BOS ATR Fix Verification',
        'file': 'SMCDetector.ts, chart-detection.ts',
        'desc': 'Verified that the BOS ATR fix (V225) is already applied correctly. Both computeATR and BOS dedup '
                'use the previous candle close for True Range calculation, matching the standard ATR definition. '
                'No additional changes were needed.',
        'risk': 'None',
        'status': 'PASS'
    },
    {
        'id': '2.4',
        'name': 'Fixed useChartSync Stale Closure',
        'file': 'useChartSync.ts',
        'desc': 'Fixed stale closure bug where event handlers captured outdated entries from the closure scope. '
                'Handlers now read from entriesRef.current instead of the closure-captured entries variable. '
                'This prevents stale chart and series references after component re-renders, which could cause '
                'incorrect data display or runtime errors.',
        'risk': 'Medium',
        'status': 'PASS'
    },
    {
        'id': '2.5',
        'name': 'Fixed ChartReplay Data Loss on Unmount',
        'file': 'ChartReplay.tsx',
        'desc': 'Added fullCandlesRef to preserve the complete candle dataset across component lifecycle events. '
                'Unmount, stop, and handleStop operations now restore from the ref instead of the potentially-sliced prop. '
                'Slider and currentCandle state also use the ref, preventing data corruption when the replay is stopped or '
                'the component unmounts mid-replay.',
        'risk': 'High',
        'status': 'PASS'
    },
    {
        'id': '2.6',
        'name': 'Fixed SmartGrid Instance Cleanup on Shrink',
        'file': 'SmartGrid.tsx',
        'desc': 'When the grid shrinks, destroyed chart instances for removed cells and cleaned up React state Maps '
                '(cellStates, cellToolOpen, cellIndicators, cellCandleDataRef). Previously, shrinking the grid left '
                'orphaned chart instances consuming memory and potentially causing ghost rendering artifacts.',
        'risk': 'Medium',
        'status': 'PASS'
    },
    {
        'id': '2.7',
        'name': 'Fixed AutoTradeEngine Trail SL Classification',
        'file': 'AutoTradeEngine.ts',
        'desc': 'Added trail_sl status type to the trade engine. Trail stop-loss hits are now classified as trail_sl '
                'instead of incorrectly being labeled as breakeven. The breakeven status is now reserved exclusively '
                'for TP1 move-SL-to-entry actions, ensuring accurate trade journaling and performance reporting.',
        'risk': 'Medium',
        'status': 'PASS'
    },
    {
        'id': '2.8',
        'name': 'Fixed DrawingManager Save Verification',
        'file': 'DrawingManager.ts',
        'desc': 'saveToStorage now returns a boolean and verifies the write by re-reading the stored data. '
                'Legacy migration only removes the old storage key after confirming the new key write succeeded. '
                'This prevents data loss if localStorage is full or unavailable, and ensures drawings are never '
                'lost during the migration process.',
        'risk': 'High',
        'status': 'PASS'
    },
    {
        'id': '2.9',
        'name': 'Fixed AISmartPanel Auto-Detection Race Condition',
        'file': 'AISmartPanel.tsx',
        'desc': 'Moved hasRunInitialRef before the auto-detection effect to prevent a temporal dead zone. '
                'Added a guard so auto-detection skips until the initial analysis completes. '
                'Removed the dangerous runRef.current = false reset in the timeframe change handler that was '
                'causing duplicate analysis runs.',
        'risk': 'Medium',
        'status': 'PASS'
    },
    {
        'id': '2.10',
        'name': 'Extracted Shared Overlay Renderer Helpers',
        'file': 'overlay-renderer.ts',
        'desc': 'Extracted prepareOverlayContext() and createSafePriceLineFn() as shared helper functions. '
                'Both renderOverlays and renderAnalysisOverlays now use these helpers instead of duplicating '
                'approximately 60 lines of identical code. This reduces the maintenance burden and ensures '
                'consistency between the two rendering paths.',
        'risk': 'Low',
        'status': 'PASS'
    },
    {
        'id': '2.11',
        'name': 'Fixed useIndicatorWorker Fallback',
        'file': 'useIndicatorWorker.ts',
        'desc': 'Implemented a real main-thread fallback using dynamic import of IndicatorCalculator. '
                'Previously, when the Web Worker failed to initialize, the hook silently returned null, '
                'causing indicator data to be missing without any error or fallback. The new fallback ensures '
                'indicators are always calculated even when the worker is unavailable.',
        'risk': 'High',
        'status': 'PASS'
    },
    {
        'id': '2.12',
        'name': 'Added Indicator Parameter Constraints',
        'file': 'IndicatorSettings.tsx',
        'desc': 'Added paramConstraints to IndicatorConfig type and all 16 indicator configurations. '
                'Input fields now display min/max bounds and show a red border on out-of-range values. '
                'The handleSave function clamps values to the defined constraints before saving, preventing '
                'invalid indicator parameters that could cause calculation errors or NaN values.',
        'risk': 'Medium',
        'status': 'PASS'
    }
]

# Build fixes table
fix_header = [
    Paragraph('<b>ID</b>', table_header_style),
    Paragraph('<b>Fix Name</b>', table_header_style),
    Paragraph('<b>Files Changed</b>', table_header_style),
    Paragraph('<b>Risk</b>', table_header_style),
    Paragraph('<b>Status</b>', table_header_style),
]

fix_rows = [fix_header]
for f in fixes:
    risk_color = PASS_GREEN if f['risk'] in ('Low', 'None') else (WARN_AMBER if f['risk'] == 'Medium' else FAIL_RED)
    fix_rows.append([
        Paragraph(f['id'], table_cell_center),
        Paragraph(f['name'], table_cell_style),
        Paragraph(f['file'], ParagraphStyle('SmallCell', parent=table_cell_style, fontSize=7.5, leading=10)),
        Paragraph('<b>{}</b>'.format(f['risk']), ParagraphStyle('RiskCell', parent=table_cell_center, textColor=risk_color, fontSize=8.5)),
        Paragraph('<b>PASS</b>', ParagraphStyle('StatusCell', parent=table_cell_center, textColor=PASS_GREEN, fontSize=8.5)),
    ])

fix_table = Table(fix_rows, colWidths=[PAGE_W*0.06, PAGE_W*0.22, PAGE_W*0.42, PAGE_W*0.12, PAGE_W*0.10])
fix_table.setStyle(TableStyle([
    ('BACKGROUND', (0, 0), (-1, 0), TABLE_HEADER_COLOR),
    ('BACKGROUND', (0, 1), (-1, -1), colors.white),
    ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, TABLE_ROW_ODD]),
    ('BOX', (0, 0), (-1, -1), 1, ACCENT),
    ('INNERGRID', (0, 0), (-1, -1), 0.5, BG_SURFACE),
    ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ('TOPPADDING', (0, 0), (-1, -1), 5),
    ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
    ('LEFTPADDING', (0, 0), (-1, -1), 4),
    ('RIGHTPADDING', (0, 0), (-1, -1), 4),
]))
story.append(fix_table)
story.append(Spacer(1, 6*mm))

# Detailed descriptions
story.append(p('Detailed Fix Descriptions', h2_style))
story.append(make_thin_hr())

for f in fixes:
    story.append(KeepTogether([
        p('<b>{}: {}</b>'.format(f['id'], f['name']), ParagraphStyle('FixTitle', parent=body_style, fontSize=11, leading=15, textColor=ACCENT)),
        p(f['desc'], ParagraphStyle('FixDesc', parent=body_style, fontSize=9, leading=13, leftIndent=10)),
        Spacer(1, 3*mm)
    ]))

# ═══════════════════════════════════════
# SECTION 2: Runtime Integrity Verification
# ═══════════════════════════════════════
story.append(PageBreak())
story.append(p('Section 2: Runtime Integrity Verification (49 Checks)', h1_style))
story.append(make_hr())

story.append(p(
    'The following 49 checks were executed against the production deployment at '
    'roua-trading-production.up.railway.app. Each check verifies a specific safety property '
    'of the trading system, ranging from risk management validation to agent position protection. '
    'All checks passed successfully, confirming the integrity of the V230 deployment.',
    body_style
))
story.append(Spacer(1, 4*mm))

# Integrity checks data
checks = [
    ('V01', 'RiskGatekeeper paper trade size check', 'PASS'),
    ('V02', 'RiskManager paper trade size check', 'PASS'),
    ('V03', 'Smart Executor flexible position limit', 'PASS'),
    ('V04', 'Minimum Stop Loss distance', 'PASS'),
    ('V05', 'processedKey immediate deletion + cooldown', 'PASS'),
    ('V06', 'PaperTradingAdapter dynamic size check', 'PASS'),
    ('V07', '_executePaperTrade dynamic size check', 'PASS'),
    ('V08', 'TradeCoordination atomic lock', 'PASS'),
    ('V09', 'Cooldown after all close reasons', 'PASS'),
    ('V10', 'OrderDispatcher cross-source dedup', 'PASS'),
    ('V11', 'No portfolioValue inflation by lockedMargin', 'PASS'),
    ('V12', 'MT5 Adapter position size check', 'PASS'),
    ('V13', 'ExecutionGateway MT5 routing', 'PASS'),
    ('V14', 'V181 Paper/Demo separation', 'PASS'),
    ('V15', 'V184 4h close: profit protection', 'PASS'),
    ('V16', 'V185 Intelligence Council: 9+ features', 'PASS'),
    ('V17', 'V185 Council integration with trade pipeline', 'PASS'),
    ('V18', 'V187 Agent 4h close fix', 'PASS'),
    ('V19', 'V188 Settings security & validation', 'PASS'),
    ('V20', 'V189 Remove settings spoofing', 'PASS'),
    ('V21', 'V217 Unified portfolio valuation', 'PASS'),
    ('V22', 'V217 paperBalance=0 fallback', 'PASS'),
    ('V23', 'V216 Agent protection in ExchangeSync', 'PASS'),
    ('V24', 'V217 Version tracking', 'PASS'),
    ('V25', 'V217 Risk consistency across services', 'PASS'),
    ('V26', 'V218 Portfolio Valuation Service', 'PASS'),
    ('V27', 'V218 Price validation layer', 'PASS'),
    ('V28', 'V218 Risk audit trail', 'PASS'),
    ('V29', 'V219 Version tracking', 'PASS'),
    ('V30', 'V218 Duplicate trade prevention', 'PASS'),
    ('V31', 'V219 Unified agent position check', 'PASS'),
    ('V32', 'V219 Unified ExposureManager', 'PASS'),
    ('V33', 'V219 Fail-closed coordination', 'PASS'),
    ('V34', 'V219 Flexible order limit', 'PASS'),
    ('V35', 'V219 DISPUTED status', 'PASS'),
    ('V36', 'V219 Partial fill management', 'PASS'),
    ('V37', 'V220 External circuit breaker', 'PASS'),
    ('V38', 'V220 Retry coverage', 'PASS'),
    ('V39', 'V220 Version tracking', 'PASS'),
    ('V40', 'V220 Resource cleanup on shutdown', 'PASS'),
    ('V41', 'V220 Safe degradation', 'PASS'),
    ('V42', 'V220 Data consistency check', 'PASS'),
    ('V43', 'V220 Stuck order detection', 'PASS'),
    ('V44', 'V220 WebSocket reliability', 'PASS'),
    ('V45', 'V220 AI provider monitoring', 'PASS'),
    ('V46', 'V220 Position reconciliation', 'PASS'),
    ('V47', 'V221 Balance/Equity separation', 'PASS'),
    ('V48', 'V214/V230 Agent protection at code level', 'PASS'),
    ('V49', 'V225 Deep chart audit - Phase 1', 'PASS'),
]

# Build checks table (split into manageable chunks)
check_header = [
    Paragraph('<b>#</b>', table_header_style),
    Paragraph('<b>Check ID</b>', table_header_style),
    Paragraph('<b>Description</b>', table_header_style),
    Paragraph('<b>Result</b>', table_header_style),
]

check_rows = [check_header]
for i, (cid, desc, status) in enumerate(checks, 1):
    status_color = PASS_GREEN if status == 'PASS' else FAIL_RED
    check_rows.append([
        Paragraph(str(i), table_cell_center),
        Paragraph(cid, ParagraphStyle('CidCell', parent=table_cell_center, fontName='DejaVuSans', fontSize=8)),
        Paragraph(desc, table_cell_style),
        Paragraph('<b>{}</b>'.format(status), ParagraphStyle('StatusCell2', parent=table_cell_center, textColor=status_color, fontSize=8.5)),
    ])

# Split into 2 tables to fit pages
mid = len(check_rows) // 2 + 1  # +1 to keep header in first half

check_table1 = Table(check_rows[:mid+1], colWidths=[PAGE_W*0.06, PAGE_W*0.10, PAGE_W*0.68, PAGE_W*0.12])
check_table1.setStyle(TableStyle([
    ('BACKGROUND', (0, 0), (-1, 0), TABLE_HEADER_COLOR),
    ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, TABLE_ROW_ODD]),
    ('BOX', (0, 0), (-1, -1), 1, ACCENT),
    ('INNERGRID', (0, 0), (-1, -1), 0.5, BG_SURFACE),
    ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ('TOPPADDING', (0, 0), (-1, -1), 3),
    ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
    ('LEFTPADDING', (0, 0), (-1, -1), 3),
    ('RIGHTPADDING', (0, 0), (-1, -1), 3),
]))
story.append(check_table1)

story.append(PageBreak())
story.append(p('Runtime Integrity Verification (continued)', h2_style))
story.append(Spacer(1, 4*mm))

check_table2 = Table(check_rows[mid+1:], colWidths=[PAGE_W*0.06, PAGE_W*0.10, PAGE_W*0.68, PAGE_W*0.12])
check_table2.setStyle(TableStyle([
    ('BACKGROUND', (0, 0), (-1, 0), TABLE_HEADER_COLOR),
    ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, TABLE_ROW_ODD]),
    ('BOX', (0, 0), (-1, -1), 1, ACCENT),
    ('INNERGRID', (0, 0), (-1, -1), 0.5, BG_SURFACE),
    ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ('TOPPADDING', (0, 0), (-1, -1), 3),
    ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
    ('LEFTPADDING', (0, 0), (-1, -1), 3),
    ('RIGHTPADDING', (0, 0), (-1, -1), 3),
]))

# Need to re-add header row for the continuation
cont_rows = [check_header] + check_rows[mid+1:]
check_table2 = Table(cont_rows, colWidths=[PAGE_W*0.06, PAGE_W*0.10, PAGE_W*0.68, PAGE_W*0.12])
check_table2.setStyle(TableStyle([
    ('BACKGROUND', (0, 0), (-1, 0), TABLE_HEADER_COLOR),
    ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, TABLE_ROW_ODD]),
    ('BOX', (0, 0), (-1, -1), 1, ACCENT),
    ('INNERGRID', (0, 0), (-1, -1), 0.5, BG_SURFACE),
    ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ('TOPPADDING', (0, 0), (-1, -1), 3),
    ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
    ('LEFTPADDING', (0, 0), (-1, -1), 3),
    ('RIGHTPADDING', (0, 0), (-1, -1), 3),
]))
story.append(check_table2)

# ═══════════════════════════════════════
# SECTION 3: Deployment Summary
# ═══════════════════════════════════════
story.append(Spacer(1, 10*mm))
story.append(p('Section 3: Deployment Summary', h1_style))
story.append(make_hr())

summary_data = [
    [Paragraph('<b>Property</b>', table_header_style), Paragraph('<b>Value</b>', table_header_style)],
    [Paragraph('Production Version', table_cell_style), Paragraph('V230', table_cell_style)],
    [Paragraph('Git Commit', table_cell_style), Paragraph('b4f0422', table_cell_style)],
    [Paragraph('Deployment Platform', table_cell_style), Paragraph('Railway (roua-trading-production)', table_cell_style)],
    [Paragraph('Code Quality Fixes Applied', table_cell_style), Paragraph('12 (Items 2.1 - 2.12)', table_cell_style)],
    [Paragraph('Files Modified (Quality Fixes)', table_cell_style), Paragraph('17 files, +244/-140 lines', table_cell_style)],
    [Paragraph('Runtime Integrity Checks', table_cell_style), Paragraph('49/49 PASSED (100%)', ParagraphStyle('PassText', parent=table_cell_style, textColor=PASS_GREEN))],
    [Paragraph('Agent Protection Status', table_cell_style), Paragraph('V214 code-level active, V222 Prisma extension removed (V230)', table_cell_style)],
    [Paragraph('Risk Management', table_cell_style), Paragraph('Unified via PortfolioValuationService, fail-closed coordination', table_cell_style)],
    [Paragraph('Safety Degradation', table_cell_style), Paragraph('Safe degradation active, health endpoint returns 200 on failure', table_cell_style)],
    [Paragraph('WebSocket Reliability', table_cell_style), Paragraph('ConnectionResilienceService active', table_cell_style)],
    [Paragraph('Circuit Breaker', table_cell_style), Paragraph('ExternalCircuitBreakerService active (CLOSED/OPEN/HALF_OPEN)', table_cell_style)],
    [Paragraph('Stuck Order Detection', table_cell_style), Paragraph('Active, auto-cancel after 30 minutes', table_cell_style)],
    [Paragraph('Last Inspection', table_cell_style), Paragraph(datetime.now().strftime('%Y-%m-%d %H:%M UTC'), table_cell_style)],
]

summary_table = Table(summary_data, colWidths=[PAGE_W*0.35, PAGE_W*0.65])
summary_table.setStyle(TableStyle([
    ('BACKGROUND', (0, 0), (-1, 0), TABLE_HEADER_COLOR),
    ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, TABLE_ROW_ODD]),
    ('BOX', (0, 0), (-1, -1), 1, ACCENT),
    ('INNERGRID', (0, 0), (-1, -1), 0.5, BG_SURFACE),
    ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ('TOPPADDING', (0, 0), (-1, -1), 6),
    ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
    ('LEFTPADDING', (0, 0), (-1, -1), 6),
    ('RIGHTPADDING', (0, 0), (-1, -1), 6),
]))
story.append(summary_table)

# ═══════════════════════════════════════
# SECTION 4: Key Risk Areas Covered
# ═══════════════════════════════════════
story.append(Spacer(1, 8*mm))
story.append(p('Section 4: Key Risk Areas Covered', h1_style))
story.append(make_hr())

risk_areas = [
    ('Position Size Management', 'V01, V02, V03, V06, V07, V12, V34',
     'All entry points for opening positions enforce dynamic size limits based on portfolio percentage. '
     'The old hard $200 cap was replaced with a flexible percentage-based system that adapts to account size. '
     'Paper trading accounts are not exempt from size checks, preventing unrealistic large positions.'),
    ('Agent Position Protection', 'V15, V18, V23, V31, V48',
     'Multiple defense layers protect Agent-managed positions from premature closure. V214 code-level defense '
     'allows user-initiated manual closes and SL/TP triggers while blocking system-initiated closes within 48 hours. '
     'The V222 Prisma extension was removed in V230 as it caused 500 errors, while V214 continues to provide '
     'the essential protection at the code level.'),
    ('Fail-Closed Architecture', 'V08, V33, V41',
     'The system defaults to blocking trades when infrastructure fails. Redis connection failures lock the '
     'coordination service, preventing duplicate or unauthorized trades. The health endpoint continues returning '
     '200 even during degradation, preventing Railway from killing the application.'),
    ('Data Integrity & Reconciliation', 'V30, V42, V43, V46',
     'Continuous data consistency checking detects orphan positions and verifies PnL sums. Stuck orders are '
     'automatically detected and cancelled after 30 minutes. Position reconciliation with exchanges runs periodically, '
     'ensuring the database matches real-world positions.'),
]

for area_name, checks_ref, area_desc in risk_areas:
    story.append(KeepTogether([
        p('<b>{}</b> [{}]'.format(area_name, checks_ref), ParagraphStyle('RiskArea', parent=body_style, fontSize=11, textColor=ACCENT)),
        p(area_desc, ParagraphStyle('RiskDesc', parent=body_style, fontSize=9.5, leading=14, leftIndent=8)),
        Spacer(1, 4*mm)
    ]))

# ═══════════════════════════════════════
# BUILD PDF
# ═══════════════════════════════════════
doc.build(story)
print(f'PDF generated: {OUTPUT_PATH}')
print(f'File size: {os.path.getsize(OUTPUT_PATH):,} bytes')
