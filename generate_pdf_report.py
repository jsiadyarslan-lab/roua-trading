#!/usr/bin/env python3
"""
Generate Professional PDF Report: Deep Analysis of Trading Records
"""

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import inch, cm, mm
from reportlab.lib.colors import HexColor, white, black
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_RIGHT, TA_JUSTIFY
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Image, Table, TableStyle,
    PageBreak, KeepTogether, HRFlowable
)
from reportlab.platypus.flowables import Flowable
from reportlab.pdfgen import canvas
import json
import os

# ── Load Stats ───────────────────────────────────────────────────────────────
with open('/home/z/my-project/download/stats.json', 'r') as f:
    stats = json.load(f)

agent = stats['agent']
smart = stats['smart']
all_trades = stats['all']
agent_pairs = stats['agent_pair_stats']
smart_pairs = stats['smart_pair_stats']
smart_worst = stats['smart_worst_5']
smart_best = stats['smart_best_5']

# ── Colors ───────────────────────────────────────────────────────────────────
DARK_BG = HexColor('#1a1a2e')
ACCENT_BLUE = HexColor('#0f3460')
ACCENT_RED = HexColor('#e74c3c')
ACCENT_GREEN = HexColor('#27ae60')
ACCENT_ORANGE = HexColor('#e67e22')
ACCENT_PURPLE = HexColor('#8e44ad')
LIGHT_GRAY = HexColor('#f5f5f5')
MED_GRAY = HexColor('#cccccc')
TEXT_DARK = HexColor('#2c3e50')
TEXT_LIGHT = HexColor('#555555')

# ── PDF Setup ────────────────────────────────────────────────────────────────
output_path = '/home/z/my-project/download/Trading_Analysis_Report.pdf'
chart_dir = '/home/z/my-project/download/charts'

doc = SimpleDocTemplate(
    output_path,
    pagesize=A4,
    leftMargin=2*cm,
    rightMargin=2*cm,
    topMargin=2.5*cm,
    bottomMargin=2*cm
)

# ── Styles ───────────────────────────────────────────────────────────────────
styles = getSampleStyleSheet()

title_style = ParagraphStyle(
    'CustomTitle',
    parent=styles['Title'],
    fontSize=28,
    leading=34,
    textColor=DARK_BG,
    spaceAfter=6,
    fontName='Helvetica-Bold',
    alignment=TA_CENTER,
)

subtitle_style = ParagraphStyle(
    'CustomSubtitle',
    parent=styles['Normal'],
    fontSize=14,
    leading=18,
    textColor=ACCENT_BLUE,
    spaceAfter=12,
    fontName='Helvetica',
    alignment=TA_CENTER,
)

h1_style = ParagraphStyle(
    'H1',
    parent=styles['Heading1'],
    fontSize=20,
    leading=26,
    textColor=DARK_BG,
    spaceBefore=20,
    spaceAfter=12,
    fontName='Helvetica-Bold',
    borderWidth=0,
    borderPadding=0,
)

h2_style = ParagraphStyle(
    'H2',
    parent=styles['Heading2'],
    fontSize=15,
    leading=20,
    textColor=ACCENT_BLUE,
    spaceBefore=14,
    spaceAfter=8,
    fontName='Helvetica-Bold',
)

h3_style = ParagraphStyle(
    'H3',
    parent=styles['Heading3'],
    fontSize=12,
    leading=16,
    textColor=TEXT_DARK,
    spaceBefore=10,
    spaceAfter=6,
    fontName='Helvetica-Bold',
)

body_style = ParagraphStyle(
    'CustomBody',
    parent=styles['Normal'],
    fontSize=10.5,
    leading=16,
    textColor=TEXT_DARK,
    spaceAfter=8,
    fontName='Helvetica',
    alignment=TA_JUSTIFY,
)

body_bold = ParagraphStyle(
    'CustomBodyBold',
    parent=body_style,
    fontName='Helvetica-Bold',
)

bullet_style = ParagraphStyle(
    'CustomBullet',
    parent=body_style,
    leftIndent=20,
    bulletIndent=10,
    spaceBefore=2,
    spaceAfter=4,
)

warning_style = ParagraphStyle(
    'Warning',
    parent=body_style,
    textColor=ACCENT_RED,
    fontName='Helvetica-Bold',
    fontSize=11,
    leading=16,
    spaceBefore=6,
    spaceAfter=6,
)

success_style = ParagraphStyle(
    'Success',
    parent=body_style,
    textColor=ACCENT_GREEN,
    fontName='Helvetica-Bold',
    fontSize=11,
    leading=16,
    spaceBefore=6,
    spaceAfter=6,
)

caption_style = ParagraphStyle(
    'Caption',
    parent=styles['Normal'],
    fontSize=9,
    leading=12,
    textColor=TEXT_LIGHT,
    fontName='Helvetica-Oblique',
    alignment=TA_CENTER,
    spaceAfter=12,
)

# ── Helper Functions ─────────────────────────────────────────────────────────
def colored_text(text, color_hex):
    return f'<font color="{color_hex}">{text}</font>'

def pnl_color(val):
    if val > 0:
        return '#27ae60'
    elif val < 0:
        return '#e74c3c'
    return '#555555'

def pnl_format(val):
    prefix = '+' if val > 0 else ''
    return f'{prefix}${val:.2f}'

def make_stat_card(label, value, color='#2c3e50'):
    return Paragraph(
        f'<font color="{color}" size="18"><b>{value}</b></font><br/>'
        f'<font color="#777777" size="9">{label}</font>',
        ParagraphStyle('StatCard', parent=body_style, alignment=TA_CENTER, spaceBefore=4, spaceAfter=4)
    )

def make_table(data, col_widths=None, header_color=ACCENT_BLUE):
    style = TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), header_color),
        ('TEXTCOLOR', (0, 0), (-1, 0), white),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 9),
        ('FONTNAME', (0, 1), (-1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 1), (-1, -1), 9),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('GRID', (0, 0), (-1, -1), 0.5, MED_GRAY),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [white, LIGHT_GRAY]),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ('LEFTPADDING', (0, 0), (-1, -1), 6),
        ('RIGHTPADDING', (0, 0), (-1, -1), 6),
    ])
    t = Table(data, colWidths=col_widths, repeatRows=1)
    t.setStyle(style)
    return t

# ── Build Document ───────────────────────────────────────────────────────────
elements = []

# ═══ COVER PAGE ═══
elements.append(Spacer(1, 3*cm))
elements.append(Paragraph('TRADING SYSTEM', title_style))
elements.append(Paragraph('DEEP ANALYSIS REPORT', ParagraphStyle(
    'TitleLine2', parent=title_style, fontSize=24, textColor=ACCENT_BLUE, spaceAfter=10
)))
elements.append(Spacer(1, 0.5*cm))
elements.append(HRFlowable(width="60%", thickness=2, color=ACCENT_BLUE, spaceAfter=15, spaceBefore=5))
elements.append(Paragraph('Agent vs Smart Strategy Performance Analysis', subtitle_style))
elements.append(Paragraph('103 Trading Records | June 7-11, 2025', subtitle_style))
elements.append(Spacer(1, 1.5*cm))

