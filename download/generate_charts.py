import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.font_manager as fm
import numpy as np
import pandas as pd

# Font setup
fm.fontManager.addfont('/usr/share/fonts/truetype/chinese/SarasaMonoSC-Regular.ttf')
fm.fontManager.addfont('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf')
plt.rcParams['font.sans-serif'] = ['Sarasa Mono SC', 'DejaVu Sans']
plt.rcParams['axes.unicode_minus'] = False

# Color scheme matching Roua Trading
BG_COLOR = '#0B0E14'
CARD_COLOR = '#1A1D29'
PRIMARY = '#059669'
GOLD = '#d4af37'
RED = '#ef4444'
BLUE = '#3b82f6'
GRAY = '#6b7280'
WHITE = '#e5e7eb'

df = pd.read_csv('/home/z/my-project/download/trade_data.csv')
df['Win'] = df['PnL'] > 0

# Calculate notional
df['Notional'] = df['Size'] * df['Entry']

# === Chart 1: Executor Performance Comparison ===
fig, axes = plt.subplots(2, 2, figsize=(14, 10))
fig.patch.set_facecolor(BG_COLOR)
for ax in axes.flat:
    ax.set_facecolor(CARD_COLOR)
    ax.tick_params(colors=WHITE)
    ax.xaxis.label.set_color(WHITE)
    ax.yaxis.label.set_color(WHITE)
    ax.title.set_color(WHITE)
    for spine in ax.spines.values():
        spine.set_color(GRAY)

# Win Rate by Executor
executors = ['Agent', 'Smart']
win_rates = [len(df[(df['Executor']=='Agent')&(df['PnL']>0)])/len(df[df['Executor']=='Agent'])*100,
             len(df[(df['Executor']=='Smart')&(df['PnL']>0)])/len(df[df['Executor']=='Smart'])*100]
colors = [PRIMARY, GOLD]
bars = axes[0,0].bar(executors, win_rates, color=colors, edgecolor='white', linewidth=0.5)
axes[0,0].set_title('Win Rate by Executor', fontsize=13, fontweight='bold')
axes[0,0].set_ylabel('Win Rate (%)')
for bar, val in zip(bars, win_rates):
    axes[0,0].text(bar.get_x()+bar.get_width()/2, bar.get_height()+1, f'{val:.1f}%', ha='center', color=WHITE, fontweight='bold')
axes[0,0].set_ylim(0, 60)

# P&L by Executor
pnl_agent = df[df['Executor']=='Agent']['PnL'].sum()
pnl_smart = df[df['Executor']=='Smart']['PnL'].sum()
bars = axes[0,1].bar(executors, [pnl_agent, pnl_smart], color=[RED if v < 0 else PRIMARY for v in [pnl_agent, pnl_smart]], edgecolor='white', linewidth=0.5)
axes[0,1].set_title('Total P&L by Executor', fontsize=13, fontweight='bold')
axes[0,1].set_ylabel('P&L (USDT)')
for bar, val in zip(bars, [pnl_agent, pnl_smart]):
    axes[0,1].text(bar.get_x()+bar.get_width()/2, bar.get_height()-30 if val < 0 else bar.get_height()+10, f'${val:.2f}', ha='center', color=WHITE, fontweight='bold')

# Direction Distribution
agent_sells = len(df[(df['Executor']=='Agent')&(df['Dir']=='Sell')])
agent_buys = len(df[(df['Executor']=='Agent')&(df['Dir']=='Buy')])
smart_sells = len(df[(df['Executor']=='Smart')&(df['Dir']=='Sell')])
smart_buys = len(df[(df['Executor']=='Smart')&(df['Dir']=='Buy')])

x = np.arange(2)
w = 0.35
axes[1,0].bar(x - w/2, [agent_sells, agent_buys], w, label='Agent', color=PRIMARY, edgecolor='white', linewidth=0.5)
axes[1,0].bar(x + w/2, [smart_sells, smart_buys], w, label='Smart', color=GOLD, edgecolor='white', linewidth=0.5)
axes[1,0].set_title('Trade Direction Distribution', fontsize=13, fontweight='bold')
axes[1,0].set_xticks(x)
axes[1,0].set_xticklabels(['Sell', 'Buy'])
axes[1,0].set_ylabel('Number of Trades')
axes[1,0].legend(loc='best', facecolor=CARD_COLOR, edgecolor=GRAY, labelcolor=WHITE)

