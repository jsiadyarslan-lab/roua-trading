import pandas as pd
import numpy as np
import json

# Load the data
df = pd.read_csv('/home/z/my-project/download/trade_data.csv')
print(f"Total trades: {len(df)}")
print(f"Columns: {list(df.columns)}")

# Basic statistics
total_trades = len(df)
agent_trades = df[df['Executor'] == 'Agent']
smart_trades = df[df['Executor'] == 'Smart']

print(f"\n=== EXECUTOR DISTRIBUTION ===")
print(f"Agent trades: {len(agent_trades)}")
print(f"Smart trades: {len(smart_trades)}")

# Direction distribution
print(f"\n=== DIRECTION DISTRIBUTION ===")
for ex in ['Agent', 'Smart', 'ALL']:
    subset = df if ex == 'ALL' else df[df['Executor'] == ex]
    sells = len(subset[subset['Dir'] == 'Sell'])
    buys = len(subset[subset['Dir'] == 'Buy'])
    print(f"{ex}: Sells={sells} ({sells/len(subset)*100:.1f}%), Buys={buys} ({buys/len(subset)*100:.1f}%)")

# Win/Loss analysis
df['Win'] = df['PnL'] > 0
df['Loss'] = df['PnL'] < 0
df['Breakeven'] = df['PnL'] == 0

print(f"\n=== WIN/LOSS ANALYSIS ===")
for ex in ['Agent', 'Smart', 'ALL']:
    subset = df if ex == 'ALL' else df[df['Executor'] == ex]
    wins = len(subset[subset['PnL'] > 0])
    losses = len(subset[subset['PnL'] < 0])
    breakeven = len(subset[subset['PnL'] == 0])
    total = len(subset)
    win_rate = wins / total * 100
    total_pnl = subset['PnL'].sum()
    avg_win = subset[subset['PnL'] > 0]['PnL'].mean() if wins > 0 else 0
    avg_loss = subset[subset['PnL'] < 0]['PnL'].mean() if losses > 0 else 0
    max_win = subset['PnL'].max()
    max_loss = subset['PnL'].min()
    
    gross_profit = subset[subset['PnL'] > 0]['PnL'].sum()
    gross_loss = abs(subset[subset['PnL'] < 0]['PnL'].sum())
    profit_factor = gross_profit / gross_loss if gross_loss > 0 else float('inf')
    
    print(f"\n--- {ex} ---")
    print(f"Trades: {total}")
    print(f"Wins: {wins}, Losses: {losses}, Breakeven: {breakeven}")
    print(f"Win Rate: {win_rate:.2f}%")
    print(f"Total P&L: ${total_pnl:.2f}")
    print(f"Avg Win: ${avg_win:.2f}, Avg Loss: ${avg_loss:.2f}")
    print(f"Max Win: ${max_win:.2f}, Max Loss: ${max_loss:.2f}")
    print(f"Gross Profit: ${gross_profit:.2f}, Gross Loss: ${gross_loss:.2f}")
    print(f"Profit Factor: {profit_factor:.3f}")
    print(f"Avg Win/Avg Loss Ratio: {abs(avg_win/avg_loss) if avg_loss != 0 else 'N/A':.2f}" if avg_loss != 0 else "Avg Win/Avg Loss Ratio: N/A")

# Close reason analysis
print(f"\n=== CLOSE REASON ANALYSIS ===")
for ex in ['Agent', 'Smart', 'ALL']:
    subset = df if ex == 'ALL' else df[df['Executor'] == ex]
    print(f"\n--- {ex} ---")
    reason_counts = subset['Reason'].value_counts()
    for reason, count in reason_counts.items():
        reason_pnl = subset[subset['Reason'] == reason]['PnL'].sum()
        reason_wins = len(subset[(subset['Reason'] == reason) & (subset['PnL'] > 0)])
        print(f"  {reason}: {count} trades ({count/len(subset)*100:.1f}%), P&L: ${reason_pnl:.2f}, Wins: {reason_wins}")

