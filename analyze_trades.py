#!/usr/bin/env python3
"""
Deep Analysis of 134 Trading Records
Agent vs Smart Strategy — Error Extraction, Improvements, Algorithm Development
"""

import matplotlib
matplotlib.use('Agg')
import matplotlib.font_manager as fm
fm.fontManager.addfont('/usr/share/fonts/truetype/noto-serif-sc/NotoSerifSC-Regular.ttf')
fm.fontManager.addfont('/usr/share/fonts/truetype/chinese/SarasaMonoSC-Regular.ttf')
fm.fontManager.addfont('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf')

import matplotlib.pyplot as plt
import matplotlib.ticker as mticker
plt.rcParams['font.sans-serif'] = ['Sarasa Mono SC', 'DejaVu Sans']
plt.rcParams['axes.unicode_minus'] = False

import json
import os
from collections import defaultdict

# ── Raw Data (CSV style: pair, strategy, direction, size, entry, close, SL, TP, PnL, reason, duration) ──
raw_lines = [
    "ETH/USDT,Agent,Buy,0.0614,1652.62,1667.56,1601.44,1774.79,0.81,Manual,6h 40m",
    "BTC/USDT,Agent,Sell,0.00162,62549.26,63246.43,65729.99,54774.99,-1.23,Manual,6h 41m",
    "BNB/USDT,Agent,Buy,0.171,594.96,601.01,575.82,629.24,0.93,Manual,6h 42m",
    "XRP/USDT,Agent,Buy,90,1.1193,1.1226,1.1045,1.1581,0.20,Manual,6h 37m",
    "ETH/USDT,Smart,Sell,0.2159,1648.19,1666.99,1665.79,1616.31,-4.42,SL,6h 19m",
    "XRP/USDT,Smart,Sell,409,1.1163,1.1198,1.1260,1.0992,-1.87,Manual,4h 0m",
    "ADA/USDT,Smart,Sell,10065,0.1662,0.1666,0.1680,0.1640,-6.04,Manual,4h 0m",
    "ETH/USDT,Agent,Sell,0.0622,1637.62,1630.29,1731.83,1484.43,0.35,Manual,4h 0m",
    "XRP/USDT,Agent,Sell,91,1.1170,1.1019,1.1394,1.0889,1.27,Manual,4h 0m",
    "BNB/USDT,Agent,Sell,0.172,591.24,589.86,621.33,532.57,0.14,Manual,4h 0m",
    "BTC/USDT,Agent,Sell,0.00164,61834.65,61847.79,62895.65,60107.18,-0.12,Manual,4h 0m",
    "DOGE/USDT,Agent,Sell,1201.50402,0.084939,0.083704,0.086081,0.083019,1.38,Manual,4h 0m",
    "DOGE/USDT,Smart,Buy,3185.52959,0.083143,0.084046,0.084129,0.085552,2.61,SL,7h 27m",
    "ADA/USDT,Agent,Buy,625,0.1635,0.1617,0.1613,0.1672,-1.23,Manual,2h 30m",
    "ETH/USDT,Agent,Sell,0.0625,1640.01,1648.18,1672.17,1526.06,-0.61,Manual,4h 0m",
    "BNB/USDT,Smart,Buy,0.448,587.86,593.58,581.10,604.58,2.30,Manual,12h 0m",
    "BNB/USDT,Agent,Sell,0.176,581.74,592.52,610.96,523.68,-2.00,Manual,4h 0m",
    "BTC/USDT,Agent,Sell,0.00168,61019.23,61978.65,64407.95,55206.81,-1.72,Manual,4h 0m",
    "ADA/USDT,Agent,Buy,616,0.1660,0.1631,0.1633,0.1713,-1.89,SL,26m",
    "ADA/USDT,Agent,Sell,628,0.1632,0.1660,0.1659,0.1585,-1.86,SL,1h 15m",
    "SOL/USDT,Smart,Buy,4.18,63.64,65.33,64.50,65.49,6.80,Manual,5h 9m",
    "XRP/USDT,Agent,Sell,90,1.1311,1.1356,1.1342,1.0839,-0.51,SL,1m",
    "DOGE/USDT,Agent,Sell,1207.0801,0.084738,0.085005,0.084983,0.081960,-0.42,SL,4m",
    "DOGE/USDT,Agent,Sell,1238.47147,0.083031,0.084695,0.084702,0.080947,-2.17,SL,2h 27m",
    "SOL/USDT,Smart,Sell,7.31,64.23,64.98,64.80,62.88,-5.97,SL,8h 57m",
    "XRP/USDT,Agent,Sell,93,1.1033,1.1247,1.1228,1.0730,-2.09,SL,1h 21m",
    "ETH/USDT,Agent,Sell,0.0636,1616.64,1640.81,1639.32,1566.64,-1.64,SL,1h 23m",
    "ADA/USDT,Agent,Sell,636,0.1616,0.1595,0.1640,0.1568,1.23,Manual,4h 1m",
    "XRP/USDT,Agent,Sell,92,1.1135,1.1058,1.1265,1.0864,0.61,Manual,4h 0m",
    "BTC/USDT,Agent,Sell,0.00167,61504.31,61149.16,64575.34,55350.29,0.49,Manual,4h 0m",
    "BNB/USDT,Agent,Sell,0.175,586.70,582.92,598.24,563.04,0.56,Manual,4h 0m",
    "ETH/USDT,Agent,Sell,0.063,1632.44,1620.45,1665.11,1567.17,0.65,Manual,4h 0m",
    "DOGE/USDT,Smart,Buy,3168.82247,0.084014,0.083077,0.083091,0.086448,-3.23,SL,1h 1m",
    "XRP/USDT,Smart,Buy,238,1.1160,1.1051,1.1060,1.1372,-2.86,SL,3h 37m",
    "SOL/USDT,Smart,Buy,4.13,64.29,63.63,63.59,66.16,-3.02,SL,1h 51m",
    "DOGE/USDT,Smart,Buy,4391.65288,0.084048,0.083986,0.083249,0.085598,-0.64,Manual,4h 0m",
    "XRP/USDT,Agent,Sell,92,1.1193,1.1161,1.1362,1.0858,0.19,Manual,4h 0m",
    "DOGE/USDT,Agent,Sell,1232.64585,0.083922,0.083954,0.085554,0.081761,-0.14,Manual,4h 0m",
    "BTC/USDT,Agent,Sell,0.00168,61344.22,61635.06,62286.50,58604.54,-0.59,Manual,4h 0m",
    "ETH/USDT,Agent,Sell,0.0638,1627.21,1635.95,1648.22,1575.15,-0.66,Manual,4h 0m",
    "BNB/USDT,Agent,Sell,0.177,586.84,588.00,595.33,567.09,-0.31,Manual,4h 0m",
    "ADA/USDT,Smart,Sell,1631,0.1620,0.1609,0.1638,0.1573,1.53,Manual,4h 0m",
    "ADA/USDT,Smart,Buy,1631,0.1623,0.1613,0.1613,0.1641,-1.89,SL,1h 48m",
    "SOL/USDT,Smart,Buy,4.09,64.60,64.15,64.18,65.31,-2.14,SL,1h 15m",
    "SOL/USDT,Smart,Sell,4.04,64.94,64.61,64.93,63.70,1.03,Manual,4h 0m",
    "XRP/USDT,Agent,Sell,91,1.1350,1.1217,1.1522,1.0841,1.11,Manual,4h 0m",
    "DOGE/USDT,Agent,Sell,1231.49532,0.084557,0.084114,0.085981,0.082169,0.44,Manual,4h 0m",
    "BTC/USDT,Agent,Sell,0.00169,61694.80,61483.57,62460.64,59498.08,0.25,Manual,4h 0m",
    "ETH/USDT,Agent,Sell,0.0636,1637.80,1631.05,1658.37,1599.38,0.33,Manual,4h 0m",
    "BNB/USDT,Agent,Sell,0.176,592.46,588.17,600.02,578.68,0.65,Manual,4h 0m",
    "ADA/USDT,Smart,Sell,1583,0.1657,0.1633,0.1657,0.1626,3.54,Manual,2h 29m",
    "BTC/USDT,Agent,Sell,0.00169,61257.72,61939.87,62368.05,59602.96,-1.26,Manual,4h 0m",
    "ETH/USDT,Agent,Sell,0.0634,1639.37,1653.50,1666.13,1592.26,-1.00,Manual,4h 0m",
    "DOGE/USDT,Agent,Sell,1241.18347,0.084195,0.084985,0.085656,0.080592,-1.09,Manual,4h 0m",
    "ADA/USDT,Agent,Sell,637,0.1636,0.1668,0.1665,0.1586,-2.14,SL,2h 33m",
    "BNB/USDT,Agent,Sell,0.177,585.21,595.56,593.88,558.77,-1.94,SL,2h 0m",
    "XRP/USDT,Agent,Sell,88,1.1649,1.1317,1.1787,1.1265,2.82,Manual,3h 10m",
    "BNB/USDT,Agent,Sell,0.175,596.92,589.06,629.40,539.49,1.27,Manual,4h 1m",
    "ETH/USDT,Agent,Sell,0.0625,1668.76,1642.97,1697.67,1597.31,1.51,Manual,4h 0m",
    "BTC/USDT,Agent,Sell,0.00166,62551.70,61386.92,63387.05,60380.54,1.83,Manual,4h 0m",
    "SOL/USDT,Agent,Sell,1.57,65.99,64.74,67.15,64.17,1.85,Manual,4h 0m",
    "DOGE/USDT,Smart,Sell,16516.98562,0.085402,0.085045,0.085393,0.084112,4.49,Manual,4h 0m",
    "XRP/USDT,Smart,Buy,230,1.1586,1.1525,1.1458,1.1805,-1.67,Manual,4h 10m",
    "SOL/USDT,Smart,Buy,4.03,66.28,65.51,65.55,67.53,-3.33,SL,4h 37m",
    "ADA/USDT,Smart,Sell,2209,0.1691,0.1690,0.1690,0.1658,-0.25,SL,48m",
    "XRP/USDT,Agent,Sell,89,1.1603,1.1659,1.1656,1.1103,-0.60,SL,1h 0m",
    "ADA/USDT,Smart,Sell,14622,0.1673,0.1684,0.1690,0.1640,-18.43,Manual,3h 27m",
    "XRP/USDT,Smart,Sell,1572,1.1570,1.1612,1.1617,1.1398,-8.44,SL,6h 27m",
    "BTC/USDT,Agent,Buy,0.00162,62734.55,62568.74,61867.03,64121.29,-0.37,Manual,10h 32m",
    "BNB/USDT,Agent,Buy,0.165,607.21,597.00,587.43,641.94,-1.78,Manual,12h 35m",
    "SOL/USDT,Agent,Sell,1.51,65.97,66.15,67.83,63.82,-0.36,Manual,11h 18m",
    "DOGE/USDT,Smart,Sell,3073.97598,0.086364,0.085516,0.086355,0.085037,2.34,Manual,4h 0m",
    "XRP/USDT,Smart,Buy,223,1.1708,1.1588,1.1579,1.1930,-2.93,SL,5h 29m",
    "BTC/USDT,Smart,Sell,0.00416,63443.52,62724.24,63437.18,62236.89,2.73,Manual,4h 0m",
    "ADA/USDT,Smart,Sell,1552,0.1701,0.1689,0.1717,0.1676,1.60,Manual,3h 21m",
    "DOGE/USDT,Smart,Buy,3965.9957,0.085455,0.086433,0.085464,0.086736,3.54,Manual,4h 0m",
    "ADA/USDT,Smart,Sell,1563,0.1692,0.1698,0.1702,0.1673,-1.20,Manual,41m",
    "XRP/USDT,Smart,Sell,227,1.1678,1.1712,1.1748,1.1573,-1.04,Manual,55m",
    "BTC/USDT,Smart,Sell,0.00532,63094.93,63425.36,63473.88,62526.51,-2.10,SL,59m",
    "BNB/USDT,Smart,Sell,0.535,598.41,603.97,603.80,587.03,-3.30,SL,3h 54m",
    "ETH/USDT,Agent,Sell,0.0607,1668.70,1685.60,1692.78,1592.72,-1.13,Manual,4h 7m",
    "ADA/USDT,Smart,Sell,1572,0.1680,0.1684,0.1690,0.1665,-0.89,Manual,20s",
    "ADA/USDT,Smart,Sell,1566,0.1678,0.1682,0.1688,0.1663,-0.89,Manual,30s",
    "DOGE/USDT,Smart,Sell,3050.97487,0.086104,0.085247,0.086095,0.083604,2.35,Manual,55s",
    "DOGE/USDT,Smart,Sell,3051.26017,0.086064,0.085247,0.086055,0.083566,2.23,Manual,25s",
    "DOGE/USDT,Smart,Sell,3032.49847,0.086134,0.085247,0.086125,0.083633,2.43,Manual,26s",
    "XRP/USDT,Smart,Sell,6869,1.1518,1.1517,1.1675,1.1212,-7.56,Manual,4h 3m",
    "DOGE/USDT,Smart,Sell,3432.94199,0.086114,0.085247,0.086105,0.083614,2.68,Manual,1m",
    "ADA/USDT,Smart,Sell,51963,0.1666,0.1658,0.1679,0.1631,35.29,Manual,4h 9m",
    "SOL/USDT,Smart,Buy,4.12,65.59,65.92,65.00,66.57,1.12,Manual,3h 38m",
    "DOGE/USDT,Smart,Sell,99677.30415,0.084925,0.085214,0.085388,0.083016,-37.27,Manual,2h 10m",
    "BNB/USDT,Smart,Sell,0.436,593.66,599.44,599.00,582.37,-2.78,SL,59m",
    "BTC/USDT,Agent,Sell,0.00157,63705.90,62710.64,65455.89,59736.45,1.46,Manual,4h 0m",
    "DOGE/USDT,Agent,Sell,1156.51611,0.086755,0.084805,0.088640,0.084710,2.16,Manual,2h 48m",
    "BTC/USDT,Smart,Buy,0.00405,63129.07,62413.52,62450.64,64343.08,-3.15,SL,39m",
    "ETH/USDT,Agent,Sell,0.0595,1686.21,1672.50,1770.03,1517.17,0.72,Manual,4h 0m",
    "BNB/USDT,Smart,Sell,0.424,601.20,595.38,601.14,594.03,2.21,Manual,34m",
    "XRP/USDT,Smart,Sell,368,1.1739,1.1589,1.1738,1.1561,5.08,Manual,9h 23m",
    "ADA/USDT,Smart,Sell,1500,0.1701,0.1685,0.1701,0.1683,2.15,Manual,20m",
    "SOL/USDT,Agent,Sell,1.47,68.06,66.14,69.16,66.10,2.73,TP,3h 14m",
    "SOL/USDT,Smart,Buy,3.85,66.72,66.07,66.12,67.72,-2.73,SL,13m",
    "BNB/USDT,Agent,Sell,0.165,606.95,607.07,640.15,548.70,-0.12,Manual,4h 0m",
    "DOGE/USDT,Agent,Sell,1159.53391,0.086740,0.086967,0.087975,0.084075,-0.36,Manual,4h 0m",
]