# Key findings summary on cover
cover_data = [
    ['Metric', 'Agent', 'Smart', 'Combined'],
    ['Total Trades', str(agent['total_trades']), str(smart['total_trades']), str(all_trades['total_trades'])],
    ['Win Rate', f"{agent['win_rate']:.1f}%", f"{smart['win_rate']:.1f}%", f"{all_trades['win_rate']:.1f}%"],
    ['Total P&L', pnl_format(agent['total_pnl']), pnl_format(smart['total_pnl']), pnl_format(all_trades['total_pnl'])],
    ['Profit Factor', f"{stats['agent_pf']:.2f}", f"{stats['smart_pf']:.2f}", '-'],
    ['SL Hit Rate', f"{agent['sl_rate']:.1f}%", f"{smart['sl_rate']:.1f}%", f"{all_trades['sl_rate']:.1f}%"],
]
elements.append(make_table(cover_data, col_widths=[3.5*cm, 3*cm, 3*cm, 3*cm]))
elements.append(Spacer(1, 1.5*cm))
elements.append(Paragraph(
    '<b>Verdict:</b> Both strategies are net negative. Smart strategy is critically broken with -${0:.2f} loss '
    'and 36.2% SL hit rate. Agent strategy is marginally negative but structurally sound. '
    'Immediate intervention required for Smart strategy.'.format(abs(smart['total_pnl'])),
    ParagraphStyle('Verdict', parent=body_style, alignment=TA_CENTER, fontSize=11, 
                   textColor=ACCENT_RED, fontName='Helvetica-Bold')
))

elements.append(PageBreak())

# ═══ SECTION 1: EXECUTIVE SUMMARY ═══
elements.append(Paragraph('1. Executive Summary', h1_style))
elements.append(HRFlowable(width="100%", thickness=1.5, color=ACCENT_BLUE, spaceAfter=10))

elements.append(Paragraph(
    'This report presents a comprehensive analysis of 103 trading records executed between June 7-11, 2025, '
    'across two automated trading strategies: <b>Agent</b> and <b>Smart</b>. The data spans seven cryptocurrency '
    'pairs (BTC, ETH, BNB, SOL, XRP, ADA, DOGE against USDT) and reveals critical structural flaws in the '
    'Smart strategy that require immediate remediation, while the Agent strategy shows promise with targeted improvements.',
    body_style
))

elements.append(Paragraph(
    'The combined portfolio lost a total of <b>${0:.2f}</b> over the analysis period, with the Smart strategy '
    'accounting for <b>{1:.1f}%</b> of total losses despite representing only <b>{2:.1f}%</b> of total trades. '
    'This extreme loss concentration in the Smart strategy is the single most critical finding of this analysis. '
    'The Agent strategy, while marginally unprofitable at -${3:.2f}, demonstrates a fundamentally sound micro-structure '
    'with consistent position sizing and a near-50% win rate. Its losses stem primarily from insufficient win magnitude '
    'rather than catastrophic failures, making it a viable foundation for algorithmic refinement.'.format(
        abs(all_trades['total_pnl']),
        abs(smart['total_losses']) / (abs(agent['total_losses']) + abs(smart['total_losses'])) * 100,
        smart['total_trades'] / all_trades['total_trades'] * 100,
        abs(agent['total_pnl'])
    ),
    body_style
))

elements.append(Paragraph(
    'The most alarming discovery is the Smart strategy\'s position sizing volatility. Position values range from '
    '${0:.0f} to ${1:.0f} - a <b>{2:.0f}x</b> difference - creating extreme and unpredictable risk exposure. '
    'A single ADA/USDT trade with a position value of ${3:.0f} produced a loss of -${4:.2f}, while the same pair '
    'with a ${5:.0f} position generated +${6:.2f} in profit. This inconsistency violates fundamental risk management '
    'principles and makes mathematical expectancy calculations unreliable for position planning.'.format(
        smart['min_pos_value'],
        smart['max_pos_value'],
        smart['max_pos_value'] / smart['min_pos_value'],
        smart_worst[0]['position_value'],
        abs(smart_worst[0]['pnl']),
        smart_best[-1]['position_value'],
        smart_best[-1]['pnl']
    ),
    body_style
))

# ═══ SECTION 2: STRATEGY COMPARISON ═══
elements.append(Paragraph('2. Strategy Performance Comparison', h1_style))
elements.append(HRFlowable(width="100%", thickness=1.5, color=ACCENT_BLUE, spaceAfter=10))

# Chart 1
if os.path.exists(f'{chart_dir}/01_strategy_overview.png'):
    elements.append(Image(f'{chart_dir}/01_strategy_overview.png', width=16*cm, height=5*cm))
    elements.append(Paragraph('Figure 1: Strategy Overview - Total P&L, Win Rate, and SL Hit Rate Comparison', caption_style))

elements.append(Paragraph('2.1 Agent Strategy Profile', h2_style))
elements.append(Paragraph(
    'The Agent strategy executed 56 trades with a position value consistently around $100-105, demonstrating '
    'excellent position sizing discipline. The win rate of {0:.1f}% is slightly below the breakeven threshold, '
    'but the critical issue is the asymmetry between average wins (${1:.2f}) and average losses (${2:.2f}). '
    'The average win is barely larger than the average loss, which means the strategy needs a win rate above 51% '
    'to be profitable. The risk-reward ratio of {3:.2f}:1 is theoretically attractive, but in practice, the '
    'vast majority of trades are closed manually at the 4-hour mark rather than hitting TP, which means the '
    'theoretical risk-reward is never realized. This is the core mechanical problem: the strategy sets wide TP '
    'targets that prices cannot reach within the trading timeframe, forcing manual closures at marginal gains or losses.'.format(
        agent['win_rate'],
        agent['avg_win'],
        abs(agent['avg_loss']),
        agent['avg_rr']
    ),
    body_style
))

agent_table_data = [
    ['Metric', 'Value', 'Assessment'],
    ['Total Trades', str(agent['total_trades']), 'Active participation'],
    ['Win Rate', f"{agent['win_rate']:.1f}%", 'Below breakeven threshold'],
    ['Total P&L', pnl_format(agent['total_pnl']), 'Marginal loss'],
    ['Avg Win / Avg Loss', f"${agent['avg_win']:.2f} / ${abs(agent['avg_loss']):.2f}", 'Insufficient edge'],
    ['Profit Factor', f"{stats['agent_pf']:.2f}", 'Below 1.0 - unprofitable'],
    ['SL Hit Rate', f"{agent['sl_rate']:.1f}%", 'Low - good SL placement'],
    ['TP Hit Rate', f"{agent['tp_closes']/agent['total_trades']*100:.1f}%", 'Near zero - critical flaw'],
    ['Position Value', f"${agent['avg_pos_value']:.0f} (consistent)", 'Excellent discipline'],
    ['Direction Bias', f"{agent['sells']} Sells / {agent['buys']} Buys", 'Heavily short-biased'],
]
elements.append(make_table(agent_table_data, col_widths=[4*cm, 4.5*cm, 5*cm]))
elements.append(Spacer(1, 0.3*cm))

