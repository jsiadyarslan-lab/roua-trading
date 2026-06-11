import os, sys
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import inch, mm
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_JUSTIFY, TA_RIGHT
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image, PageBreak, KeepTogether
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfbase.pdfmetrics import registerFontFamily

# ━━ Color Palette ━━
ACCENT       = colors.HexColor('#512dbd')
TEXT_PRIMARY  = colors.HexColor('#1b1c1e')
TEXT_MUTED    = colors.HexColor('#7a8087')
BG_SURFACE   = colors.HexColor('#dfe3e9')
BG_PAGE      = colors.HexColor('#ecedef')
TABLE_HEADER_COLOR = ACCENT
TABLE_HEADER_TEXT  = colors.white
TABLE_ROW_EVEN     = colors.white
TABLE_ROW_ODD      = BG_SURFACE

# Semantic colors
GREEN = colors.HexColor('#059669')
RED = colors.HexColor('#dc2626')
GOLD = colors.HexColor('#b8860b')

# ━━ Font Registration ━━
pdfmetrics.registerFont(TTFont('DejaVuSerif', '/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf'))
pdfmetrics.registerFont(TTFont('DejaVuSerif-Bold', '/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf'))
pdfmetrics.registerFont(TTFont('DejaVuSans', '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'))
pdfmetrics.registerFont(TTFont('DejaVuSans-Bold', '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'))
pdfmetrics.registerFont(TTFont('SarasaMonoSC', '/usr/share/fonts/truetype/chinese/SarasaMonoSC-Regular.ttf'))
registerFontFamily('DejaVuSerif', normal='DejaVuSerif', bold='DejaVuSerif-Bold')
registerFontFamily('DejaVuSans', normal='DejaVuSans', bold='DejaVuSans-Bold')

# ━━ Styles ━━
title_style = ParagraphStyle(
    name='ReportTitle', fontName='DejaVuSerif', fontSize=24, leading=30,
    alignment=TA_CENTER, textColor=ACCENT, spaceAfter=6
)
subtitle_style = ParagraphStyle(
    name='Subtitle', fontName='DejaVuSerif', fontSize=14, leading=20,
    alignment=TA_CENTER, textColor=TEXT_MUTED, spaceAfter=12
)
h1_style = ParagraphStyle(
    name='H1', fontName='DejaVuSerif', fontSize=18, leading=24,
    textColor=ACCENT, spaceBefore=18, spaceAfter=10
)
h2_style = ParagraphStyle(
    name='H2', fontName='DejaVuSerif', fontSize=14, leading=20,
    textColor=TEXT_PRIMARY, spaceBefore=12, spaceAfter=8
)
body_style = ParagraphStyle(
    name='Body', fontName='DejaVuSerif', fontSize=10.5, leading=17,
    alignment=TA_JUSTIFY, textColor=TEXT_PRIMARY, spaceAfter=8
)
callout_style = ParagraphStyle(
    name='Callout', fontName='DejaVuSerif', fontSize=11, leading=17,
    alignment=TA_LEFT, textColor=ACCENT, leftIndent=24, borderPadding=8,
    spaceAfter=10, spaceBefore=6
)
caption_style = ParagraphStyle(
    name='Caption', fontName='DejaVuSerif', fontSize=9, leading=14,
    alignment=TA_CENTER, textColor=TEXT_MUTED, spaceAfter=6, spaceBefore=3
)
header_cell_style = ParagraphStyle(
    name='HeaderCell', fontName='DejaVuSerif', fontSize=10,
    textColor=colors.white, alignment=TA_CENTER
)
cell_style = ParagraphStyle(
    name='Cell', fontName='DejaVuSerif', fontSize=9.5,
    textColor=TEXT_PRIMARY, alignment=TA_CENTER
)
cell_left_style = ParagraphStyle(
    name='CellLeft', fontName='DejaVuSerif', fontSize=9.5,
    textColor=TEXT_PRIMARY, alignment=TA_LEFT
)
metric_style = ParagraphStyle(
    name='Metric', fontName='DejaVuSerif', fontSize=28, leading=34,
    alignment=TA_CENTER, textColor=RED
)
metric_label_style = ParagraphStyle(
    name='MetricLabel', fontName='DejaVuSerif', fontSize=10, leading=14,
    alignment=TA_CENTER, textColor=TEXT_MUTED
)

# ━━ Document Setup ━━
output_path = '/home/z/my-project/download/roua_trading_analysis.pdf'
page_w, page_h = A4
left_m = right_m = 0.9 * inch
top_m = bottom_m = 0.8 * inch
available_w = page_w - left_m - right_m

doc = SimpleDocTemplate(
    output_path, pagesize=A4,
    leftMargin=left_m, rightMargin=right_m,
    topMargin=top_m, bottomMargin=bottom_m,
    title='Roua Trading Performance Analysis',
    author='Z.ai',
    subject='Algorithmic Trading Performance Analysis - May 22 to June 8, 2024'
)

story = []

# ━━ COVER SECTION (inline, since we skip HTML cover for simplicity) ━━
story.append(Spacer(1, 60))
story.append(Paragraph('<b>Roua Trading Platform</b>', title_style))
story.append(Spacer(1, 8))
story.append(Paragraph('<b>Comprehensive Trading Performance Analysis</b>', ParagraphStyle(
    name='CoverTitle2', fontName='DejaVuSerif', fontSize=20, leading=26,
    alignment=TA_CENTER, textColor=TEXT_PRIMARY
)))
story.append(Spacer(1, 12))
story.append(Paragraph('500 Trades | May 22 - June 8, 2024 | Agent & Smart Executors', subtitle_style))
story.append(Spacer(1, 30))