# Parse trades
trades = []
for line in raw_lines:
    parts = [p.strip() for p in line.split(',')]
    if len(parts) < 11:
        print(f"SKIP: {line} (parts={len(parts)})")
        continue
    
    pair = parts[0]
    strategy = parts[1]
    direction = parts[2]
    size = float(parts[3])
    entry = float(parts[4])
    close = float(parts[5])
    sl = float(parts[6])
    tp = float(parts[7])
    pnl = float(parts[8])
    reason = parts[9]
    duration = parts[10]
    
    # Calculate position value
    position_value = size * entry
    
    # Calculate SL/TP distance in %
    if direction == 'Buy':
        sl_dist_pct = (entry - sl) / entry * 100
        tp_dist_pct = (tp - entry) / entry * 100
    else:
        sl_dist_pct = (sl - entry) / entry * 100
        tp_dist_pct = (entry - tp) / entry * 100
    
    risk_reward = tp_dist_pct / sl_dist_pct if sl_dist_pct > 0 else 0
    
    trades.append({
        'pair': pair,
        'strategy': strategy,
        'direction': direction,
        'size': size,
        'entry': entry,
        'close': close,
        'sl': sl,
        'tp': tp,
        'pnl': pnl,
        'reason': reason,
        'duration': duration,
        'position_value': position_value,
        'sl_dist_pct': sl_dist_pct,
        'tp_dist_pct': tp_dist_pct,
        'risk_reward': risk_reward,
    })