elements.append(Paragraph('2.2 Smart Strategy Profile', h2_style))
elements.append(Paragraph(
    'The Smart strategy executed 47 trades with devastating results: a net loss of <b>${0:.2f}</b>, a profit factor '
    'of only {1:.2f}, and a win rate of {2:.1f}%. The average loss (${3:.2f}) exceeds the average win (${4:.2f}), '
    'creating a negative expectancy of -${5:.2f} per trade. This means every Smart trade, on average, destroys capital. '
    'The strategy\'s SL hit rate of {6:.1f}% is double the Agent\'s rate, indicating that entry signals are poorly timed '
    'and frequently place trades against the prevailing short-term momentum. Even more concerning, the strategy achieved '
    '<b>zero TP hits</b> across all 47 trades, meaning it never once captured its intended profit target. This is a '
    'fundamental failure in signal generation and trade management.'.format(
        abs(smart['total_pnl']),
        stats['smart_pf'],
        smart['win_rate'],
        abs(smart['avg_loss']),
        smart['avg_win'],
        abs(stats['smart_exp']),
        smart['sl_rate'],
    ),
    body_style
))

smart_table_data = [
    ['Metric', 'Value', 'Assessment'],
    ['Total Trades', str(smart['total_trades']), 'Active participation'],
    ['Win Rate', f"{smart['win_rate']:.1f}%", 'Significantly below breakeven'],
    ['Total P&L', pnl_format(smart['total_pnl']), colored_text('CRITICAL LOSS', '#e74c3c')],
    ['Avg Win / Avg Loss', f"${smart['avg_win']:.2f} / ${abs(smart['avg_loss']):.2f}", 'Negative asymmetry'],
    ['Profit Factor', f"{stats['smart_pf']:.2f}", colored_text('Far below 1.0', '#e74c3c')],
    ['SL Hit Rate', f"{smart['sl_rate']:.1f}%", colored_text('Very high - entries failing', '#e74c3c')],
    ['TP Hit Rate', '0.0%', colored_text('NEVER hits TP', '#e74c3c')],
    ['Position Value', f"${smart['min_pos_value']:.0f} - ${smart['max_pos_value']:.0f}", colored_text('34x range - reckless', '#e74c3c')],
    ['Expectancy', f"${stats['smart_exp']:.2f}/trade", 'Capital destruction per trade'],
]
elements.append(make_table(smart_table_data, col_widths=[4*cm, 4.5*cm, 5*cm]))
elements.append(Spacer(1, 0.3*cm))

# ═══ SECTION 3: P&L DISTRIBUTION ═══
elements.append(Paragraph('3. P&L Distribution Analysis', h1_style))
elements.append(HRFlowable(width="100%", thickness=1.5, color=ACCENT_BLUE, spaceAfter=10))

if os.path.exists(f'{chart_dir}/02_pnl_distribution.png'):
    elements.append(Image(f'{chart_dir}/02_pnl_distribution.png', width=15*cm, height=5.4*cm))
    elements.append(Paragraph('Figure 2: P&L Distribution for Agent (left) and Smart (right) Strategies', caption_style))

elements.append(Paragraph(
    'The P&L distributions reveal fundamentally different risk profiles. The Agent strategy\'s distribution is '
    'tightly clustered around zero, with most trades falling between -$2 and +$2. This narrow spread is a direct '
    'consequence of the consistent $100 position sizing and the 4-hour manual close mechanism. The distribution '
    'is approximately symmetrical, confirming the near-50% win rate, but with a slight negative skew that accounts '
    'for the overall small loss. The key observation is that the Agent strategy\'s losses are controlled and predictable, '
    'making it suitable for optimization through parameter tuning rather than fundamental restructuring.',
    body_style
))

elements.append(Paragraph(
    'In stark contrast, the Smart strategy\'s P&L distribution is <b>heavily fat-tailed on the negative side</b>. '
    'While most trades produce modest gains or losses, there are catastrophic outlier losses of -$37.27, -$18.43, '
    'and -$8.44 that drag the entire distribution into deeply negative territory. The positive tail extends to +$35.29 '
    '(the large ADA/USDT short), but this single massive win is almost entirely negated by the single massive loss. '
    'This pattern is characteristic of a strategy with uncontrolled position sizing: large positions create large outcomes '
    'in both directions, but because the SL hit rate is high (36.2%), the large positions disproportionately produce '
    'large losses. The statistical implication is devastating - the Smart strategy\'s returns have negative skewness '
    'and excess kurtosis, meaning it carries hidden tail risk that cannot be captured by simple win/loss statistics.',
    body_style
))

# ═══ SECTION 4: POSITION SIZING ═══
elements.append(Paragraph('4. Position Sizing - The Fatal Flaw', h1_style))
elements.append(HRFlowable(width="100%", thickness=1.5, color=ACCENT_BLUE, spaceAfter=10))

if os.path.exists(f'{chart_dir}/04_smart_sizing_vs_pnl.png'):
    elements.append(Image(f'{chart_dir}/04_smart_sizing_vs_pnl.png', width=13*cm, height=9.1*cm))
    elements.append(Paragraph('Figure 3: Smart Strategy - Position Value vs P&L (Squares = SL Closes)', caption_style))

elements.append(Paragraph(
    'Position sizing is the single most critical flaw in the Smart strategy. The scatter plot above reveals a clear '
    'and dangerous pattern: as position value increases, the magnitude of losses increases proportionally, but the '
    'frequency of losses also increases. The largest positions (right side of the chart) are predominantly red (losses), '
    'while smaller positions show a more balanced mix. This is not coincidental - it reflects a fundamental error in '
    'the position sizing algorithm that ties trade size to confidence or signal strength, effectively amplifying risk '
    'precisely when the probability of success is lowest.',
    body_style
))

elements.append(Paragraph('4.1 Smart Strategy Position Size Analysis', h2_style))

sizing_data = [
    ['Position Range', 'Trades', 'Win Rate', 'Avg P&L', 'Total P&L'],
]
# Categorize Smart trades by position value
smart_pv_categories = [
    ('$250-500', [t for t in [] if False]),  # placeholder
]
# Manual categorization from stats
cat1 = {'label': '$250-500', 'count': 0, 'wins': 0, 'pnl': 0}
cat2 = {'label': '$500-1000', 'count': 0, 'wins': 0, 'pnl': 0}
cat3 = {'label': '$1000-3000', 'count': 0, 'wins': 0, 'pnl': 0}
cat4 = {'label': '$3000+', 'count': 0, 'wins': 0, 'pnl': 0}

# Use the raw trade data from our analysis
from analyze_trades import trades as all_trades_raw
for t in all_trades_raw:
    if t['strategy'] != 'Smart':
        continue
    pv = t['position_value']
    if pv < 500:
        cat = cat1
    elif pv < 1000:
        cat = cat2
    elif pv < 3000:
        cat = cat3
    else:
        cat = cat4
    cat['count'] += 1
    cat['pnl'] += t['pnl']
    if t['pnl'] > 0:
        cat['wins'] += 1