# Key metrics dashboard
metrics_data = [
    [Paragraph('<b>Net P&L</b>', header_cell_style),
     Paragraph('<b>Win Rate</b>', header_cell_style),
     Paragraph('<b>Profit Factor</b>', header_cell_style),
     Paragraph('<b>Total Trades</b>', header_cell_style)],
    [Paragraph('<b>-$932.62</b>', ParagraphStyle(name='RedCell', fontName='DejaVuSerif', fontSize=14, textColor=RED, alignment=TA_CENTER)),
     Paragraph('<b>36.6%</b>', ParagraphStyle(name='RedCell2', fontName='DejaVuSerif', fontSize=14, textColor=RED, alignment=TA_CENTER)),
     Paragraph('<b>0.617</b>', ParagraphStyle(name='RedCell3', fontName='DejaVuSerif', fontSize=14, textColor=RED, alignment=TA_CENTER)),
     Paragraph('<b>500</b>', ParagraphStyle(name='NeutralCell', fontName='DejaVuSerif', fontSize=14, textColor=TEXT_PRIMARY, alignment=TA_CENTER))]
]
metrics_table = Table(metrics_data, colWidths=[available_w*0.25]*4, hAlign='CENTER')
metrics_table.setStyle(TableStyle([
    ('BACKGROUND', (0, 0), (-1, 0), ACCENT),
    ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
    ('BACKGROUND', (0, 1), (-1, 1), colors.HexColor('#fef2f2')),
    ('GRID', (0, 0), (-1, -1), 1, colors.HexColor('#e5e7eb')),
    ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ('TOPPADDING', (0, 0), (-1, -1), 10),
    ('BOTTOMPADDING', (0, 0), (-1, -1), 10),
]))
story.append(metrics_table)
story.append(Spacer(1, 20))
story.append(Paragraph('Automated Analysis by Z.ai | Data-Driven Algorithmic Trading Diagnostics', caption_style))
story.append(PageBreak())

# ━━ SECTION 1: EXECUTIVE SUMMARY ━━
story.append(Paragraph('<b>1. Executive Summary</b>', h1_style))
story.append(Paragraph(
    'This report presents a comprehensive analysis of 500 automated trades executed by the Roua Trading Platform '
    'over the period from May 22 to June 8, 2024. The trading system operates with two distinct executors: '
    '<b>Agent</b> (autonomous trader with smaller position sizes) and <b>Smart</b> (smart-executor with larger '
    'position sizes). The analysis reveals severe systemic failures across both executors, resulting in a net '
    'loss of <b>-$932.62</b> over the analysis period. The system exhibits multiple critical algorithmic flaws '
    'including extreme directional bias, inadequate risk management, rapid-fire duplicate trade execution, '
    'and catastrophic position sizing on the Smart executor. Without immediate intervention, the platform will '
    'continue to erode capital at an accelerating rate.',
    body_style
))
story.append(Paragraph(
    'The fundamental problem is not that the system occasionally loses money - all trading systems experience '
    'losses. The critical issue is that <b>the system is mathematically incapable of profitability</b> in its '
    'current configuration. With a win rate of only 36.6% and a profit factor of 0.617, the system would need '
    'to either nearly double its win rate to approximately 63% or triple its average win-to-loss ratio just to '
    'break even. Neither outcome is achievable through minor parameter adjustments - the core trading logic, '
    'risk management framework, and execution architecture all require fundamental redesign.',
    body_style
))

# ━━ SECTION 2: OVERALL PERFORMANCE ━━
story.append(Paragraph('<b>2. Overall Performance Metrics</b>', h1_style))

# Performance comparison table
perf_data = [
    [Paragraph('<b>Metric</b>', header_cell_style),
     Paragraph('<b>Agent</b>', header_cell_style),
     Paragraph('<b>Smart</b>', header_cell_style),
     Paragraph('<b>Combined</b>', header_cell_style)],
    [Paragraph('Total Trades', cell_left_style), Paragraph('188', cell_style), Paragraph('312', cell_style), Paragraph('500', cell_style)],
    [Paragraph('Win Rate', cell_left_style), Paragraph('35.6%', cell_style), Paragraph('37.2%', cell_style), Paragraph('36.6%', cell_style)],
    [Paragraph('Total P&L', cell_left_style), Paragraph('-$157.37', cell_style), Paragraph('-$775.25', cell_style), Paragraph('-$932.62', cell_style)],
    [Paragraph('Avg Win', cell_left_style), Paragraph('$3.73', cell_style), Paragraph('$10.82', cell_style), Paragraph('$8.22', cell_style)],
    [Paragraph('Avg Loss', cell_left_style), Paragraph('-$3.40', cell_style), Paragraph('-$10.36', cell_style), Paragraph('-$7.71', cell_style)],
    [Paragraph('Profit Factor', cell_left_style), Paragraph('0.614', cell_style), Paragraph('0.618', cell_style), Paragraph('0.617', cell_style)],
    [Paragraph('Avg Notional', cell_left_style), Paragraph('$193', cell_style), Paragraph('$1,242', cell_style), Paragraph('$836', cell_style)],
    [Paragraph('Max Consec. Losses', cell_left_style), Paragraph('22', cell_style), Paragraph('21', cell_style), Paragraph('-', cell_style)],
]
cw = [available_w*0.30, available_w*0.22, available_w*0.24, available_w*0.24]
perf_table = Table(perf_data, colWidths=cw, hAlign='CENTER')
ts = [
    ('BACKGROUND', (0, 0), (-1, 0), TABLE_HEADER_COLOR),
    ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
    ('GRID', (0, 0), (-1, -1), 0.5, TEXT_MUTED),
    ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ('LEFTPADDING', (0, 0), (-1, -1), 8),
    ('RIGHTPADDING', (0, 0), (-1, -1), 8),
    ('TOPPADDING', (0, 0), (-1, -1), 5),
    ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
]
for i in range(1, len(perf_data)):
    bg = TABLE_ROW_EVEN if i % 2 == 0 else TABLE_ROW_ODD
    ts.append(('BACKGROUND', (0, i), (-1, i), bg))
perf_table.setStyle(TableStyle(ts))
story.append(Spacer(1, 12))
story.append(perf_table)
story.append(Spacer(1, 6))
story.append(Paragraph('Table 1: Overall Performance Comparison by Executor', caption_style))