print(f"Total trades parsed: {len(trades)}")

# ── Split by Strategy ────────────────────────────────────────────────────────
agent_trades = [t for t in trades if t['strategy'] == 'Agent']
smart_trades = [t for t in trades if t['strategy'] == 'Smart']

print(f"Agent trades: {len(agent_trades)}")
print(f"Smart trades: {len(smart_trades)}")

# ── Comprehensive Statistics ─────────────────────────────────────────────────

def compute_stats(trade_list, label):
    if not trade_list:
        return {'label': label, 'total_trades': 0}
    
    wins = [t for t in trade_list if t['pnl'] > 0]
    losses = [t for t in trade_list if t['pnl'] < 0]
    breakeven = [t for t in trade_list if t['pnl'] == 0]
    
    total_pnl = sum(t['pnl'] for t in trade_list)
    total_wins = sum(t['pnl'] for t in wins)
    total_losses = sum(t['pnl'] for t in losses)
    
    sl_closes = [t for t in trade_list if t['reason'] == 'SL']
    manual_closes = [t for t in trade_list if t['reason'] == 'Manual']
    tp_closes = [t for t in trade_list if t['reason'] == 'TP']
    
    avg_win = total_wins / len(wins) if wins else 0
    avg_loss = total_losses / len(losses) if losses else 0
    
    win_rate = len(wins) / len(trade_list) * 100 if trade_list else 0
    sl_rate = len(sl_closes) / len(trade_list) * 100 if trade_list else 0
    
    buys = [t for t in trade_list if t['direction'] == 'Buy']
    sells = [t for t in trade_list if t['direction'] == 'Sell']
    buy_pnl = sum(t['pnl'] for t in buys)
    sell_pnl = sum(t['pnl'] for t in sells)
    
    pair_stats = {}
    for t in trade_list:
        p = t['pair']
        if p not in pair_stats:
            pair_stats[p] = {'count': 0, 'pnl': 0, 'wins': 0, 'losses': 0}
        pair_stats[p]['count'] += 1
        pair_stats[p]['pnl'] += t['pnl']
        if t['pnl'] > 0:
            pair_stats[p]['wins'] += 1
        elif t['pnl'] < 0:
            pair_stats[p]['losses'] += 1
    
    pos_values = [t['position_value'] for t in trade_list]
    sl_dists = [t['sl_dist_pct'] for t in trade_list]
    tp_dists = [t['tp_dist_pct'] for t in trade_list]
    rr_ratios = [t['risk_reward'] for t in trade_list]
    
    return {
        'label': label,
        'total_trades': len(trade_list),
        'wins': len(wins),
        'losses': len(losses),
        'breakeven': len(breakeven),
        'win_rate': win_rate,
        'total_pnl': total_pnl,
        'total_wins': total_wins,
        'total_losses': total_losses,
        'avg_win': avg_win,
        'avg_loss': avg_loss,
        'sl_closes': len(sl_closes),
        'manual_closes': len(manual_closes),
        'tp_closes': len(tp_closes),
        'sl_rate': sl_rate,
        'buys': len(buys),
        'sells': len(sells),
        'buy_pnl': buy_pnl,
        'sell_pnl': sell_pnl,
        'pair_stats': pair_stats,
        'avg_pos_value': sum(pos_values) / len(pos_values) if pos_values else 0,
        'min_pos_value': min(pos_values) if pos_values else 0,
        'max_pos_value': max(pos_values) if pos_values else 0,
        'avg_sl_dist': sum(sl_dists) / len(sl_dists) if sl_dists else 0,
        'avg_tp_dist': sum(tp_dists) / len(tp_dists) if tp_dists else 0,
        'avg_rr': sum(rr_ratios) / len(rr_ratios) if rr_ratios else 0,
        'largest_win': max((t['pnl'] for t in trade_list), default=0),
        'largest_loss': min((t['pnl'] for t in trade_list), default=0),
    }