for cat in [cat1, cat2, cat3, cat4]:
    if cat['count'] > 0:
        wr = cat['wins'] / cat['count'] * 100
        avg_pnl = cat['pnl'] / cat['count']
        sizing_data.append([cat['label'], str(cat['count']), f'{wr:.0f}%', f'${avg_pnl:.2f}', pnl_format(cat['pnl'])])
    else:
        sizing_data.append([cat['label'], '0', '-', '-', '$0.00'])

elements.append(make_table(sizing_data, col_widths=[3*cm, 2.5*cm, 2.5*cm, 3*cm, 3*cm]))

elements.append(Paragraph(
    'The data confirms the pattern: the largest position sizes generate the worst risk-adjusted returns. '
    'The $3000+ category, while containing the strategy\'s largest win (+$35.29), also contains the catastrophic '
    '-$37.27 DOGE loss and the -$18.43 ADA loss. The net effect is deeply negative because the large positions '
    'frequently hit stop losses, and each SL hit on a large position creates an outsized loss that requires many '
    'small wins to recover. This is the classic martingale-adjacent trap: increasing position size to compensate '
    'for losses or chase confidence, only to create even larger losses.',
    body_style
))

elements.append(Paragraph('4.2 Agent Strategy Position Sizing - A Model of Consistency', h2_style))
elements.append(Paragraph(
    'In contrast, the Agent strategy maintains remarkably consistent position values centered around $102, with a '
    'range of only ${0:.2f} to ${1:.2f}. This consistency is the strategy\'s greatest strength because it makes '
    'risk per trade predictable and allows for proper capital allocation. The tight position sizing means that no '
    'single Agent trade can catastrophically damage the account, and the strategy\'s performance depends entirely '
    'on win rate and average win/loss ratio rather than position sizing luck. This is the correct approach for '
    'algorithmic trading and should be adopted as the standard for the Smart strategy as well.'.format(
        agent['min_pos_value'], agent['max_pos_value']
    ),
    body_style
))

# ═══ SECTION 5: CLOSE REASON ANALYSIS ═══
elements.append(Paragraph('5. Close Reason Analysis - The TP Problem', h1_style))
elements.append(HRFlowable(width="100%", thickness=1.5, color=ACCENT_BLUE, spaceAfter=10))

if os.path.exists(f'{chart_dir}/05_close_reasons.png'):
    elements.append(Image(f'{chart_dir}/05_close_reasons.png', width=14*cm, height=5.8*cm))
    elements.append(Paragraph('Figure 4: Close Reason Distribution - Agent (left) vs Smart (right)', caption_style))

elements.append(Paragraph(
    'The close reason analysis reveals the most significant operational flaw shared by both strategies: '
    '<b>Take Profit targets are almost never reached</b>. The Agent strategy achieved only 1 TP hit out of 56 trades '
    '(1.8%), and the Smart strategy achieved <b>zero TP hits out of 47 trades</b>. This means the profit-taking '
    'mechanism is fundamentally broken. The TP levels are set too far from entry prices for the given timeframe, '
    'and prices reverse before reaching them, forcing manual closures.',
    body_style
))

elements.append(Paragraph('5.1 Agent Close Reason Breakdown', h2_style))
agent_close_data = [
    ['Close Reason', 'Count', 'Percentage', 'Avg P&L'],
    ['Manual (4h timeout)', str(agent['manual_closes']), f"{agent['manual_closes']/agent['total_trades']*100:.1f}%", 
     f"${sum(t['pnl'] for t in all_trades_raw if t['strategy']=='Agent' and t['reason']=='Manual') / max(agent['manual_closes'], 1):.2f}"],
    ['Stop Loss', str(agent['sl_closes']), f"{agent['sl_rate']:.1f}%",
     f"${sum(t['pnl'] for t in all_trades_raw if t['strategy']=='Agent' and t['reason']=='SL') / max(agent['sl_closes'], 1):.2f}"],
    ['Take Profit', str(agent['tp_closes']), f"{agent['tp_closes']/agent['total_trades']*100:.1f}%",
     f"${sum(t['pnl'] for t in all_trades_raw if t['strategy']=='Agent' and t['reason']=='TP') / max(agent['tp_closes'], 1):.2f}"],
]
elements.append(make_table(agent_close_data, col_widths=[4.5*cm, 2.5*cm, 3*cm, 3.5*cm]))

elements.append(Paragraph(
    'The Agent strategy\'s 80.4% manual close rate confirms that the 4-hour time-based exit is the de facto '
    'primary exit mechanism, not the SL/TP framework. When trades are closed manually at the 4-hour mark, the '
    'average result is a coin-flip between small gains and small losses, with the edge slightly favoring losses. '
    'This means the SL and TP levels serve only as emergency brakes, not as profit-taking tools. The strategy would '
    'benefit enormously from either shorter TP targets or a trailing stop mechanism that can lock in gains before '
    'the 4-hour timeout forces an exit.',
    body_style
))

elements.append(Paragraph('5.2 Smart Close Reason Breakdown', h2_style))
smart_close_data = [
    ['Close Reason', 'Count', 'Percentage', 'Total P&L'],
    ['Manual', str(smart['manual_closes']), f"{smart['manual_closes']/smart['total_trades']*100:.1f}%",
     pnl_format(sum(t['pnl'] for t in all_trades_raw if t['strategy']=='Smart' and t['reason']=='Manual'))],
    ['Stop Loss', str(smart['sl_closes']), f"{smart['sl_rate']:.1f}%",
     pnl_format(sum(t['pnl'] for t in all_trades_raw if t['strategy']=='Smart' and t['reason']=='SL'))],
    ['Take Profit', '0', '0.0%', '$0.00'],
]
elements.append(make_table(smart_close_data, col_widths=[4.5*cm, 2.5*cm, 3*cm, 3.5*cm]))

elements.append(Paragraph(
    'The Smart strategy\'s close reason profile is even more concerning. SL hits account for 36.2% of all closes '
    'with a total loss of ${0:.2f}, while manual closes still produce a net gain of ${1:.2f}. This means the '
    'strategy\'s entries are actually <b>profitable when they don\'t hit SL</b>, but the SL hit rate is so high '
    'that it overwhelms the gains. The solution is not to widen stop losses (which would increase per-trade risk) '
    'but to improve entry timing so that fewer trades immediately move against the position. The zero TP hit rate '
    'also confirms that TP targets are unrealistic for the Smart strategy\'s timeframe and volatility profile.'.format(
        sum(t['pnl'] for t in all_trades_raw if t['strategy']=='Smart' and t['reason']=='SL'),
        sum(t['pnl'] for t in all_trades_raw if t['strategy']=='Smart' and t['reason']=='Manual')
    ),
    body_style
))

# ═══ SECTION 6: PAIR ANALYSIS ═══
elements.append(Paragraph('6. Performance by Trading Pair', h1_style))
elements.append(HRFlowable(width="100%", thickness=1.5, color=ACCENT_BLUE, spaceAfter=10))