story.append(Paragraph(
    'The Smart executor is responsible for 83.1% of total losses ($775.25 out of $932.62) despite having a '
    'marginally higher win rate of 37.2% compared to Agent\'s 35.6%. This is because the Smart executor\'s '
    'average position notional value of $1,242 is approximately 6.4 times larger than the Agent\'s average '
    'of $193. Each Smart executor loss therefore extracts significantly more capital from the account, '
    'amplifying the impact of the already-low win rate. The profit factor for both executors hovers around '
    '0.617, meaning that for every dollar won, the system loses approximately $1.62. This is a recipe for '
    'guaranteed capital destruction over time.',
    body_style
))

# ━━ SECTION 3: CHART 1 - EXECUTOR PERFORMANCE ━━
story.append(Paragraph('<b>3. Visual Performance Analysis</b>', h1_style))
story.append(Paragraph('<b>3.1 Executor Performance Dashboard</b>', h2_style))

img1_path = '/home/z/my-project/download/chart1_executor_performance.png'
if os.path.exists(img1_path):
    img1 = Image(img1_path, width=available_w, height=available_w*0.65)
    story.append(img1)
    story.append(Spacer(1, 6))
    story.append(Paragraph('Figure 1: Executor Performance - Win Rate, P&L, Direction Distribution, Close Reasons', caption_style))

story.append(Paragraph(
    'Figure 1 illustrates four critical dimensions of executor performance. The win rate comparison shows both '
    'executors operating well below the 50% breakeven threshold. The P&L chart reveals that Smart executor losses '
    'dwarf Agent losses due to oversized positions. The direction distribution exposes the extreme sell bias: '
    'Agent executes 92% sells while Smart executes 71.8% sells, indicating the AI models are systematically '
    'biased toward short positions regardless of market conditions. The close reason breakdown shows that SL '
    '(stop-loss) exits are the dominant loss driver, particularly for the Smart executor where SL losses total '
    '-$1,590.56, while Manual and TP exits barely offset a fraction of these losses.',
    body_style
))

# ━━ SECTION 4: PAIR ANALYSIS ━━
story.append(Paragraph('<b>3.2 Pair-Level Performance</b>', h2_style))

img2_path = '/home/z/my-project/download/chart2_pair_analysis.png'
if os.path.exists(img2_path):
    img2 = Image(img2_path, width=available_w, height=available_w*0.45)
    story.append(img2)
    story.append(Spacer(1, 6))
    story.append(Paragraph('Figure 2: P&L and Win Rate by Trading Pair and Executor', caption_style))

# Pair performance table
pair_data = [
    [Paragraph('<b>Pair</b>', header_cell_style),
     Paragraph('<b>Agent Trades</b>', header_cell_style),
     Paragraph('<b>Agent WR</b>', header_cell_style),
     Paragraph('<b>Agent P&L</b>', header_cell_style),
     Paragraph('<b>Smart Trades</b>', header_cell_style),
     Paragraph('<b>Smart WR</b>', header_cell_style),
     Paragraph('<b>Smart P&L</b>', header_cell_style)],
]
pairs_info = [
    ('BTC/USDT', 19, '36.8%', '-$176.22', 42, '40.5%', '-$254.81'),
    ('DOGE/USDT', 48, '31.2%', '-$9.01', 47, '34.0%', '-$190.29'),
    ('BNB/USDT', 19, '47.4%', '$23.76', 48, '33.3%', '-$170.28'),
    ('ADA/USDT', 26, '50.0%', '$33.31', 42, '23.8%', '-$141.76'),
    ('ETH/USDT', 23, '34.8%', '-$8.26', 43, '39.5%', '-$124.89'),
    ('SOL/USDT', 33, '27.3%', '-$17.48', 43, '39.5%', '$41.79'),
    ('XRP/USDT', 20, '30.0%', '-$3.47', 47, '48.9%', '$64.99'),
]
for p in pairs_info:
    row = [Paragraph(p[0], cell_left_style)]
    for v in p[1:]:
        sv = str(v)
        tc = RED if sv.startswith('-') else GREEN if sv.startswith('$') and sv != '$0.00' else TEXT_PRIMARY
        row.append(Paragraph(sv, ParagraphStyle(name=f'Cell_{p[0]}_{sv}', fontName='DejaVuSerif', fontSize=9, textColor=tc, alignment=TA_CENTER)))
    pair_data.append(row)

pcw = [available_w*0.13, available_w*0.12, available_w*0.11, available_w*0.13, available_w*0.13, available_w*0.11, available_w*0.14]
pair_table = Table(pair_data, colWidths=pcw, hAlign='CENTER')
pts = [
    ('BACKGROUND', (0, 0), (-1, 0), TABLE_HEADER_COLOR),
    ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
    ('GRID', (0, 0), (-1, -1), 0.5, TEXT_MUTED),
    ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ('LEFTPADDING', (0, 0), (-1, -1), 6),
    ('RIGHTPADDING', (0, 0), (-1, -1), 6),
    ('TOPPADDING', (0, 0), (-1, -1), 4),
    ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
]
for i in range(1, len(pair_data)):
    bg = TABLE_ROW_EVEN if i % 2 == 0 else TABLE_ROW_ODD
    pts.append(('BACKGROUND', (0, i), (-1, i), bg))
pair_table.setStyle(TableStyle(pts))
story.append(Spacer(1, 12))
story.append(pair_table)
story.append(Spacer(1, 6))
story.append(Paragraph('Table 2: Detailed Pair Performance by Executor', caption_style))

story.append(Paragraph(
    'The pair-level analysis reveals that <b>BTC/USDT is the single biggest destroyer of capital</b>, '
    'contributing -$430.33 in combined losses (46% of total). The Smart executor\'s BTC trades alone lost '
    '-$254.81 despite a relatively decent 40.5% win rate, indicating that when BTC trades lose, they lose '
    'big due to oversized position sizes. DOGE/USDT and BNB/USDT are also major loss centers for the Smart '
    'executor. Notably, ADA/USDT has a 50% win rate for Agent (profitable at +$33.31) but only 23.8% for '
    'Smart (losing -$141.76), suggesting the Smart executor\'s position sizing overwhelms its signal quality. '
    'The only pair where Smart is consistently profitable is XRP/USDT (+$64.99) with the highest Smart win '
    'rate of 48.9%.',
    body_style
))