agent_stats = compute_stats(agent_trades, 'Agent')
smart_stats = compute_stats(smart_trades, 'Smart')
all_stats = compute_stats(trades, 'All')

print("\n=== AGENT STRATEGY ===")
for k, v in agent_stats.items():
    if k not in ['pair_stats']:
        print(f"  {k}: {v}")

print("\n=== SMART STRATEGY ===")
for k, v in smart_stats.items():
    if k not in ['pair_stats']:
        print(f"  {k}: {v}")

# Profit Factor
agent_pf = agent_stats['total_wins'] / abs(agent_stats['total_losses']) if agent_stats['total_losses'] != 0 else float('inf')
smart_pf = smart_stats['total_wins'] / abs(smart_stats['total_losses']) if smart_stats['total_losses'] != 0 else float('inf')

print(f"\nAgent Profit Factor: {agent_pf:.2f}")
print(f"Smart Profit Factor: {smart_pf:.2f}")

# Expectancy
agent_exp = (agent_stats['win_rate']/100 * agent_stats['avg_win']) + ((1-agent_stats['win_rate']/100) * agent_stats['avg_loss'])
smart_exp = (smart_stats['win_rate']/100 * smart_stats['avg_win']) + ((1-smart_stats['win_rate']/100) * smart_stats['avg_loss'])