# Close Reason Distribution
for idx, ex in enumerate(['Agent', 'Smart']):
    subset = df[df['Executor']==ex]
    reasons = subset['Reason'].value_counts()
    reason_pnl = subset.groupby('Reason')['PnL'].sum()
    ax = axes[1,1] if idx == 1 else axes[1,1]
    
colors_reason = {'SL': RED, 'Manual': BLUE, 'TP': PRIMARY}
bottom = np.zeros(2)
for reason in ['SL', 'Manual', 'TP']:
    vals = [len(df[(df['Executor']==ex)&(df['Reason']==reason)]) for ex in executors]
    axes[1,1].bar(executors, vals, bottom=bottom, label=reason, color=colors_reason[reason], edgecolor='white', linewidth=0.5)
    bottom += vals
axes[1,1].set_title('Close Reason Distribution', fontsize=13, fontweight='bold')
axes[1,1].set_ylabel('Number of Trades')
axes[1,1].legend(loc='best', facecolor=CARD_COLOR, edgecolor=GRAY, labelcolor=WHITE)

fig.suptitle('Roua Trading - Executor Performance Analysis', fontsize=16, fontweight='bold', color=GOLD, y=0.98)
plt.tight_layout(rect=[0, 0, 1, 0.95])
plt.savefig('/home/z/my-project/download/chart1_executor_performance.png', dpi=150, facecolor=BG_COLOR, bbox_inches='tight')
plt.close()

# === Chart 2: Pair-level Analysis ===
fig, axes = plt.subplots(1, 2, figsize=(14, 7))
fig.patch.set_facecolor(BG_COLOR)
for ax in axes.flat:
    ax.set_facecolor(CARD_COLOR)
    ax.tick_params(colors=WHITE)
    ax.xaxis.label.set_color(WHITE)
    ax.yaxis.label.set_color(WHITE)
    ax.title.set_color(WHITE)
    for spine in ax.spines.values():
        spine.set_color(GRAY)

pairs = sorted(df['Pair'].unique())
pair_pnl_agent = [df[(df['Pair']==p)&(df['Executor']=='Agent')]['PnL'].sum() for p in pairs]
pair_pnl_smart = [df[(df['Pair']==p)&(df['Executor']=='Smart')]['PnL'].sum() for p in pairs]

x = np.arange(len(pairs))
w = 0.35
bars1 = axes[0].bar(x - w/2, pair_pnl_agent, w, label='Agent', color=PRIMARY, edgecolor='white', linewidth=0.5)
bars2 = axes[0].bar(x + w/2, pair_pnl_smart, w, label='Smart', color=GOLD, edgecolor='white', linewidth=0.5)
axes[0].set_title('Total P&L by Pair & Executor', fontsize=13, fontweight='bold')
axes[0].set_xticks(x)
axes[0].set_xticklabels([p.split('/')[0] for p in pairs], rotation=30)
axes[0].set_ylabel('P&L (USDT)')
axes[0].axhline(y=0, color=GRAY, linestyle='--', linewidth=0.5)
axes[0].legend(loc='best', facecolor=CARD_COLOR, edgecolor=GRAY, labelcolor=WHITE)

# Win rate by pair
pair_wr_agent = [len(df[(df['Pair']==p)&(df['Executor']=='Agent')&(df['PnL']>0)])/max(len(df[(df['Pair']==p)&(df['Executor']=='Agent')]),1)*100 for p in pairs]
pair_wr_smart = [len(df[(df['Pair']==p)&(df['Executor']=='Smart')&(df['PnL']>0)])/max(len(df[(df['Pair']==p)&(df['Executor']=='Smart')]),1)*100 for p in pairs]

axes[1].bar(x - w/2, pair_wr_agent, w, label='Agent', color=PRIMARY, edgecolor='white', linewidth=0.5)
axes[1].bar(x + w/2, pair_wr_smart, w, label='Smart', color=GOLD, edgecolor='white', linewidth=0.5)
axes[1].set_title('Win Rate by Pair & Executor', fontsize=13, fontweight='bold')
axes[1].set_xticks(x)
axes[1].set_xticklabels([p.split('/')[0] for p in pairs], rotation=30)
axes[1].set_ylabel('Win Rate (%)')
axes[1].axhline(y=50, color=RED, linestyle='--', linewidth=0.5, alpha=0.5)
axes[1].legend(loc='best', facecolor=CARD_COLOR, edgecolor=GRAY, labelcolor=WHITE)