# ━━ SECTION 5: RISK & RETURN ━━
story.append(Paragraph('<b>3.3 Risk & Return Distribution</b>', h2_style))

img3_path = '/home/z/my-project/download/chart3_risk_return.png'
if os.path.exists(img3_path):
    img3 = Image(img3_path, width=available_w, height=available_w*0.45)
    story.append(img3)
    story.append(Spacer(1, 6))
    story.append(Paragraph('Figure 3: P&L Distribution and Position Size Comparison', caption_style))

story.append(Paragraph(
    'The P&L distribution chart reveals a heavily right-skewed loss distribution for both executors. The Smart '
    'executor has a much wider distribution with extreme negative outliers (tail losses exceeding -$100), while '
    'the Agent executor\'s losses are more contained but still dominant. The box plot comparison of notional '
    'position values is perhaps the most alarming visualization: the Smart executor\'s median notional is '
    'approximately $483 compared to the Agent\'s $182, with Smart outliers reaching over $6,000. These '
    'extreme position sizes on the Smart executor create asymmetric risk exposure where a single adverse '
    'price movement can wipe out dozens of small gains.',
    body_style
))

# ━━ SECTION 6: CUMULATIVE P&L ━━
story.append(Paragraph('<b>3.4 Cumulative P&L Trajectory</b>', h2_style))

img5_path = '/home/z/my-project/download/chart5_cumulative.png'
if os.path.exists(img5_path):
    img5 = Image(img5_path, width=available_w, height=available_w*0.45)
    story.append(img5)
    story.append(Spacer(1, 6))
    story.append(Paragraph('Figure 4: Cumulative P&L Trajectory by Executor', caption_style))

story.append(Paragraph(
    'The cumulative P&L trajectory tells the complete story of capital erosion. The Agent executor shows a '
    'gradual, relatively controlled decline, reflecting its smaller position sizes. The Smart executor, however, '
    'exhibits a steep and accelerating downward trajectory punctuated by occasional recoveries that are quickly '
    'erased by subsequent large losses. This pattern is characteristic of a system with inadequate loss limits '
    'and no circuit-breaker mechanisms. The Smart executor never establishes a sustained uptrend, and each '
    'recovery peak is lower than the previous one - a classic sign of a deteriorating trading system.',
    body_style
))

# ━━ SECTION 7: CLOSE REASON WATERFALL ━━
story.append(Paragraph('<b>3.5 Close Reason P&L Waterfall</b>', h2_style))

img6_path = '/home/z/my-project/download/chart6_waterfall.png'
if os.path.exists(img6_path):
    img6 = Image(img6_path, width=available_w, height=available_w*0.45)
    story.append(img6)
    story.append(Spacer(1, 6))
    story.append(Paragraph('Figure 5: P&L Contribution by Close Reason for Each Executor', caption_style))

story.append(Paragraph(
    'The waterfall analysis by close reason is devastating. For the Smart executor, SL (stop-loss) exits '
    'produced a catastrophic -$1,590.56 in losses, while Manual exits contributed +$378.05 and TP exits '
    'contributed +$437.26. This means the Smart executor\'s stop-losses are triggered far too frequently, '
    'and when they are triggered, the losses are massive due to oversized positions. For the Agent executor, '
    'the pattern is different: Manual exits are profitable (+$55.84), SL exits lose heavily (-$165.68), and '
    'even TP exits are net negative (-$47.53) - which is extraordinary and suggests that the take-profit '
    'levels are set so tightly that they capture only minimal gains while still exposing the trade to '
    'eventual stop-loss if the TP is not immediately hit.',
    body_style
))

# ━━ SECTION 8: CRITICAL ERRORS ━━
story.append(Paragraph('<b>4. Critical Errors Identified</b>', h1_style))

img4_path = '/home/z/my-project/download/chart4_errors.png'
if os.path.exists(img4_path):
    img4 = Image(img4_path, width=available_w, height=available_w*0.55)
    story.append(img4)
    story.append(Spacer(1, 6))
    story.append(Paragraph('Figure 6: Critical Error Severity Ranking', caption_style))

story.append(Paragraph('<b>4.1 Extreme Sell Bias (Severity: 85/100)</b>', h2_style))
story.append(Paragraph(
    'The system executed 79.4% of all trades as SELL positions (397 sells vs 103 buys). For the Agent '
    'executor, the bias is even more extreme at 92% sells. This indicates that the AI strategic council '
    'and signal generation pipeline are overwhelmingly biased toward bearish signals, regardless of actual '
    'market conditions. In a market that was generally declining during this period, the sell bias was partially '
    'correct directionally, but the system still lost money on sells because the risk-reward ratios were '
    'inverted. A healthy algorithmic system should be roughly balanced between long and short positions, with '
    'directional allocation driven by market regime detection rather than a hardcoded bias. The current behavior '
    'suggests either a systematic error in the AI consensus mechanism, an over-weighting of bearish indicators '
    'in the signal generation pipeline, or a fundamental flaw in the Strategic Council\'s market regime classification.',
    body_style
))

story.append(Paragraph('<b>4.2 Inadequate Win Rate (Severity: 90/100)</b>', h2_style))
story.append(Paragraph(
    'With an overall win rate of 36.6%, the system falls far below the minimum threshold required for '
    'profitability. The mathematical breakeven win rate depends on the risk-reward ratio: for a 1:1 R:R, '
    'breakeven requires >50% win rate; for 1.5:1, it requires >40%; for 2:1, it requires >33.3%. While '
    'the average R:R ratio appears reasonable at 2.14, the effective R:R experienced by the system is far '
    'lower because many winning trades are closed early (via Manual timeout at 4 hours) rather than reaching '
    'their take-profit targets. The Smart executor\'s Buy positions are especially problematic with only a '
    '27.3% win rate, indicating that the system has virtually no edge when going long. This suggests the '
    'AI models generating buy signals are significantly underperforming, and the signal confidence scoring '
    'mechanism is not properly filtering out low-conviction trades.',
    body_style
))