print(f"\nAgent Expectancy per trade: ${agent_exp:.2f}")
print(f"Smart Expectancy per trade: ${smart_exp:.2f}")

# ── Generate Charts ─────────────────────────────────────────────────────────
chart_dir = '/home/z/my-project/download/charts'
os.makedirs(chart_dir, exist_ok=True)

# 1. P&L comparison by strategy
fig, axes = plt.subplots(1, 3, figsize=(16, 5))

strategies = ['Agent', 'Smart']
pnl_values = [agent_stats['total_pnl'], smart_stats['total_pnl']]
colors = ['#2ecc71' if v >= 0 else '#e74c3c' for v in pnl_values]
bars = axes[0].bar(strategies, pnl_values, color=colors, edgecolor='white', linewidth=1.5, width=0.5)
axes[0].set_title('Total P&L by Strategy', fontsize=14, fontweight='bold')
axes[0].set_ylabel('P&L ($)')
axes[0].axhline(y=0, color='gray', linestyle='--', alpha=0.5)
for bar, val in zip(bars, pnl_values):
    axes[0].text(bar.get_x() + bar.get_width()/2., bar.get_height() + 0.5,
                f'${val:.2f}', ha='center', va='bottom', fontweight='bold')

win_rates = [agent_stats['win_rate'], smart_stats['win_rate']]
bars = axes[1].bar(strategies, win_rates, color=['#3498db', '#9b59b6'], edgecolor='white', linewidth=1.5, width=0.5)
axes[1].set_title('Win Rate by Strategy', fontsize=14, fontweight='bold')
axes[1].set_ylabel('Win Rate (%)')
axes[1].set_ylim(0, 100)
axes[1].axhline(y=50, color='gray', linestyle='--', alpha=0.5)
for bar, val in zip(bars, win_rates):
    axes[1].text(bar.get_x() + bar.get_width()/2., bar.get_height() + 1,
                f'{val:.1f}%', ha='center', va='bottom', fontweight='bold')