fig.suptitle('Roua Trading - Pair-Level Performance', fontsize=16, fontweight='bold', color=GOLD, y=0.98)
plt.tight_layout(rect=[0, 0, 1, 0.95])
plt.savefig('/home/z/my-project/download/chart2_pair_analysis.png', dpi=150, facecolor=BG_COLOR, bbox_inches='tight')
plt.close()

# === Chart 3: P&L Distribution & R:R Analysis ===
fig, axes = plt.subplots(1, 2, figsize=(14, 7))
fig.patch.set_facecolor(BG_COLOR)
for ax in axes.flat:
    ax.set_facecolor(CARD_COLOR)
    ax.tick_params(colors=WHITE)
    ax.xaxis.label.set_color(WHITE)
    ax.yaxis.label.set_color(WHITE)
    ax.title.set_color(WHITE)
    for spine in ax.spines.values():
        spine.set_color(GRAY)

# P&L distribution
agent_pnls = df[df['Executor']=='Agent']['PnL']
smart_pnls = df[df['Executor']=='Smart']['PnL']
axes[0].hist(agent_pnls, bins=40, alpha=0.7, label='Agent', color=PRIMARY, edgecolor='white', linewidth=0.3)
axes[0].hist(smart_pnls, bins=40, alpha=0.6, label='Smart', color=GOLD, edgecolor='white', linewidth=0.3)
axes[0].axvline(x=0, color=RED, linestyle='--', linewidth=1)
axes[0].set_title('P&L Distribution by Executor', fontsize=13, fontweight='bold')
axes[0].set_xlabel('P&L (USDT)')
axes[0].set_ylabel('Frequency')
axes[0].legend(loc='best', facecolor=CARD_COLOR, edgecolor=GRAY, labelcolor=WHITE)

# Notional comparison (box plot)
agent_notional = df[df['Executor']=='Agent']['Notional']
smart_notional = df[df['Executor']=='Smart']['Notional']
bp = axes[1].boxplot([agent_notional, smart_notional], labels=['Agent', 'Smart'], patch_artist=True)
bp['boxes'][0].set_facecolor(PRIMARY)
bp['boxes'][1].set_facecolor(GOLD)
bp['boxes'][0].set_alpha(0.6)
bp['boxes'][1].set_alpha(0.6)
for box in bp['boxes']:
    box.set_edgecolor(WHITE)
for whisker in bp['whiskers']:
    whisker.set_color(WHITE)
for cap in bp['caps']:
    cap.set_color(WHITE)
for median in bp['medians']:
    median.set_color(RED)
axes[1].set_title('Position Size Distribution (Notional USDT)', fontsize=13, fontweight='bold')
axes[1].set_ylabel('Notional Value (USDT)')

fig.suptitle('Roua Trading - Risk & Return Analysis', fontsize=16, fontweight='bold', color=GOLD, y=0.98)
plt.tight_layout(rect=[0, 0, 1, 0.95])
plt.savefig('/home/z/my-project/download/chart3_risk_return.png', dpi=150, facecolor=BG_COLOR, bbox_inches='tight')
plt.close()

# === Chart 4: Critical Errors Summary ===
fig, ax = plt.subplots(figsize=(14, 8))
fig.patch.set_facecolor(BG_COLOR)
ax.set_facecolor(CARD_COLOR)
ax.tick_params(colors=WHITE)
ax.xaxis.label.set_color(WHITE)
ax.yaxis.label.set_color(WHITE)
ax.title.set_color(WHITE)
for spine in ax.spines.values():
    spine.set_color(GRAY)

errors = [
    'Sell Bias (79.4% Sells)',
    'Low Win Rate (36.6%)',
    'Poor Profit Factor (0.617)',
    'SL Losses ($1,756)',
    'Smart: -22x Notional vs Agent',
    'Rapid-Fire Duplicates',
    '4h Timeout Closes (Manual)',
    'BTC Entry Anomaly ($-177)',
    'Max 22 Consecutive Losses',
    'Buy Win Rate Only 27.3%'
]
impacts = [85, 90, 95, 92, 88, 70, 65, 60, 85, 78]
colors_err = [RED if v > 80 else GOLD if v > 70 else PRIMARY for v in impacts]