# Pair analysis
print(f"\n=== PAIR ANALYSIS ===")
for ex in ['Agent', 'Smart']:
    subset = df[df['Executor'] == ex]
    print(f"\n--- {ex} ---")
    for pair in sorted(subset['Pair'].unique()):
        pair_data = subset[subset['Pair'] == pair]
        wins = len(pair_data[pair_data['PnL'] > 0])
        total = len(pair_data)
        total_pnl = pair_data['PnL'].sum()
        avg_pnl = pair_data['PnL'].mean()
        print(f"  {pair}: {total} trades, Win Rate: {wins/total*100:.1f}%, Total P&L: ${total_pnl:.2f}, Avg P&L: ${avg_pnl:.2f}")

# Risk-Reward analysis
print(f"\n=== RISK-REWARD ANALYSIS ===")
df['SL_distance'] = 0.0
df['TP_distance'] = 0.0

for idx, row in df.iterrows():
    entry = row['Entry']
    sl = row['StopLoss']
    tp = row['TakeProfit']
    
    if row['Dir'] == 'Sell':
        sl_dist = (sl - entry) / entry * 100  # positive means SL is above entry (bad for sell)
        tp_dist = (entry - tp) / entry * 100  # positive means TP is below entry (good for sell)
    else:  # Buy
        sl_dist = (entry - sl) / entry * 100  # positive means SL is below entry (good for buy)
        tp_dist = (tp - entry) / entry * 100  # positive means TP is above entry (good for buy)
    
    df.at[idx, 'SL_distance'] = abs(sl_dist)
    df.at[idx, 'TP_distance'] = abs(tp_dist)

df['RR_ratio'] = df['TP_distance'] / df['SL_distance']

for ex in ['Agent', 'Smart', 'ALL']:
    subset = df if ex == 'ALL' else df[df['Executor'] == ex]
    print(f"\n--- {ex} ---")
    print(f"Avg SL Distance: {subset['SL_distance'].mean():.3f}%")
    print(f"Avg TP Distance: {subset['TP_distance'].mean():.3f}%")
    print(f"Avg R:R Ratio: {subset['RR_ratio'].mean():.2f}")
    print(f"Median R:R Ratio: {subset['RR_ratio'].median():.2f}")
    
    # R:R distribution
    rr_bins = [(0, 1), (1, 1.5), (1.5, 2), (2, 3), (3, 5), (5, float('inf'))]
    for low, high in rr_bins:
        count = len(subset[(subset['RR_ratio'] >= low) & (subset['RR_ratio'] < high)])
        print(f"  R:R {low}-{high if high != float('inf') else 'inf'}: {count} trades")

# Duration analysis
print(f"\n=== DURATION ANALYSIS ===")
def parse_duration(d):
    if pd.isna(d):
        return None
    d = str(d).strip()
    total_minutes = 0
    parts = d.split()
    i = 0
    while i < len(parts) - 1:
        val = parts[i]
        unit = parts[i+1]
        try:
            v = float(val)
        except:
            i += 2
            continue
        if 'h' in unit:
            total_minutes += v * 60
        elif 'm' in unit:
            total_minutes += v
        elif 's' in unit:
            total_minutes += v / 60
        elif 'd' in unit:
            total_minutes += v * 1440
        i += 2
    return total_minutes

df['Duration_mins'] = df['Duration'].apply(parse_duration)

for ex in ['Agent', 'Smart', 'ALL']:
    subset = df if ex == 'ALL' else df[df['Executor'] == ex]
    print(f"\n--- {ex} ---")
    print(f"Avg Duration: {subset['Duration_mins'].mean():.1f} mins ({subset['Duration_mins'].mean()/60:.1f} hours)")
    print(f"Median Duration: {subset['Duration_mins'].median():.1f} mins")
    
    # Duration by reason
    for reason in subset['Reason'].unique():
        reason_data = subset[subset['Reason'] == reason]
        print(f"  {reason}: Avg {reason_data['Duration_mins'].mean():.1f} mins")