sl_rates = [agent_stats['sl_rate'], smart_stats['sl_rate']]
bars = axes[2].bar(strategies, sl_rates, color=['#e67e22', '#c0392b'], edgecolor='white', linewidth=1.5, width=0.5)
axes[2].set_title('Stop Loss Hit Rate by Strategy', fontsize=14, fontweight='bold')
axes[2].set_ylabel('SL Rate (%)')
axes[2].set_ylim(0, 60)
for bar, val in zip(bars, sl_rates):
    axes[2].text(bar.get_x() + bar.get_width()/2., bar.get_height() + 1,
                f'{val:.1f}%', ha='center', va='bottom', fontweight='bold')

plt.tight_layout()
plt.savefig(f'{chart_dir}/01_strategy_overview.png', dpi=150, bbox_inches='tight')
plt.close()
print("Chart 1 saved")

# 2. P&L Distribution by Strategy
fig, axes = plt.subplots(1, 2, figsize=(14, 5))

agent_pnls = [t['pnl'] for t in agent_trades]
smart_pnls = [t['pnl'] for t in smart_trades]

axes[0].hist(agent_pnls, bins=20, color='#3498db', edgecolor='white', alpha=0.8)
axes[0].axvline(x=0, color='red', linestyle='--', alpha=0.7)
axes[0].axvline(x=agent_stats['avg_win'], color='green', linestyle='--', alpha=0.7, label=f'Avg Win: ${agent_stats["avg_win"]:.2f}')
axes[0].axvline(x=agent_stats['avg_loss'], color='red', linestyle='--', alpha=0.7, label=f'Avg Loss: ${agent_stats["avg_loss"]:.2f}')
axes[0].set_title('Agent P&L Distribution', fontsize=14, fontweight='bold')
axes[0].set_xlabel('P&L ($)')
axes[0].set_ylabel('Frequency')
axes[0].legend(loc='best')

axes[1].hist(smart_pnls, bins=20, color='#9b59b6', edgecolor='white', alpha=0.8)
axes[1].axvline(x=0, color='red', linestyle='--', alpha=0.7)
axes[1].axvline(x=smart_stats['avg_win'], color='green', linestyle='--', alpha=0.7, label=f'Avg Win: ${smart_stats["avg_win"]:.2f}')
axes[1].axvline(x=smart_stats['avg_loss'], color='red', linestyle='--', alpha=0.7, label=f'Avg Loss: ${smart_stats["avg_loss"]:.2f}')
axes[1].set_title('Smart P&L Distribution', fontsize=14, fontweight='bold')
axes[1].set_xlabel('P&L ($)')
axes[1].set_ylabel('Frequency')
axes[1].legend(loc='best')

plt.tight_layout()
plt.savefig(f'{chart_dir}/02_pnl_distribution.png', dpi=150, bbox_inches='tight')
plt.close()
print("Chart 2 saved")

# 3. P&L by Pair and Strategy
fig, axes = plt.subplots(1, 2, figsize=(16, 6))

agent_pairs = sorted(agent_stats['pair_stats'].items(), key=lambda x: x[1]['pnl'])
agent_pair_names = [p[0] for p in agent_pairs]
agent_pair_pnl = [p[1]['pnl'] for p in agent_pairs]
colors = ['#2ecc71' if v >= 0 else '#e74c3c' for v in agent_pair_pnl]
axes[0].barh(agent_pair_names, agent_pair_pnl, color=colors, edgecolor='white')
axes[0].set_title('Agent: P&L by Trading Pair', fontsize=14, fontweight='bold')
axes[0].set_xlabel('P&L ($)')
axes[0].axvline(x=0, color='gray', linestyle='--', alpha=0.5)

smart_pairs = sorted(smart_stats['pair_stats'].items(), key=lambda x: x[1]['pnl'])
smart_pair_names = [p[0] for p in smart_pairs]
smart_pair_pnl = [p[1]['pnl'] for p in smart_pairs]
colors = ['#2ecc71' if v >= 0 else '#e74c3c' for v in smart_pair_pnl]
axes[1].barh(smart_pair_names, smart_pair_pnl, color=colors, edgecolor='white')
axes[1].set_title('Smart: P&L by Trading Pair', fontsize=14, fontweight='bold')
axes[1].set_xlabel('P&L ($)')
axes[1].axvline(x=0, color='gray', linestyle='--', alpha=0.5)

plt.tight_layout()
plt.savefig(f'{chart_dir}/03_pnl_by_pair.png', dpi=150, bbox_inches='tight')
plt.close()
print("Chart 3 saved")