bars = ax.barh(errors, impacts, color=colors_err, edgecolor='white', linewidth=0.5)
ax.set_title('Critical Errors - Severity Ranking', fontsize=14, fontweight='bold', color=GOLD)
ax.set_xlabel('Severity Score (0-100)', fontsize=12)
for bar, val in zip(bars, impacts):
    ax.text(bar.get_width() + 1, bar.get_y() + bar.get_height()/2, f'{val}', ha='left', va='center', color=WHITE, fontweight='bold')
ax.set_xlim(0, 110)
ax.invert_yaxis()

plt.tight_layout()
plt.savefig('/home/z/my-project/download/chart4_errors.png', dpi=150, facecolor=BG_COLOR, bbox_inches='tight')
plt.close()

# === Chart 5: Cumulative P&L ===
fig, ax = plt.subplots(figsize=(14, 7))
fig.patch.set_facecolor(BG_COLOR)
ax.set_facecolor(CARD_COLOR)
ax.tick_params(colors=WHITE)
ax.xaxis.label.set_color(WHITE)
ax.yaxis.label.set_color(WHITE)
ax.title.set_color(WHITE)
for spine in ax.spines.values():
    spine.set_color(GRAY)

# Approximate cumulative P&L by trade index
agent_cum = df[df['Executor']=='Agent']['PnL'].cumsum().values
smart_cum = df[df['Executor']=='Smart']['PnL'].cumsum().values

ax.plot(range(len(agent_cum)), agent_cum, color=PRIMARY, linewidth=1.5, label='Agent', alpha=0.8)
ax.plot(range(len(smart_cum)), smart_cum, color=GOLD, linewidth=1.5, label='Smart', alpha=0.8)
ax.axhline(y=0, color=GRAY, linestyle='--', linewidth=0.5)
ax.fill_between(range(len(agent_cum)), agent_cum, alpha=0.15, color=PRIMARY)
ax.fill_between(range(len(smart_cum)), smart_cum, alpha=0.15, color=GOLD)
ax.set_title('Cumulative P&L by Executor', fontsize=14, fontweight='bold', color=GOLD)
ax.set_xlabel('Trade Number')
ax.set_ylabel('Cumulative P&L (USDT)')
ax.legend(loc='best', facecolor=CARD_COLOR, edgecolor=GRAY, labelcolor=WHITE)

plt.tight_layout()
plt.savefig('/home/z/my-project/download/chart5_cumulative.png', dpi=150, facecolor=BG_COLOR, bbox_inches='tight')
plt.close()

# === Chart 6: Close Reason P&L Waterfall ===
fig, axes = plt.subplots(1, 2, figsize=(14, 7))
fig.patch.set_facecolor(BG_COLOR)
for ax in axes.flat:
    ax.set_facecolor(CARD_COLOR)
    ax.tick_params(colors=WHITE)
    ax.xaxis.label.set_color(WHITE)
    ax.yaxis.label.set_color(WHITE)
    ax.title.set_color(WHITE)
    for spine in ax.spines.values():
        spine.set_color(GRAY)

for idx, ex in enumerate(['Agent', 'Smart']):
    subset = df[df['Executor']==ex]
    reason_pnl = subset.groupby('Reason')['PnL'].sum().sort_values()
    colors_bar = [RED if v < 0 else PRIMARY for v in reason_pnl.values]
    bars = axes[idx].bar(reason_pnl.index, reason_pnl.values, color=colors_bar, edgecolor='white', linewidth=0.5)
    axes[idx].set_title(f'{ex} - P&L by Close Reason', fontsize=13, fontweight='bold')
    axes[idx].set_ylabel('P&L (USDT)')
    axes[idx].axhline(y=0, color=GRAY, linestyle='--', linewidth=0.5)
    for bar, val in zip(bars, reason_pnl.values):
        axes[idx].text(bar.get_x()+bar.get_width()/2, bar.get_height()-5 if val < 0 else bar.get_height()+3, f'${val:.0f}', ha='center', color=WHITE, fontweight='bold', fontsize=10)

fig.suptitle('Roua Trading - P&L Waterfall by Close Reason', fontsize=16, fontweight='bold', color=GOLD, y=0.98)
plt.tight_layout(rect=[0, 0, 1, 0.95])
plt.savefig('/home/z/my-project/download/chart6_waterfall.png', dpi=150, facecolor=BG_COLOR, bbox_inches='tight')
plt.close()

print("All 6 charts generated successfully!")