# Duplicate trade detection
print(f"\n=== RAPID-FIRE DUPLICATE DETECTION ===")
for pair in df['Pair'].unique():
    pair_data = df[df['Pair'] == pair].sort_values('CloseTime')
    for ex in ['Agent', 'Smart']:
        ex_data = pair_data[pair_data['Executor'] == ex]
        if len(ex_data) < 2:
            continue
        # Check for trades with very similar entry prices and close times
        entries = ex_data['Entry'].values
        for i in range(len(entries) - 1):
            row1 = ex_data.iloc[i]
            row2 = ex_data.iloc[i+1]
            if abs(row1['Entry'] - row2['Entry']) / row1['Entry'] < 0.002:  # Within 0.2% entry price
                if abs(row1['Size'] - row2['Size']) / row1['Size'] < 0.02:  # Within 2% size
                    print(f"  DUPLICATE: {pair} {ex} - Entry1={row1['Entry']:.6f} Size1={row1['Size']:.2f} vs Entry2={row2['Entry']:.6f} Size2={row2['Size']:.2f}")

# Notional value analysis  
print(f"\n=== NOTIONAL VALUE ANALYSIS ===")
df['Notional'] = df['Size'] * df['Entry']
for ex in ['Agent', 'Smart']:
    subset = df[df['Executor'] == ex]
    print(f"\n--- {ex} ---")
    print(f"Avg Notional: ${subset['Notional'].mean():.2f}")
    print(f"Median Notional: ${subset['Notional'].median():.2f}")
    print(f"Max Notional: ${subset['Notional'].max():.2f}")
    print(f"Min Notional: ${subset['Notional'].min():.2f}")
    
    for pair in sorted(subset['Pair'].unique()):
        pair_data = subset[subset['Pair'] == pair]
        print(f"  {pair}: Avg Notional ${pair_data['Notional'].mean():.2f}, Max ${pair_data['Notional'].max():.2f}")

# P&L per notional (return %)
df['Return_pct'] = df['PnL'] / df['Notional'] * 100
print(f"\n=== RETURN PERCENTAGE ANALYSIS ===")
for ex in ['Agent', 'Smart']:
    subset = df[df['Executor'] == ex]
    print(f"\n--- {ex} ---")
    print(f"Avg Return: {subset['Return_pct'].mean():.4f}%")
    print(f"Median Return: {subset['Return_pct'].median():.4f}%")
    print(f"Std Dev Return: {subset['Return_pct'].std():.4f}%")

# Consecutive loss analysis
print(f"\n=== CONSECUTIVE LOSS ANALYSIS ===")
for ex in ['Agent', 'Smart']:
    subset = df[df['Executor'] == ex].reset_index(drop=True)
    max_consec_loss = 0
    current_consec = 0
    for i in range(len(subset)):
        if subset.loc[i, 'PnL'] < 0:
            current_consec += 1
            max_consec_loss = max(max_consec_loss, current_consec)
        else:
            current_consec = 0
    print(f"{ex}: Max consecutive losses: {max_consec_loss}")

# Sell bias impact
print(f"\n=== SELL BIAS IMPACT ===")
for ex in ['Agent', 'Smart']:
    subset = df[df['Executor'] == ex]
    sell_data = subset[subset['Dir'] == 'Sell']
    buy_data = subset[subset['Dir'] == 'Buy']
    print(f"\n--- {ex} ---")
    print(f"Sell: {len(sell_data)} trades, Win Rate: {len(sell_data[sell_data['PnL']>0])/len(sell_data)*100:.1f}%, Total P&L: ${sell_data['PnL'].sum():.2f}")
    print(f"Buy: {len(buy_data)} trades, Win Rate: {len(buy_data[buy_data['PnL']>0])/len(buy_data)*100:.1f}%, Total P&L: ${buy_data['PnL'].sum():.2f}")

# Time-based analysis (4h timeout pattern)
print(f"\n=== 4H TIMEOUT PATTERN ===")
for ex in ['Agent', 'Smart']:
    subset = df[df['Executor'] == ex]
    manual_4h = subset[(subset['Reason'] == 'Manual') & (subset['Duration_mins'] >= 235) & (subset['Duration_mins'] <= 245)]
    print(f"{ex}: Trades closed at ~4h timeout: {len(manual_4h)}")
    if len(manual_4h) > 0:
        print(f"  Avg P&L: ${manual_4h['PnL'].mean():.2f}")
        print(f"  Win Rate: {len(manual_4h[manual_4h['PnL']>0])/len(manual_4h)*100:.1f}%")
        print(f"  Total P&L: ${manual_4h['PnL'].sum():.2f}")