story.append(Paragraph('<b>4.3 Catastrophic Profit Factor (Severity: 95/100)</b>', h2_style))
story.append(Paragraph(
    'The profit factor of 0.617 is the single most damning metric in this analysis. A profit factor below '
    '1.0 means the system loses money; a value of 0.617 means that for every $1.00 of gross profit, the '
    'system generates $1.62 in gross losses. The gross profit across all trades was $1,504.75 while gross '
    'losses totaled $2,437.37. To achieve breakeven, the system would need to either increase gross profits '
    'by 62% or reduce gross losses by 38% - both requiring fundamental changes to the trading algorithm. '
    'A professional algorithmic trading system typically targets a profit factor of 1.5-2.0 or higher. '
    'The current system is operating at less than half the minimum acceptable level, confirming that the '
    'underlying strategy is not viable in its current form.',
    body_style
))

story.append(Paragraph('<b>4.4 Stop-Loss Hemorrhage (Severity: 92/100)</b>', h2_style))
story.append(Paragraph(
    'Stop-loss exits account for -$1,756.24 in losses across all trades, representing 72.1% of total gross '
    'losses. For the Smart executor alone, SL losses total -$1,590.56. This pattern indicates that the '
    'stop-loss levels are set too close to the entry price, causing trades to be stopped out by normal market '
    'noise before having a chance to develop in the anticipated direction. The average SL distance for the '
    'Smart executor is only 0.817% from entry, which in volatile crypto markets is well within the range of '
    'normal price fluctuations. When a stop-loss is placed within the noise range, the probability of being '
    'stopped out by random price action rather than a genuine trend reversal approaches 80-90%, which aligns '
    'closely with the observed win rates. The system is essentially gambling that price will immediately move '
    'in the predicted direction, with no tolerance for the natural oscillation that occurs in all markets.',
    body_style
))

story.append(Paragraph('<b>4.5 Smart Executor Oversized Positions (Severity: 88/100)</b>', h2_style))
story.append(Paragraph(
    'The Smart executor\'s average notional position value of $1,242 is 6.4x larger than the Agent\'s $193. '
    'More critically, the maximum Smart notional reaches $6,256.55 (BTC/USDT trade on June 5), while Agent '
    'peaks at $833 (ADA/USDT trade on June 8). This extreme position sizing asymmetry means that a single '
    'Smart executor loss can wipe out multiple Agent wins. For example, the single worst trade (BTC/USDT, '
    'Smart, -$118.59) eliminated the gains from approximately 32 average Agent wins. The Smart executor has '
    'no adaptive position sizing based on market volatility, signal confidence, or recent performance. It '
    'applies a fixed large position size regardless of conditions, which is a fundamental risk management '
    'failure. Professional systems use volatility-adjusted position sizing (ATR-based), Kelly criterion, or '
    'risk parity models to ensure no single trade can cause catastrophic damage.',
    body_style
))

story.append(Paragraph('<b>4.6 Rapid-Fire Duplicate Trades (Severity: 70/100)</b>', h2_style))
story.append(Paragraph(
    'The analysis detected numerous instances of rapid-fire duplicate trades, particularly on DOGE/USDT by '
    'the Agent executor. Between 8:25 AM and 8:39 AM on June 5, the Agent executor opened 10 consecutive '
    'DOGE/USDT sell positions with nearly identical parameters (entry within 0.2% of each other, sizes '
    'differing by less than 2%, identical stop-loss and take-profit levels). Each trade was opened and closed '
    'within 8-10 seconds. This pattern indicates a critical bug in the trade execution pipeline - likely the '
    'SmartExecutor tick handler (which runs every 10 seconds) is not properly checking for existing open '
    'positions before placing new orders. The result is that multiple identical positions are opened and then '
    'immediately closed at a small loss as the take-profit level is hit. These micro-losses compound quickly: '
    'the 10 duplicate DOGE trades on June 5 collectively lost -$6.25 in just 14 minutes. Similar patterns '
    'appear on SOL/USDT (3 duplicates on June 5) and multiple other pairs throughout the dataset.',
    body_style
))

story.append(Paragraph('<b>4.7 4-Hour Timeout Close Pattern (Severity: 65/100)</b>', h2_style))
story.append(Paragraph(
    'A significant portion of "Manual" close reasons correspond to trades with exactly 4-hour durations, '
    'indicating an automated timeout mechanism. These 4-hour timeout closes are problematic because they '
    'force-close positions that may still be developing. While Manual closes are net profitable for both '
    'executors (Agent: +$55.84, Smart: +$378.05), the 4-hour timeout means the system is leaving potential '
    'profits on the table for winning trades while also preventing the stop-loss from being hit on losing '
    'trades that might eventually recover. The timeout creates an asymmetric outcome where winning trades '
    'are prematurely closed while losing trades survive until either the timeout or stop-loss hits. A more '
    'sophisticated approach would use trailing stops, time-based decay of signal confidence, or dynamic '
    'exit strategies rather than a fixed 4-hour cutoff.',
    body_style
))

story.append(Paragraph('<b>4.8 BTC Entry Price Anomaly (Severity: 60/100)</b>', h2_style))
story.append(Paragraph(
    'One trade exhibits an impossible entry price: BTC/USDT Agent Sell with entry at $1,921.80 instead of '
    'the correct ~$62,000+ range. This is clearly a data error - likely a decimal point displacement or a '
    'unit conversion bug (the system may have treated the entry as $1,921.80 per 0.001 BTC or similar). '
    'This trade recorded a loss of -$177.47, making it the single worst trade in the entire dataset. '
    'The error suggests that the order placement pipeline does not have adequate validation checks on '
    'entry prices against current market prices. A simple sanity check (entry price must be within 10% '
    'of the last known market price) would catch this type of error. This bug alone accounts for 19% '
    'of total losses and is completely preventable.',
    body_style
))