if os.path.exists(f'{chart_dir}/03_pnl_by_pair.png'):
    elements.append(Image(f'{chart_dir}/03_pnl_by_pair.png', width=15*cm, height=5.6*cm))
    elements.append(Paragraph('Figure 5: P&L by Trading Pair - Agent (left) vs Smart (right)', caption_style))

elements.append(Paragraph('6.1 Agent Pair Performance', h2_style))

agent_pair_data = [['Pair', 'Trades', 'Wins', 'Losses', 'P&L', 'Win Rate']]
for pair, ps in sorted(agent_pairs.items(), key=lambda x: x[1]['pnl'], reverse=True):
    wr = ps['wins'] / ps['count'] * 100 if ps['count'] > 0 else 0
    agent_pair_data.append([pair, str(ps['count']), str(ps['wins']), str(ps['losses']), 
                           pnl_format(ps['pnl']), f'{wr:.0f}%'])
elements.append(make_table(agent_pair_data, col_widths=[2.5*cm, 2*cm, 2*cm, 2*cm, 2.5*cm, 2.5*cm]))

elements.append(Paragraph(
    'The Agent strategy shows relatively balanced performance across pairs, with XRP/USDT being the best performer '
    'at +${0:.2f} and BNB/USDT and ADA/USDT showing the weakest results. The consistent number of trades per pair '
    '(6-9 for most pairs) suggests the strategy distributes opportunities evenly, which is a positive sign. The '
    'direction bias is overwhelmingly short (87.5% sells), which means the strategy is essentially a mean-reversion '
    'short strategy that profits from temporary bounces and suffers when markets trend upward. This bias needs to be '
    'addressed by adding trend detection to filter out short entries during uptrends.'.format(
        max(ps['pnl'] for ps in agent_pairs.values())
    ),
    body_style
))

elements.append(Paragraph('6.2 Smart Pair Performance', h2_style))

smart_pair_data = [['Pair', 'Trades', 'Wins', 'Losses', 'P&L', 'Win Rate']]
for pair, ps in sorted(smart_pairs.items(), key=lambda x: x[1]['pnl'], reverse=True):
    wr = ps['wins'] / ps['count'] * 100 if ps['count'] > 0 else 0
    smart_pair_data.append([pair, str(ps['count']), str(ps['wins']), str(ps['losses']),
                           pnl_format(ps['pnl']), f'{wr:.0f}%'])
elements.append(make_table(smart_pair_data, col_widths=[2.5*cm, 2*cm, 2*cm, 2*cm, 2.5*cm, 2.5*cm]))

elements.append(Paragraph(
    'The Smart pair analysis reveals extreme concentration of losses. DOGE/USDT alone accounts for -${0:.2f} in '
    'losses (the 99,677 DOGE position that lost -$37.27), making it the single most destructive pair in the portfolio. '
    'ADA/USDT is paradoxically both the best and worst performer: the 51,963 ADA short gained +$35.29 while the '
    '14,622 ADA short lost -$18.43. This paradox is entirely explained by position sizing - the same pair with wildly '
    'different position sizes produces wildly different outcomes. XRP/USDT shows consistent losses across multiple '
    'trades totaling -${1:.2f}, suggesting the Smart strategy\'s XRP signal is fundamentally flawed and should be '
    'disabled until retrained.'.format(
        abs(min(ps['pnl'] for ps in smart_pairs.values())),
        abs(sum(ps['pnl'] for pair, ps in smart_pairs.items() if pair == 'XRP/USDT'))
    ),
    body_style
))

# ═══ SECTION 7: SL/TP ANALYSIS ═══
elements.append(Paragraph('7. Stop Loss and Take Profit Analysis', h1_style))
elements.append(HRFlowable(width="100%", thickness=1.5, color=ACCENT_BLUE, spaceAfter=10))

if os.path.exists(f'{chart_dir}/08_sl_tp_analysis.png'):
    elements.append(Image(f'{chart_dir}/08_sl_tp_analysis.png', width=15*cm, height=5.4*cm))
    elements.append(Paragraph('Figure 6: SL Distance vs TP Distance - Agent (left) and Smart (right)', caption_style))

elements.append(Paragraph(
    'The SL/TP distance analysis reveals a critical misalignment between risk parameters and market reality. '
    'The Agent strategy sets SL distances averaging {0:.2f}% and TP distances averaging {1:.2f}%, giving a '
    'theoretical risk-reward ratio of {2:.2f}:1. While this looks attractive on paper, the reality is that prices '
    'rarely move far enough to hit TP within the 4-hour trading window. The average 4-hour price movement for '
    'major crypto pairs is typically 0.5-1.5%, which means the {1:.2f}% TP targets are 2-4x beyond typical 4-hour '
    'ranges. This structural mismatch explains why only 1.8% of Agent trades hit TP.'.format(
        agent['avg_sl_dist'], agent['avg_tp_dist'], agent['avg_rr']
    ),
    body_style
))

elements.append(Paragraph(
    'The Smart strategy\'s SL/TP configuration is even more problematic. With an average SL distance of only '
    '{0:.2f}% and average TP distance of {1:.2f}%, the risk-reward ratio of {2:.2f}:1 appears reasonable. However, '
    'the extremely tight SL distance ({0:.2f}%) means that normal market noise frequently triggers stop losses before '
    'the trade has time to develop. For volatile assets like DOGE and ADA, daily price swings of 2-5% are common, '
    'making a 0.5% SL essentially a guaranteed loss in many market conditions. The TP distance of {1:.2f}% is '
    'achievable but requires the trade to immediately move in the right direction, which contradicts the empirical '
    'evidence showing that Smart entries frequently face immediate adverse price movement.'.format(
        smart['avg_sl_dist'], smart['avg_tp_dist'], smart['avg_rr']
    ),
    body_style
))

sltp_data = [
    ['Parameter', 'Agent', 'Smart', 'Optimal Range'],
    ['Avg SL Distance', f"{agent['avg_sl_dist']:.2f}%", f"{smart['avg_sl_dist']:.2f}%", '1.0-2.0%'],
    ['Avg TP Distance', f"{agent['avg_tp_dist']:.2f}%", f"{smart['avg_tp_dist']:.2f}%", '1.5-3.0%'],
    ['Risk-Reward Ratio', f"{agent['avg_rr']:.2f}:1", f"{smart['avg_rr']:.2f}:1", '1.5-2.5:1'],
    ['SL Hit Rate', f"{agent['sl_rate']:.1f}%", f"{smart['sl_rate']:.1f}%", 'Below 25%'],
    ['TP Hit Rate', f"{agent['tp_closes']/agent['total_trades']*100:.1f}%", "0.0%", 'Above 30%'],
]
elements.append(make_table(sltp_data, col_widths=[3.5*cm, 3*cm, 3*cm, 3.5*cm]))

# ═══ SECTION 8: DIRECTION BIAS ═══
elements.append(Paragraph('8. Direction Bias Analysis', h1_style))
elements.append(HRFlowable(width="100%", thickness=1.5, color=ACCENT_BLUE, spaceAfter=10))