# Daily P&L breakdown
print(f"\n=== DAILY P&L SUMMARY ===")
# Approximate from CloseTime - just give total
for ex in ['Agent', 'Smart', 'ALL']:
    subset = df if ex == 'ALL' else df[df['Executor'] == ex]
    print(f"{ex}: Total P&L = ${subset['PnL'].sum():.2f}")

# Worst individual trades
print(f"\n=== TOP 10 WORST TRADES ===")
worst = df.nsmallest(10, 'PnL')[['Pair', 'Executor', 'Dir', 'Size', 'Entry', 'PnL', 'Reason', 'Duration']]
print(worst.to_string())

print(f"\n=== TOP 10 BEST TRADES ===")
best = df.nlargest(10, 'PnL')[['Pair', 'Executor', 'Dir', 'Size', 'Entry', 'PnL', 'Reason', 'Duration']]
print(best.to_string())

# Special BTC anomaly detection
print(f"\n=== BTC ENTRY ANOMALY ===")
btc_trades = df[df['Pair'] == 'BTC/USDT']
anomalous = btc_trades[(btc_trades['Entry'] < 10000) | (btc_trades['Entry'] > 100000)]
if len(anomalous) > 0:
    print("Found anomalous BTC entry prices:")
    print(anomalous[['Executor', 'Dir', 'Size', 'Entry', 'Close', 'PnL', 'Reason']].to_string())

# SL placement analysis
print(f"\n=== SL PLACEMENT QUALITY ===")
for ex in ['Agent', 'Smart']:
    subset = df[df['Executor'] == ex]
    # For Sell trades, SL should be above entry
    sells = subset[subset['Dir'] == 'Sell']
    sl_above_entry = sells[sells['StopLoss'] > sells['Entry']]
    sl_below_entry = sells[sells['StopLoss'] < sells['Entry']]
    print(f"\n{ex} Sell trades:")
    print(f"  SL above entry (correct): {len(sl_above_entry)} ({len(sl_above_entry)/len(sells)*100:.1f}%)")
    print(f"  SL below entry (WRONG): {len(sl_below_entry)} ({len(sl_below_entry)/len(sells)*100:.1f}%)")
    
    buys = subset[subset['Dir'] == 'Buy']
    sl_below_entry_buys = buys[buys['StopLoss'] < buys['Entry']]
    sl_above_entry_buys = buys[buys['StopLoss'] > buys['Entry']]
    print(f"{ex} Buy trades:")
    print(f"  SL below entry (correct): {len(sl_below_entry_buys)} ({len(sl_below_entry_buys)/len(buys)*100:.1f}%)")
    print(f"  SL above entry (WRONG): {len(sl_above_entry_buys)} ({len(sl_above_entry_buys)/len(buys)*100:.1f}%)")

# Summary
print(f"\n{'='*60}")
print(f"COMPREHENSIVE SUMMARY")
print(f"{'='*60}")
total_pnl = df['PnL'].sum()
smart_pnl = smart_trades['PnL'].sum()
agent_pnl = agent_trades['PnL'].sum()
print(f"Total Net P&L: ${total_pnl:.2f}")
print(f"Smart P&L: ${smart_pnl:.2f}")
print(f"Agent P&L: ${agent_pnl:.2f}")
print(f"Total Win Rate: {len(df[df['PnL']>0])/len(df)*100:.1f}%")
print(f"Smart Win Rate: {len(smart_trades[smart_trades['PnL']>0])/len(smart_trades)*100:.1f}%")
print(f"Agent Win Rate: {len(agent_trades[agent_trades['PnL']>0])/len(agent_trades)*100:.1f}%")
gross_profit = df[df['PnL']>0]['PnL'].sum()
gross_loss = abs(df[df['PnL']<0]['PnL'].sum())
print(f"Overall Profit Factor: {gross_profit/gross_loss:.3f}")
print(f"Overall Avg R:R: {df['RR_ratio'].mean():.2f}")
print(f"Sell/Buy Ratio: {len(df[df['Dir']=='Sell'])/len(df[df['Dir']=='Buy']):.2f}")