# 4. Position Size vs P&L scatter (Smart strategy)
fig, ax = plt.subplots(figsize=(10, 7))

for t in smart_trades:
    color = '#2ecc71' if t['pnl'] >= 0 else '#e74c3c'
    marker = 'o' if t['reason'] == 'Manual' else 's'
    ax.scatter(t['position_value'], t['pnl'], c=color, marker=marker, s=80, alpha=0.7, edgecolors='white', linewidth=0.5)

ax.axhline(y=0, color='gray', linestyle='--', alpha=0.5)
ax.set_title('Smart Strategy: Position Value vs P&L\n(Green=Profit, Red=Loss, Square=SL, Circle=Manual)', fontsize=13, fontweight='bold')
ax.set_xlabel('Position Value ($)')
ax.set_ylabel('P&L ($)')
plt.tight_layout()
plt.savefig(f'{chart_dir}/04_smart_sizing_vs_pnl.png', dpi=150, bbox_inches='tight')
plt.close()
print("Chart 4 saved")

# 5. Close Reason Analysis
fig, axes = plt.subplots(1, 2, figsize=(12, 5))

agent_reasons = {'Manual': len([t for t in agent_trades if t['reason'] == 'Manual']),
                 'SL': len([t for t in agent_trades if t['reason'] == 'SL']),
                 'TP': len([t for t in agent_trades if t['reason'] == 'TP'])}
axes[0].pie(agent_reasons.values(), labels=agent_reasons.keys(), autopct='%1.1f%%',
            colors=['#3498db', '#e74c3c', '#2ecc71'], startangle=90, 
            textprops={'fontsize': 12})
axes[0].set_title('Agent: Close Reason Distribution', fontsize=14, fontweight='bold')

smart_reasons = {'Manual': len([t for t in smart_trades if t['reason'] == 'Manual']),
                 'SL': len([t for t in smart_trades if t['reason'] == 'SL']),
                 'TP': len([t for t in smart_trades if t['reason'] == 'TP'])}
axes[1].pie(smart_reasons.values(), labels=smart_reasons.keys(), autopct='%1.1f%%',
            colors=['#3498db', '#e74c3c', '#2ecc71'], startangle=90,
            textprops={'fontsize': 12})
axes[1].set_title('Smart: Close Reason Distribution', fontsize=14, fontweight='bold')

plt.tight_layout()
plt.savefig(f'{chart_dir}/05_close_reasons.png', dpi=150, bbox_inches='tight')
plt.close()
print("Chart 5 saved")

# 6. Direction bias
fig, axes = plt.subplots(1, 2, figsize=(12, 5))

agent_dir = {'Buy': agent_stats['buys'], 'Sell': agent_stats['sells']}
axes[0].bar(agent_dir.keys(), agent_dir.values(), color=['#2ecc71', '#e74c3c'], edgecolor='white', width=0.4)
axes[0].set_title(f'Agent: Direction Bias\nBuy PnL=${agent_stats["buy_pnl"]:.2f} | Sell PnL=${agent_stats["sell_pnl"]:.2f}', fontsize=12, fontweight='bold')
axes[0].set_ylabel('Number of Trades')

smart_dir = {'Buy': smart_stats['buys'], 'Sell': smart_stats['sells']}
axes[1].bar(smart_dir.keys(), smart_dir.values(), color=['#2ecc71', '#e74c3c'], edgecolor='white', width=0.4)
axes[1].set_title(f'Smart: Direction Bias\nBuy PnL=${smart_stats["buy_pnl"]:.2f} | Sell PnL=${smart_stats["sell_pnl"]:.2f}', fontsize=12, fontweight='bold')
axes[1].set_ylabel('Number of Trades')

plt.tight_layout()
plt.savefig(f'{chart_dir}/06_direction_bias.png', dpi=150, bbox_inches='tight')
plt.close()
print("Chart 6 saved")

# 7. Cumulative P&L over time
fig, ax = plt.subplots(figsize=(14, 6))

cumulative_pnl_all = [0]
for t in trades:
    cumulative_pnl_all.append(cumulative_pnl_all[-1] + t['pnl'])

cumulative_pnl_agent = [0]
for t in agent_trades:
    cumulative_pnl_agent.append(cumulative_pnl_agent[-1] + t['pnl'])

cumulative_pnl_smart = [0]
for t in smart_trades:
    cumulative_pnl_smart.append(cumulative_pnl_smart[-1] + t['pnl'])