story.append(Paragraph('<b>4.9 Maximum Consecutive Losses (Severity: 85/100)</b>', h2_style))
story.append(Paragraph(
    'Both executors experienced extreme consecutive loss streaks: Agent had 22 consecutive losses and Smart '
    'had 21. These streaks are far beyond what would be expected from random chance at the observed win rate, '
    'suggesting that the system enters persistent losing modes where the AI signals are consistently wrong. '
    'During these streaks, the system continues to open new positions with the same parameters and sizing, '
    'compounding losses. A professional system would implement circuit breakers that halt trading after a '
    'defined number of consecutive losses, reduce position sizes during losing streaks, or switch to a '
    'more conservative strategy until the signal quality improves. The absence of any such mechanism is a '
    'critical oversight that allows temporary signal degradation to cause disproportionate capital damage.',
    body_style
))

story.append(Paragraph('<b>4.10 Buy Position Win Rate Collapse (Severity: 78/100)</b>', h2_style))
story.append(Paragraph(
    'The Smart executor\'s Buy positions have a devastating win rate of only 27.3% (88 buy trades, only 24 '
    'profitable). This means that when the system decides to go long, it is wrong nearly three out of four '
    'times. The total P&L for Smart Buy positions is -$177.88. This is a clear indication that the AI '
    'models have a severe deficiency in identifying bullish opportunities. The Agent executor\'s Buy win '
    'rate is marginally better at 33.3%, but with only 15 buy trades, the sample size is too small to '
    'draw statistical conclusions. The combination of extreme sell bias and poor buy performance suggests '
    'that the Strategic Council\'s consensus mechanism may be systematically misinterpreting market signals, '
    'particularly during periods of market recovery or consolidation where bullish positions would be '
    'appropriate.',
    body_style
))

# ━━ SECTION 9: IMPROVEMENTS ━━
story.append(Paragraph('<b>5. Proposed Algorithmic Improvements</b>', h1_style))

story.append(Paragraph('<b>5.1 Risk Management Overhaul</b>', h2_style))
story.append(Paragraph(
    '<b>5.1.1 Volatility-Adjusted Position Sizing:</b> Replace the current fixed-size approach with an ATR-based '
    'position sizing model. Calculate the Average True Range (ATR) for each pair at multiple timeframes (1h, 4h, '
    '1D) and set position size such that the maximum risk per trade does not exceed 1-2% of total portfolio equity. '
    'The formula should be: Position Size = (Account Equity x Risk%) / (ATR x Multiplier). This ensures that '
    'volatile assets like BTC and DOGE automatically receive smaller positions while less volatile assets can '
    'accommodate larger sizes. The multiplier should be calibrated through backtesting to achieve the desired '
    'risk-reward profile.',
    body_style
))
story.append(Paragraph(
    '<b>5.1.2 Dynamic Stop-Loss Placement:</b> The current stop-loss distances of 0.8% (Smart) are far too '
    'tight for crypto markets. Implement a volatility-adjusted stop-loss system where the SL distance is '
    'calculated as a multiple of ATR (e.g., 1.5-2.5x ATR for swing trades, 0.5-1.0x ATR for scalps). '
    'Additionally, implement a minimum SL distance of 1.5% for major pairs (BTC, ETH) and 2.5% for volatile '
    'pairs (DOGE, ADA, SOL) to prevent stop-outs from normal market noise. The current approach of placing '
    'stops within the noise range guarantees consistent losses regardless of signal quality.',
    body_style
))
story.append(Paragraph(
    '<b>5.1.3 Circuit Breaker System:</b> Implement a multi-tier circuit breaker that progressively reduces '
    'trading activity during losing streaks. Tier 1: After 5 consecutive losses, reduce position size by 50%. '
    'Tier 2: After 10 consecutive losses, reduce to 25% size and increase minimum signal confidence threshold '
    'from the current level to 75%. Tier 3: After 15 consecutive losses, halt all new position openings and '
    'enter a cooldown period of 2-4 hours. Tier 4: After a daily drawdown exceeds 5% of equity, suspend '
    'trading for the remainder of the day. This system prevents the catastrophic loss streaks observed in the data.',
    body_style
))

story.append(Paragraph('<b>5.2 Signal Quality Enhancement</b>', h2_style))
story.append(Paragraph(
    '<b>5.2.1 Balanced Direction Allocation:</b> Implement a direction quota system that ensures the AI '
    'generates signals for both long and short positions. The current 79.4% sell bias indicates the AI is '
    'not properly detecting bullish market conditions. Add a market regime classifier (trending up, trending '
    'down, ranging) as a mandatory input to the Strategic Council. In uptrend regimes, bias signal generation '
    'toward buy signals; in downtrend regimes, bias toward sells; in ranging markets, generate both long and '
    'short signals with tighter parameters. The regime classifier should use a combination of moving average '
    'crossovers, ADX trend strength, and volume profile analysis to determine the current market state.',
    body_style
))
story.append(Paragraph(
    '<b>5.2.2 Signal Confidence Scoring:</b> Every trade signal should carry a confidence score (0-100) that '
    'determines position size and risk parameters. Currently, the system appears to execute all signals with '
    'similar sizing regardless of signal quality. A proper confidence scoring system would factor in: agreement '
    'level among AI council members, confluence of technical indicators, alignment with higher-timeframe trend, '
    'and recent accuracy of similar signals. Only signals above a minimum confidence threshold (e.g., 60%) '
    'should be executed, and position size should scale linearly with confidence (60% confidence = 50% of base '
    'size, 80% = 100%, 95% = 120%).',
    body_style
))
story.append(Paragraph(
    '<b>5.2.3 Duplicate Trade Prevention:</b> Implement a cooldown mechanism that prevents opening a new '
    'position on the same pair within a minimum time window (e.g., 5 minutes for Agent, 2 minutes for Smart). '
    'Additionally, check for existing open positions on the same pair before placing a new order. If a position '
    'already exists, either skip the signal or adjust the existing position (add to it with reduced size) rather '
    'than creating a duplicate. The SmartExecutor tick handler (currently running every 10 seconds) must '
    'maintain a state of open positions and skip duplicate signals within the cooldown window.',
    body_style
))