if os.path.exists(f'{chart_dir}/06_direction_bias.png'):
    elements.append(Image(f'{chart_dir}/06_direction_bias.png', width=14*cm, height=5.8*cm))
    elements.append(Paragraph('Figure 7: Direction Bias - Agent (left) vs Smart (right)', caption_style))

elements.append(Paragraph(
    'Both strategies exhibit a strong short-side bias, but with very different P&L implications. The Agent strategy '
    'executed 49 sells vs 7 buys (87.5% short), with sells producing -${0:.2f} and buys producing -${1:.2f}. While '
    'both directions are marginally negative, the short bias is not inherently problematic if the strategy is designed '
    'as a mean-reversion system. However, during the analysis period (June 7-11), crypto markets showed choppy-to-bearish '
    'price action, and the short bias happened to align with market conditions. If the market were to trend upward, '
    'the Agent strategy\'s short bias would become a significant liability.'.format(
        abs(agent['sell_pnl']), abs(agent['buy_pnl'])
    ),
    body_style
))

elements.append(Paragraph(
    'The Smart strategy shows a less extreme but still significant short bias (31 sells vs 16 buys). Critically, '
    'Smart buys generated -${0:.2f} in losses while Smart sells generated -${1:.2f}. This indicates that the Smart '
    'strategy\'s buy signals are particularly weak, and the strategy should either improve its long-side entry logic '
    'or reduce long-side exposure until signal quality improves. The high SL hit rate on buy trades (many Smart SL '
    'hits are on long positions entered during downtrends) suggests that the strategy lacks proper trend context '
    'filtering - it enters long positions even when the broader trend is bearish.'.format(
        abs(smart['buy_pnl']), abs(smart['sell_pnl'])
    ),
    body_style
))

# ═══ SECTION 9: CUMULATIVE P&L ═══
elements.append(Paragraph('9. Cumulative P&L Trajectory', h1_style))
elements.append(HRFlowable(width="100%", thickness=1.5, color=ACCENT_BLUE, spaceAfter=10))

if os.path.exists(f'{chart_dir}/07_cumulative_pnl.png'):
    elements.append(Image(f'{chart_dir}/07_cumulative_pnl.png', width=15*cm, height=6.4*cm))
    elements.append(Paragraph('Figure 8: Cumulative P&L Over All Trades', caption_style))

elements.append(Paragraph(
    'The cumulative P&L chart tells the story of both strategies. The Agent line (green) oscillates around zero '
    'with small amplitude, never deviating more than a few dollars from breakeven. This is the signature of a strategy '
    'that is approximately fair but lacks an edge - it neither creates nor destroys significant capital over the '
    'sample period. The Smart line (red) shows a pronounced downward trajectory with occasional sharp recoveries, '
    'punctuated by the +$35.29 ADA win that temporarily brought the strategy above water before the -$37.27 DOGE '
    'loss pushed it back into deep negative territory. This boom-bust pattern is extremely dangerous in live trading '
    'because it creates a false sense of confidence after a large win, encouraging increased position sizing just '
    'before the next catastrophic loss.',
    body_style
))

# ═══ SECTION 10: CRITICAL ERRORS ═══
elements.append(Paragraph('10. Critical Errors Identified', h1_style))
elements.append(HRFlowable(width="100%", thickness=1.5, color=ACCENT_BLUE, spaceAfter=10))

elements.append(Paragraph('Error #1: Smart Strategy Uncontrolled Position Sizing', h2_style))
elements.append(Paragraph(
    '<b>Severity: CRITICAL</b> | The Smart strategy\'s position sizes vary by up to 34x ($254 to $8,657), creating '
    'unpredictable and catastrophic risk exposure. A single trade (99,677 DOGE) represented a position value of '
    '$8,657 - over 8x the Agent\'s typical position and likely a significant fraction of the total account balance. '
    'This violates the most fundamental rule of trading risk management: never risk more than 1-2% of account capital '
    'on a single trade. If the account balance is approximately $100-200 (as suggested by the paper trading context), '
    'then positions of $1,000+ represent 500-1000% leverage, which is reckless even for a paper account. The position '
    'sizing algorithm must be completely rewritten to enforce a maximum position value as a percentage of account equity.',
    body_style
))

elements.append(Paragraph('Error #2: Zero TP Hit Rate Across Both Strategies', h2_style))
elements.append(Paragraph(
    '<b>Severity: HIGH</b> | Neither strategy consistently reaches its take profit targets. The Agent strategy hit TP '
    'only once in 56 trades (1.8%), and the Smart strategy never hit TP in 47 trades (0.0%). This means the profit-'
    'taking mechanism is fundamentally broken. The TP levels are set based on some theoretical model that does not '
    'account for the actual price behavior within the strategy\'s holding period. When TP is never reached, the '
    'strategy is forced to rely on manual time-based exits or stop losses as its only exit mechanisms, eliminating '
    'the entire purpose of having a profit target. This creates a structural asymmetry: losses are bounded by SL, '
    'but gains are cut short by manual closing before they can reach their full potential.',
    body_style
))

elements.append(Paragraph('Error #3: Smart Strategy SL Too Tight', h2_style))
elements.append(Paragraph(
    '<b>Severity: HIGH</b> | The Smart strategy\'s average SL distance of {0:.2f}% is far too tight for cryptocurrency '
    'markets. With crypto volatility routinely producing 1-3% price swings within hours, a 0.5% SL will be triggered '
    'by normal market noise before the trade has any chance to develop. The 36.2% SL hit rate confirms this: more '
    'than one in three Smart trades are stopped out immediately, often within minutes or hours of entry. The SL '
    'placement algorithm needs to account for the Average True Range (ATR) of each specific pair, setting SL at '
    '1.5-2.0x ATR from entry to avoid premature stop-outs while still limiting risk.'.format(
        smart['avg_sl_dist']
    ),
    body_style
))

elements.append(Paragraph('Error #4: Rapid-Fire Duplicate Trades', h2_style))
elements.append(Paragraph(
    '<b>Severity: MEDIUM</b> | The data shows multiple Smart trades opened and closed within seconds of each other '
    'on the same pair. For example, three ADA/USDT sell positions were opened at nearly identical prices (0.1678-0.1680) '
    'and closed within 20-30 seconds of each other, each losing -$0.89. Similarly, four DOGE/USDT sell positions were '
    'opened at 0.086064-0.086134 and closed within 25-55 seconds, each gaining $2.23-2.68. These rapid-fire trades '
    'suggest a signal generation bug where the algorithm opens multiple positions for the same signal instead of '
    'aggregating into a single position. This wastes trading fees, creates redundant exposure, and makes risk '
    'management impossible because the effective position size is the sum of all simultaneous positions.',
    body_style
))