ax.plot(range(len(cumulative_pnl_all)), cumulative_pnl_all, 'b-', linewidth=2, label='Combined', alpha=0.8)
ax.plot(range(len(cumulative_pnl_agent)), cumulative_pnl_agent, 'g-', linewidth=1.5, label='Agent', alpha=0.7)
ax.plot(range(len(cumulative_pnl_smart)), cumulative_pnl_smart, 'r-', linewidth=1.5, label='Smart', alpha=0.7)
ax.axhline(y=0, color='gray', linestyle='--', alpha=0.5)
ax.set_title('Cumulative P&L Over Trades', fontsize=14, fontweight='bold')
ax.set_xlabel('Trade Number')
ax.set_ylabel('Cumulative P&L ($)')
ax.legend(loc='best')
ax.fill_between(range(len(cumulative_pnl_all)), cumulative_pnl_all, alpha=0.1, color='blue')

plt.tight_layout()
plt.savefig(f'{chart_dir}/07_cumulative_pnl.png', dpi=150, bbox_inches='tight')
plt.close()
print("Chart 7 saved")

# 8. SL/TP Distance Analysis
fig, axes = plt.subplots(1, 2, figsize=(14, 5))

agent_sl_dists = [t['sl_dist_pct'] for t in agent_trades]
agent_tp_dists = [t['tp_dist_pct'] for t in agent_trades]

axes[0].scatter(agent_sl_dists, agent_tp_dists, c=[('#2ecc71' if t['pnl'] > 0 else '#e74c3c') for t in agent_trades], 
                alpha=0.6, s=50)
max_val_agent = max(max(agent_sl_dists), max(agent_tp_dists))
axes[0].plot([0, max_val_agent], [0, max_val_agent], 'k--', alpha=0.3, label='1:1 R:R')
axes[0].set_title('Agent: SL Distance vs TP Distance', fontsize=13, fontweight='bold')
axes[0].set_xlabel('SL Distance (%)')
axes[0].set_ylabel('TP Distance (%)')
axes[0].legend(loc='best')

smart_sl_dists = [t['sl_dist_pct'] for t in smart_trades]
smart_tp_dists = [t['tp_dist_pct'] for t in smart_trades]
axes[1].scatter(smart_sl_dists, smart_tp_dists, c=[('#2ecc71' if t['pnl'] > 0 else '#e74c3c') for t in smart_trades],
                alpha=0.6, s=80, marker='s')
max_val_smart = max(max(smart_sl_dists), max(smart_tp_dists))
axes[1].plot([0, max_val_smart], [0, max_val_smart], 'k--', alpha=0.3, label='1:1 R:R')
axes[1].set_title('Smart: SL Distance vs TP Distance', fontsize=13, fontweight='bold')
axes[1].set_xlabel('SL Distance (%)')
axes[1].set_ylabel('TP Distance (%)')
axes[1].legend(loc='best')

plt.tight_layout()
plt.savefig(f'{chart_dir}/08_sl_tp_analysis.png', dpi=150, bbox_inches='tight')
plt.close()
print("Chart 8 saved")

# ── Save stats as JSON for PDF generation ────────────────────────────────────
stats_data = {
    'agent': {k: v for k, v in agent_stats.items() if k != 'pair_stats'},
    'smart': {k: v for k, v in smart_stats.items() if k != 'pair_stats'},
    'all': {k: v for k, v in all_stats.items() if k != 'pair_stats'},
    'agent_pair_stats': {k: v for k, v in agent_stats.get('pair_stats', {}).items()},
    'smart_pair_stats': {k: v for k, v in smart_stats.get('pair_stats', {}).items()},
    'agent_pf': agent_pf,
    'smart_pf': smart_pf,
    'agent_exp': agent_exp,
    'smart_exp': smart_exp,
}

smart_sorted = sorted(smart_trades, key=lambda x: x['pnl'])
agent_sorted = sorted(agent_trades, key=lambda x: x['pnl'])

stats_data['smart_worst_5'] = [
    {'pair': t['pair'], 'direction': t['direction'], 'size': t['size'], 
     'pnl': t['pnl'], 'reason': t['reason'], 'position_value': round(t['position_value'], 2),
     'sl_dist_pct': round(t['sl_dist_pct'], 2), 'tp_dist_pct': round(t['tp_dist_pct'], 2),
     'risk_reward': round(t['risk_reward'], 2)}
    for t in smart_sorted[:5]
]
stats_data['smart_best_5'] = [
    {'pair': t['pair'], 'direction': t['direction'], 'size': t['size'],
     'pnl': t['pnl'], 'reason': t['reason'], 'position_value': round(t['position_value'], 2),
     'sl_dist_pct': round(t['sl_dist_pct'], 2), 'tp_dist_pct': round(t['tp_dist_pct'], 2),
     'risk_reward': round(t['risk_reward'], 2)}
    for t in smart_sorted[-5:]
]

with open('/home/z/my-project/download/stats.json', 'w') as f:
    json.dump(stats_data, f, indent=2, default=str)

print("\n=== ALL CHARTS AND STATS SAVED ===")