story.append(Paragraph('<b>5.3 Execution Architecture Fixes</b>', h2_style))
story.append(Paragraph(
    '<b>5.3.1 Entry Price Validation:</b> Before placing any order, validate that the entry price is within '
    'a reasonable range of the current market price (e.g., within 5% for limit orders, within 1% for market '
    'orders). Reject any order where the entry price deviates by more than 5% from the last known market price, '
    'as this indicates a calculation error or data feed issue. This single check would have prevented the '
    '-$177.47 BTC entry anomaly and similar errors. The validation should occur in the RiskGatekeeper module '
    'before the order is dispatched to the execution adapter.',
    body_style
))
story.append(Paragraph(
    '<b>5.3.2 Dynamic Exit Strategy:</b> Replace the fixed 4-hour timeout with a dynamic exit system. '
    'Implement trailing stops that move the stop-loss to breakeven after the price moves 1x ATR in favor, '
    'then trail at 1x ATR behind the current price. For losing trades, implement a time-decay function '
    'that tightens the stop-loss as the trade ages, rather than a hard timeout. After 2 hours, move the SL '
    'to breakeven; after 3 hours, move it to entry + 0.5x ATR; after 4 hours, close the position. This '
    'graduated approach allows winning trades more room to develop while cutting losses more aggressively '
    'on trades that are not moving in the expected direction.',
    body_style
))
story.append(Paragraph(
    '<b>5.3.3 Adaptive Risk-Reward Calibration:</b> The current R:R ratios are theoretically acceptable '
    '(average 2.14) but practically ineffective because take-profit levels are rarely reached while stop-losses '
    'are hit frequently. Implement a dynamic R:R system that adjusts based on realized hit rates. If the TP '
    'hit rate for a given pair over the last 50 trades is below 30%, widen the stop-loss and tighten the '
    'take-profit (e.g., shift from 2:1 R:R to 1.5:1) to increase the win rate while maintaining acceptable '
    'profitability. Conversely, if the TP hit rate exceeds 50%, consider widening the TP target to capture '
    'larger moves. The system should continuously recalibrate its R:R parameters based on recent performance '
    'data for each pair and direction.',
    body_style
))

story.append(Paragraph('<b>5.4 Smart Executor Specific Improvements</b>', h2_style))
story.append(Paragraph(
    '<b>5.4.1 Maximum Position Size Cap:</b> Implement an absolute maximum notional position size for the '
    'Smart executor, capped at 3x the Agent executor\'s average position size (approximately $600). Currently, '
    'Smart positions can reach $6,000+, which is 31x the Agent average. Even with improved signal quality, '
    'positions this large create unacceptable concentration risk. The cap should be dynamic and based on '
    'portfolio equity: max position = min(fixed_cap, 5% of portfolio equity). This ensures that no single '
    'trade can cause more than a 5% drawdown even if the stop-loss is hit at maximum distance.',
    body_style
))
story.append(Paragraph(
    '<b>5.4.2 Daily Loss Limit:</b> Implement a hard daily loss limit for the Smart executor. If the '
    'cumulative daily P&L for Smart exceeds -$100 (or 3% of portfolio equity), automatically suspend all '
    'Smart executor trading for the remainder of the day. This prevents the cascading losses observed in the '
    'data where Smart loses $200-300+ in a single day across multiple trades. The Agent executor should have '
    'a separate, lower daily loss limit (e.g., -$30 or 1% of equity). Both limits should be implemented at '
    'the RiskGatekeeper level, before any new orders are placed.',
    body_style
))
story.append(Paragraph(
    '<b>5.4.3 Correlation Filter:</b> The Smart executor frequently opens simultaneous positions on highly '
    'correlated pairs (e.g., BTC and ETH, or ADA and DOGE), effectively doubling or tripling exposure to the '
    'same market direction. Implement a correlation matrix that tracks the 30-day rolling correlation between '
    'all pairs. If the aggregate directional exposure across correlated pairs exceeds a threshold (e.g., '
    'combined notional > 10% of portfolio equity in the same direction), block new positions that would '
    'increase this exposure. This prevents the system from accidentally creating leveraged bets on a single '
    'market thesis through multiple correlated positions.',
    body_style
))

# ━━ SECTION 10: DEVELOPMENT ROADMAP ━━
story.append(Paragraph('<b>6. Recommended Development Roadmap</b>', h1_style))