elements.append(Paragraph('Error #5: Extreme Direction Bias Without Trend Filter', h2_style))
elements.append(Paragraph(
    '<b>Severity: MEDIUM</b> | The Agent strategy is 87.5% short, and the Smart strategy is 66% short. While short '
    'bias can be profitable in bearish markets, it becomes a systematic risk when markets turn bullish. Neither '
    'strategy appears to incorporate trend detection (moving averages, ADX, or similar indicators) to filter trade '
    'direction based on market regime. This means both strategies will continue generating short signals even during '
    'strong uptrends, leading to systematic losses. A trend filter is essential for any strategy that shows a strong '
    'directional bias, as it allows the strategy to reduce exposure during adverse market conditions.',
    body_style
))

elements.append(Paragraph('Error #6: 4-Hour Manual Close as Default Exit', h2_style))
elements.append(Paragraph(
    '<b>Severity: MEDIUM</b> | Both strategies overwhelmingly rely on a 4-hour time-based manual close as their '
    'primary exit mechanism (80.4% for Agent, 63.8% for Smart). This creates a situation where the exit is '
    'determined by time rather than price action, which is suboptimal. A trade that is 0.01% in profit at the '
    '4-hour mark is closed with a tiny gain, while the same trade might reach TP if given more time. Conversely, '
    'a trade that is slightly negative at 4 hours is closed at a loss, when it might recover if the time frame '
    'were extended. The 4-hour timeout should be replaced or supplemented with a trailing stop mechanism that '
    'adapts to price action and allows winning trades to run while cutting losers early.',
    body_style
))

# ═══ SECTION 11: IMPROVEMENTS ═══
elements.append(Paragraph('11. Recommended Improvements', h1_style))
elements.append(HRFlowable(width="100%", thickness=1.5, color=ACCENT_BLUE, spaceAfter=10))

elements.append(Paragraph('11.1 Immediate Actions (Priority: Critical)', h2_style))

elements.append(Paragraph(
    '<b>1. Fix Smart Position Sizing:</b> Implement a fixed fractional position sizing model where each trade risks '
    'a maximum of 1-2% of account equity. For a $200 account, this means a maximum position value of $200-400 '
    '(using 1:1 to 2:1 leverage). The current algorithm that generates positions from $254 to $8,657 must be replaced '
    'with a simple formula: Position Size = (Account Equity x Risk Percentage) / SL Distance. This ensures that '
    'every trade, regardless of pair or confidence level, risks the same dollar amount. If the SL is 0.5% away and '
    'the account is $200 with 1% risk, the maximum position is ($200 x 0.01) / 0.005 = $400. This single change '
    'would transform the Smart strategy from a catastrophic loss generator into a controlled risk system.',
    body_style
))

elements.append(Paragraph(
    '<b>2. Fix TP Levels Based on ATR:</b> Replace the current static TP calculation with a dynamic model based on '
    'Average True Range (ATR). Set TP at 1.5-2.0x ATR from entry, which ensures that the profit target is achievable '
    'within the typical price movement of the pair. For example, if BTC/USDT has a 4-hour ATR of $800, then TP '
    'should be set at $1,200-1,600 from entry, not at the current levels that often require $5,000+ moves. Similarly, '
    'SL should be set at 1.0-1.5x ATR, giving the trade enough room to breathe while still limiting risk. This ATR-'
    'based approach naturally adapts to changing volatility conditions across different pairs and timeframes.',
    body_style
))

elements.append(Paragraph(
    '<b>3. Eliminate Duplicate Signal Bug:</b> Add a deduplication check in the signal generation logic. Before '
    'opening a new position on a pair, check if there is already an open position on the same pair with the same '
    'direction and within 0.1% of the entry price. If so, either increase the existing position size (within risk '
    'limits) or skip the new signal entirely. This prevents the rapid-fire 20-55 second duplicate trades observed '
    'in the data and ensures that each trading signal results in exactly one position per pair per direction.',
    body_style
))

elements.append(Paragraph('11.2 Short-Term Improvements (Priority: High)', h2_style))

elements.append(Paragraph(
    '<b>4. Add Trend Context Filter:</b> Implement a simple trend detection mechanism using a combination of '
    'moving averages (e.g., EMA 20 and EMA 50 on the 1-hour timeframe). Only allow buy signals when the fast EMA '
    'is above the slow EMA (uptrend), and only allow sell signals when the fast EMA is below the slow EMA (downtrend). '
    'This single filter could eliminate a significant portion of the Smart strategy\'s losing trades by preventing '
    'long entries during downtrends and short entries during uptrends. The ADX indicator can be added as a secondary '
    'filter to only take trades when the trend is strong enough (ADX above 20-25), avoiding choppy sideways markets '
    'where trend-following strategies underperform.',
    body_style
))

elements.append(Paragraph(
    '<b>5. Replace 4-Hour Timeout with Trailing Stop:</b> Instead of closing all positions after exactly 4 hours, '
    'implement a trailing stop that activates once the trade reaches 0.5x ATR in profit. The trailing distance '
    'should be set at 0.5x ATR, allowing the trade to capture extended moves while protecting profits. If the trade '
    'has not reached the trailing activation level within 4 hours, close it at market. This hybrid approach preserves '
    'the time-based exit as a safety net while giving winning trades room to develop beyond the current arbitrary '
    'time limit. The result should be fewer but larger wins, improving the win/loss asymmetry that currently plagues '
    'both strategies.',
    body_style
))

elements.append(Paragraph(
    '<b>6. Widen Smart Strategy SL to 1.5-2.0x ATR:</b> The current average SL distance of 0.53% is far too tight. '
    'For a pair like DOGE/USDT with high volatility, the SL should be at least 1.5-2.0% from entry. Wider stops '
    'reduce the SL hit rate, which is currently 36.2% - the primary driver of Smart strategy losses. The wider SL '
    'must be compensated with smaller position sizes (as recommended in #1) to maintain constant dollar risk per trade. '
    'The net effect should be: same risk per trade, but fewer stop-outs and more trades that have time to reach TP.',
    body_style
))

elements.append(Paragraph('11.3 Medium-Term Development (Priority: Medium)', h2_style))

elements.append(Paragraph(
    '<b>7. Implement Correlation-Based Portfolio Management:</b> The current system appears to treat each pair '
    'independently, which leads to correlated exposure. When BTC moves, all crypto pairs tend to move in the same '
    'direction, meaning multiple simultaneous positions effectively multiply risk. Implement a portfolio-level risk '
    'check that limits total correlated exposure to 3-5% of account equity. If three long positions are open across '
    'BTC, ETH, and BNB simultaneously, the effective risk is 3x the single-pair risk due to correlation. The system '
    'should either reduce position sizes when correlated positions are open or reject new signals that would exceed '
    'the portfolio-level risk limit.',
    body_style
))

elements.append(Paragraph(
    '<b>8. Add Market Regime Detection:</b> Implement a regime classification system that categorizes market '
    'conditions as trending, ranging, or volatile. Use indicators like ADX (trend strength), Bollinger Band width '
    '(volatility), and volume profiles to classify the current regime. Each regime should trigger different strategy '
    'parameters: in trending markets, use wider stops and let profits run; in ranging markets, use tighter stops and '
    'targets near range boundaries; in volatile markets, reduce position sizes and widen stops. This adaptive approach '
    'is far superior to the current one-size-fits-all parameter set.',
    body_style
))