roadmap_data = [
    [Paragraph('<b>Phase</b>', header_cell_style),
     Paragraph('<b>Priority</b>', header_cell_style),
     Paragraph('<b>Action Items</b>', header_cell_style),
     Paragraph('<b>Expected Impact</b>', header_cell_style)],
    [Paragraph('Phase 1\n(Immediate)', cell_style),
     Paragraph('P0 - Critical', ParagraphStyle(name='P0', fontName='DejaVuSerif', fontSize=9, textColor=RED, alignment=TA_CENTER)),
     Paragraph('1. Fix duplicate trade bug\n2. Add entry price validation\n3. Cap Smart max position size\n4. Implement daily loss limit', cell_left_style),
     Paragraph('Prevent -$200+/day in preventable losses', cell_left_style)],
    [Paragraph('Phase 2\n(1-2 Weeks)', cell_style),
     Paragraph('P1 - High', ParagraphStyle(name='P1', fontName='DejaVuSerif', fontSize=9, textColor=GOLD, alignment=TA_CENTER)),
     Paragraph('1. Implement ATR-based SL/TP\n2. Add circuit breakers\n3. Dynamic position sizing\n4. Correlation filter', cell_left_style),
     Paragraph('Reduce SL losses by 40-60%, improve win rate to 45%+', cell_left_style)],
    [Paragraph('Phase 3\n(2-4 Weeks)', cell_style),
     Paragraph('P2 - Medium', ParagraphStyle(name='P2', fontName='DejaVuSerif', fontSize=9, textColor=ACCENT, alignment=TA_CENTER)),
     Paragraph('1. Signal confidence scoring\n2. Market regime classifier\n3. Direction balance quota\n4. Dynamic exit strategy', cell_left_style),
     Paragraph('Win rate improvement to 50%+, balanced L/S allocation', cell_left_style)],
    [Paragraph('Phase 4\n(1-2 Months)', cell_style),
     Paragraph('P3 - Standard', ParagraphStyle(name='P3', fontName='DejaVuSerif', fontSize=9, textColor=GREEN, alignment=TA_CENTER)),
     Paragraph('1. Adaptive R:R calibration\n2. Portfolio-level risk management\n3. Walk-forward optimization\n4. Unify V1/V2 pipelines', cell_left_style),
     Paragraph('Profit factor >1.5, sustainable long-term profitability', cell_left_style)],
]
rcw = [available_w*0.12, available_w*0.12, available_w*0.40, available_w*0.36]
roadmap_table = Table(roadmap_data, colWidths=rcw, hAlign='CENTER')
rts = [
    ('BACKGROUND', (0, 0), (-1, 0), TABLE_HEADER_COLOR),
    ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
    ('GRID', (0, 0), (-1, -1), 0.5, TEXT_MUTED),
    ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ('LEFTPADDING', (0, 0), (-1, -1), 8),
    ('RIGHTPADDING', (0, 0), (-1, -1), 8),
    ('TOPPADDING', (0, 0), (-1, -1), 6),
    ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
]
for i in range(1, len(roadmap_data)):
    bg = TABLE_ROW_EVEN if i % 2 == 0 else TABLE_ROW_ODD
    rts.append(('BACKGROUND', (0, i), (-1, i), bg))
roadmap_table.setStyle(TableStyle(rts))
story.append(Spacer(1, 12))
story.append(roadmap_table)
story.append(Spacer(1, 6))
story.append(Paragraph('Table 3: Recommended Development Roadmap', caption_style))

story.append(Paragraph(
    'The development roadmap prioritizes fixes that will have the most immediate impact on reducing preventable '
    'losses. Phase 1 addresses the three most critical bugs (duplicate trades, entry price validation, and '
    'oversized positions) which together account for approximately $400 in preventable losses over the analysis '
    'period. Phase 2 introduces fundamental risk management improvements that should reduce the SL loss rate '
    'by 40-60% and bring the win rate closer to 45%. Phase 3 focuses on signal quality and directional balance, '
    'targeting a 50%+ win rate and balanced long/short allocation. Phase 4 implements advanced optimization '
    'techniques and portfolio-level risk management to achieve sustainable long-term profitability with a '
    'target profit factor above 1.5.',
    body_style
))

# ━━ SECTION 11: MATHEMATICAL APPENDIX ━━
story.append(Paragraph('<b>7. Mathematical Analysis</b>', h1_style))
story.append(Paragraph('<b>7.1 Breakeven Analysis</b>', h2_style))
story.append(Paragraph(
    'The breakeven win rate for a trading system can be calculated using the formula: '
    'Breakeven WR = 1 / (1 + R:R), where R:R is the average reward-to-risk ratio. With the current effective '
    'R:R of approximately 1.07 (average win $8.22 / average loss $7.71), the breakeven win rate is: '
    '1 / (1 + 1.07) = 48.3%. The current 36.6% win rate falls 11.7 percentage points below breakeven. '
    'To achieve profitability at the current win rate, the R:R ratio would need to be: '
    'R:R = (1 / WR) - 1 = (1 / 0.366) - 1 = 1.73. This means the average win would need to be 1.73x '
    'the average loss, compared to the current 1.07x. Achieving this would require either widening take-profit '
    'targets by 62% or tightening stop-losses by 38%, or some combination thereof.',
    body_style
))

story.append(Paragraph('<b>7.2 Expected Value Calculation</b>', h2_style))
story.append(Paragraph(
    'The expected value (EV) per trade is: EV = (WR x Avg_Win) - ((1-WR) x Avg_Loss) = (0.366 x $8.22) - '
    '(0.634 x $7.71) = $3.01 - $4.89 = -$1.88 per trade. At 500 trades, the expected total loss is '
    '500 x (-$1.88) = -$940, which closely matches the actual observed loss of -$932.62 (the small '
    'difference is due to breakeven trades and rounding). This confirms that the observed losses are not '
    'the result of unlucky variance but are the mathematical expectation of the current system parameters. '
    'For the system to achieve positive EV, either the win rate must increase above 48.3% or the average '
    'win must increase above $13.34 (1.73x the current average loss of $7.71).',
    body_style
))

story.append(Paragraph('<b>7.3 Kelly Criterion Analysis</b>', h2_style))
story.append(Paragraph(
    'The Kelly Criterion provides the optimal fraction of capital to risk per trade: '
    'f* = (bp - q) / b, where b = average win/average loss = 1.07, p = win rate = 0.366, q = 1-p = 0.634. '
    'Substituting: f* = (1.07 x 0.366 - 0.634) / 1.07 = (0.391 - 0.634) / 1.07 = -0.227. A negative '
    'Kelly fraction confirms that the system has no positive edge, and the optimal position size is zero - '
    'meaning the system should not be trading at all in its current configuration. This is the strongest '
    'mathematical evidence that the system requires fundamental changes before deploying real capital. '
    'Until the Kelly fraction turns positive, any trading activity will result in expected capital erosion.',
    body_style
))

# ━━ BUILD DOCUMENT ━━
doc.build(story)
print(f"PDF generated: {output_path}")
print(f"File size: {os.path.getsize(output_path)} bytes")