# ═══ SECTION 12: ALGORITHM DEVELOPMENT ═══
elements.append(Paragraph('12. AI Algorithm Development Roadmap', h1_style))
elements.append(HRFlowable(width="100%", thickness=1.5, color=ACCENT_BLUE, spaceAfter=10))

elements.append(Paragraph('12.1 Phase 1: Foundation (Weeks 1-2)', h2_style))
elements.append(Paragraph(
    'The first phase focuses on fixing the critical errors identified above and establishing a robust baseline. '
    'The priority is implementing fixed fractional position sizing (1% risk per trade), ATR-based SL/TP placement, '
    'signal deduplication, and basic trend filtering. These changes require no machine learning and can be implemented '
    'as rule-based modifications to the existing strategy code. The expected impact is a 50-70% reduction in maximum '
    'drawdown and a shift from negative to slightly positive expectancy, based on the observation that the Smart '
    'strategy is actually profitable on manually closed trades (-${0:.2f} from SL vs +${1:.2f} from manual) and '
    'simply needs fewer SL hits to become net positive.'.format(
        abs(sum(t['pnl'] for t in all_trades_raw if t['strategy']=='Smart' and t['reason']=='SL')),
        sum(t['pnl'] for t in all_trades_raw if t['strategy']=='Smart' and t['reason']=='Manual')
    ),
    body_style
))

elements.append(Paragraph('12.2 Phase 2: Optimization (Weeks 3-4)', h2_style))
elements.append(Paragraph(
    'The second phase introduces adaptive parameters using statistical optimization. Implement a parameter optimization '
    'framework that backtests SL/TP multiples of ATR (0.5x to 3.0x in 0.25x increments), trailing stop activation '
    'levels, and trend filter thresholds. Use walk-forward optimization to avoid overfitting: optimize on the first '
    '70% of data, validate on the remaining 30%, and require the validated performance to be within 20% of the '
    'in-sample performance. This approach identifies the optimal parameter ranges for each pair while protecting '
    'against curve-fitting. Additionally, implement a dynamic position sizing model based on Kelly Criterion: '
    'f* = (bp - q) / b, where b is the win/loss ratio, p is the win probability, and q is the loss probability. '
    'The Kelly fraction should be halved (Half-Kelly) for safety, as full Kelly sizing produces extreme volatility.',
    body_style
))

elements.append(Paragraph('12.3 Phase 3: Machine Learning Enhancement (Weeks 5-8)', h2_style))
elements.append(Paragraph(
    'The third phase introduces machine learning for signal quality assessment. Train a binary classifier (Random '
    'Forest or XGBoost) on historical trade outcomes using features such as: entry price relative to moving averages, '
    'RSI levels, ATR-based volatility, order book imbalance, funding rates, and recent price momentum. The model '
    'outputs a probability of trade success, which is used as a confidence filter: only execute trades where the '
    'model predicts a probability above 55-60%. Additionally, the confidence score can modulate position size within '
    'the risk budget (e.g., 0.5% risk for low-confidence trades, 1.5% for high-confidence). This ML-based approach '
    'addresses the root cause of the Smart strategy\'s 36.2% SL hit rate by filtering out low-quality entries before '
    'they are executed, rather than trying to manage them after entry.',
    body_style
))

elements.append(Paragraph('12.4 Phase 4: Reinforcement Learning (Weeks 9-12)', h2_style))
elements.append(Paragraph(
    'The final phase explores reinforcement learning (RL) for end-to-end trade management. Train a Deep Q-Network '
    '(DQN) or Proximal Policy Optimization (PPO) agent on historical data with the action space defined as: {open '
    'long, open short, hold, close}. The reward function should incorporate risk-adjusted returns (Sharpe ratio or '
    'Sortino ratio) rather than raw P&L, encouraging the agent to optimize for consistent returns rather than '
    'occasional large gains. The RL agent replaces the fixed SL/TP/trailing stop rules with learned exit policies '
    'that adapt to market conditions in real-time. However, this phase should only be pursued after Phases 1-3 '
    'are complete and the strategy is consistently profitable with rule-based logic, as RL requires substantial '
    'training data and is prone to overfitting in financial markets.',
    body_style
))

# ═══ SECTION 13: CONCLUSION ═══
elements.append(Paragraph('13. Summary and Action Plan', h1_style))
elements.append(HRFlowable(width="100%", thickness=1.5, color=ACCENT_BLUE, spaceAfter=10))

action_data = [
    ['Priority', 'Action', 'Expected Impact', 'Timeline'],
    ['Critical', 'Fix Smart position sizing (1% risk)', 'Eliminate catastrophic losses', 'Immediate'],
    ['Critical', 'Implement ATR-based SL/TP', 'Increase TP hit rate from 0% to 25%+', '1-2 days'],
    ['Critical', 'Fix duplicate signal bug', 'Eliminate redundant positions', '1 day'],
    ['High', 'Add trend filter (EMA crossover)', 'Reduce SL hit rate by 30-50%', '3-5 days'],
    ['High', 'Replace 4h timeout with trailing stop', 'Increase avg win by 50-100%', '3-5 days'],
    ['High', 'Widen Smart SL to 1.5-2.0x ATR', 'Reduce SL hit rate below 20%', '2-3 days'],
    ['Medium', 'Portfolio correlation risk limits', 'Prevent correlated blowups', '1-2 weeks'],
    ['Medium', 'Market regime detection', 'Adaptive parameter selection', '2-3 weeks'],
    ['Low', 'ML signal quality classifier', 'Filter bad entries before execution', '4-6 weeks'],
    ['Low', 'RL-based trade management', 'Optimal exit timing', '8-12 weeks'],
]
elements.append(make_table(action_data, col_widths=[2*cm, 5*cm, 4.5*cm, 2.5*cm],
                           header_color=HexColor('#2c3e50')))

elements.append(Spacer(1, 0.5*cm))

elements.append(Paragraph(
    'The analysis reveals that the trading system has a solid foundation in the Agent strategy\'s disciplined '
    'position sizing and the Smart strategy\'s potentially profitable entry logic (positive P&L on manual closes). '
    'The catastrophic losses are not caused by fundamentally bad trading signals but by three solvable problems: '
    'uncontrolled position sizing, unrealistic TP targets, and overly tight stop losses. Fixing these three issues '
    'alone should transform the Smart strategy from a -${0:.2f} loss generator into a profitable system, while '
    'the Agent strategy needs only minor adjustments (trailing stops, better TP targets) to shift from marginal '
    'loss to consistent profit. The recommended 12-week development roadmap provides a structured path from '
    'immediate fixes through statistical optimization to advanced machine learning, with each phase building on '
    'the validated results of the previous phase.'.format(
        abs(smart['total_pnl'])
    ),
    body_style
))

# ── Build PDF ────────────────────────────────────────────────────────────────
doc.build(elements)
print(f"PDF report saved to: {output_path}")
