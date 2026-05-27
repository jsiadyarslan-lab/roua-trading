# Global Market Research: Trading Analysis Platforms
## Comprehensive Comparison for Evaluating "Roua Trading"

---

## 1. AUTOCHARTIST — Industry Standard for Automated Pattern Recognition

### Overview
AutoChartist is the world's most widely deployed automated pattern recognition engine, integrated by 100+ brokers worldwide (IG, OANDA, Pepperstone, Swissquote, etc.). It scans markets 24/7 across forex, CFDs, equities, commodities, and cryptocurrencies.

### Pattern Detection Capabilities
| Category | Patterns Detected |
|----------|-------------------|
| **Chart Patterns** | Head & Shoulders, Inverse H&S, Double Top/Bottom, Triple Top/Bottom, Ascending/Descending/Symmetrical Triangle, Rising/Falling Wedge, Rectangle, Flag, Pennant, Channel |
| **Fibonacci Patterns** | ABCD, Three Drives, 3-Point Retracement, 3-Point Extension |
| **Key Levels** | Horizontal Support & Resistance (approaching & breakout) |

### Pattern Quality Rating System (1–10 scale)
AutoChartist assigns **six quality indicators**, each rated 1–10, then computes an overall **Quality** score as the arithmetic mean:

| Indicator | What It Measures |
|-----------|-----------------|
| **Initial Trend** | Strength/duration of the trend prior to pattern formation (measured over 10 bars). High = strong preceding trend = more reliable breakout |
| **Uniformity** | How well price action fills the pattern boundaries. Measures average time-distance between identified touching points |
| **Clarity** | How "clean" the price action is between S/R. Low noise, no erratic spikes = higher score |
| **Breakout** | Decisiveness of the breakout through S/R (only for completed patterns) |
| **Volume** | Relative increase in volume at breakout point (not applicable to emerging patterns) |
| **Quality (Overall)** | Arithmetic average of all the above |

### Fibonacci Tool
- Automatically identifies **4 Fibonacci-based patterns**: ABCD, Three Drives, 3-Point Retracement, 3-Point Extension
- Calculates Fibonacci projections and retracement levels automatically
- Does NOT provide manual Fibonacci drawing tools (it is a scanner, not a charting platform)

### Key Statistics Features
- **Volatility Analysis**: Expected price range projections over various time horizons (1hr, 4hr, 24hr, etc.)
- **Performance Statistics**: Historical hit-rate for completed patterns by instrument
- **Risk Calculator**: Position sizing based on expected volatility
- **Economic Events Calendar**: Integration with market-moving events
- **Price Forecast**: Automatic projection of breakout targets

### Accuracy Claims
- No explicit accuracy percentage published
- Historical performance statistics available per completed pattern type
- Industry reputation: ~60-70% win rate on high-quality patterns (community consensus)

### Multi-Timeframe
- Scans across multiple timeframes (15min to monthly)
- Does NOT provide synchronized multi-timeframe view on a single chart

---

## 2. TRADINGVIEW — Most Popular Charting Platform

### Overview
TradingView is the world's largest social charting platform with 90M+ users. It combines professional charting, community scripts, and broker integration in a web-based interface.

### Smart Drawing Tools
- **110+ smart drawing tools** including:
  - Trend lines, channels, pitchforks (Andrews', Schiff, Modified Schiff)
  - Fibonacci Retracement, Extension, Projection, Time, Speed Resistance, Circle, Spiral
  - Gann Fan, Gann Box, Gann Square
  - Elliott Wave (Impulse, Correction), Elliott Wave Degree labels
  - Harmonic patterns (via community scripts)
  - Geometric shapes, measurement tools, prediction tools
  - Magnet mode for snap-to-price drawing

### Pattern Recognition Features
- **Auto Chart Patterns** (built-in, 2023+): Automatically detects and draws:
  - Double Top/Bottom, Triple Top/Bottom
  - Head & Shoulders, Inverse H&S
  - Ascending/Descending/Symmetrical Triangle
  - Rising/Falling Wedge, Rectangle
  - Available on all chart types (candlestick, line, etc.)
- **Candlestick Pattern Recognition** (built-in): Detects 30+ candlestick patterns
- **Community Scripts**: 200,000+ public indicators including advanced pattern scanners (harmonics, Elliott Wave auto-detection, etc.)

### Technical Analysis Indicators
- **400+ built-in indicators** and strategies
- **100,000+ community-built indicators** via Pine Script
- Categories: Trend, Momentum, Volatility, Volume, Bill Williams
- Volume Profile indicators (Premium tier)

### Multi-Timeframe Analysis
- Full MTF support: overlay indicators from different timeframes
- Security() function in Pine Script for MTF data access
- Up to 8 linked chart panes

### Signal Generation Quality
- Alert system with complex conditions (multi-condition, multi-timeframe)
- Webhook-based automated trading signals
- No built-in "quality rating" for detected patterns (unlike AutoChartist/TrendSpider)

### Pricing Tiers
| Tier | Price/mo | Key Limits |
|------|----------|------------|
| Free | $0 | 2 indicators, 1 alert |
| Pro | $14.95 | 5 indicators, 20 alerts |
| Pro+ | $29.95 | 10 indicators, 100 alerts |
| Premium | $59.95 | 25 indicators, 400 alerts, Volume Profile |

---

## 3. METATRADER 4/5 — Most Used Trading Platform

### Overview
MetaTrader 4/5 is the most widely used forex/CFD trading platform globally, with MT4 dominating (est. 80%+ of retail forex). MT5 adds multi-asset support and enhanced analytics.

### Built-in Analytical Tools

| Feature | MT4 | MT5 |
|---------|-----|-----|
| Technical Indicators | 30 | 38 |
| Analytical Objects | 31 | 44-46 |
| Timeframes | 9 | 21 |
| Built-in Elliott Wave | Basic (5-3 pattern objects) | Yes (Elliott tools) |
| Gann Tools | Yes (Fan, Grid, Line) | Yes (Fan, Grid, Line, Square) |
| Fibonacci Tools | Retracement, Time, Fan, Arc, Expansion | Retracement, Time, Fan, Arc, Expansion, Channel |
| Channels | 4 types | 6 types |

### Expert Advisors (EAs)
- Automated trading programs written in MQL4/MQL5
- Full programmatic access to indicators, price data, and order management
- Strategy Tester for backtesting (MT5 has superior multi-threaded tester)
- MQL5 Marketplace: 26,000+ EAs and indicators available

### Pattern Recognition
- **No built-in automated pattern recognition** for chart patterns
- Pattern detection requires custom EAs or indicators from the marketplace
- AutoChartist is available as a third-party plugin/integration for MT4/MT5

### Risk Management
- Stop Loss, Take Profit, Trailing Stop
- Margin calculation (no built-in position sizing calculator)
- Risk management must be coded into EAs

### Accuracy Claims
- Platform itself makes no accuracy claims
- Accuracy depends entirely on custom EAs/indicators used

---

## 4. TRENDSPIDER — AI-Powered Technical Analysis

### Overview
TrendSpider is an AI-driven, all-in-one market research platform focused on automating technical analysis. It targets active traders who want algorithmic precision without coding.

### Automated Trend Line Detection
- **Mathematical precision** in detecting trend lines using algorithmic scanning
- Parameters adjustable: sensitivity, minimum touch count, lookback period
- Auto-updates trend lines in real-time as new candles form
- Detects support/resistance lines, channels, and dynamic S/R zones

### Multi-Timeframe Analysis (MTFA)
- **Native, best-in-class MTFA**: Overlay indicators and patterns from ANY higher timeframe directly onto a lower-timeframe chart
- Can plot daily 5-period EMA on a 5-minute chart
- Candlestick formations from different timeframes highlighted simultaneously
- This is TrendSpider's #1 differentiating feature

### Pattern Recognition & Quality Scoring
| Feature | Details |
|---------|---------|
| **Chart Patterns** | Auto-detects: Double Top/Bottom, Triple Top/Bottom, Head & Shoulders, Triangles, Wedges, Rectangles, Channels |
| **Candlestick Patterns** | Auto-detects 30+ single and multi-candle patterns on any timeframe |
| **Fibonacci Levels** | Auto-detects and draws Fibonacci levels with precision |
| **Quality Scoring** | Adjustable parameters for pattern detection sensitivity; no explicit 1-10 quality score like AutoChartist, but mathematical precision in trend line detection |

### AI Features
- Machine learning-based strategy builder
- AI-powered alerts and scanning
- Automated analysis with customizable parameters

### Key Statistics
- **200+ built-in indicators**
- Real-time scanning across the entire market
- Analyst estimates, corporate fundamentals, FRED data integration
- Seasonality analysis
- Heatmap analysis

### Pricing
| Tier | Price/mo |
|------|----------|
| Essential | $29 |
| Elite | $59 |
| Ultra | $89 |

### Accuracy Claims
- Claims "mathematical precision" in automated trend line detection
- No published win-rate statistics
- Community reports high reliability of automated trend lines vs. manual drawing

---

## 5. MOTIVEWAVE — Advanced Elliott Wave & Harmonic Analysis

### Overview
MotiveWave is a professional desktop trading platform (v7.0.24 as of May 2026) renowned for its deep Elliott Wave and harmonic pattern analysis. It is broker-neutral and supports stocks, futures, forex, and crypto.

### Elliott Wave Features
| Feature | Details |
|---------|---------|
| **Wave Components** | Manual plotting of all Elliott Wave degrees (Grand Supercycle to Subminuette) |
| **Auto Wave Detection** | Optional automated Elliott Wave counting |
| **Fibonacci Ratio Analysis** | Automatic calculation of Fibonacci ratios between waves |
| **Wave Validation** | Rules-based validation (Wave 2 never retraces 100% of Wave 1, etc.) |
| **Trading Strategies** | Built-in Elliott Wave trading strategies for automated execution |
| **Wave Labels** | Full Elliott Wave labeling with degree-specific notation |

### Harmonic Pattern Features
| Feature | Details |
|---------|---------|
| **Patterns** | Gartley, Bat, Alternate Bat, Butterfly, Crab, Deep Crab, Shark, Cypher, 5-0 |
| **PRZ Calculation** | Automatic Potential Reversal Zone identification |
| **Fibonacci Ratios** | Automatic ratio validation (e.g., Gartley: B=0.618XA, D=0.786XA) |
| **Pattern Validation** | Rules-based validation against Scott Carney's original ratios |
| **Entry/Stop/Target** | Automatic calculation of entry, stop-loss, and profit targets |

### Fibonacci Tools (Comprehensive)
- **Retracements**: Standard and extended Fibonacci retracement levels
- **Extensions**: Fibonacci price extensions for target calculation
- **Projections**: Fibonacci price projections
- **Time Ratios**: Fibonacci time-based analysis
- **Time & Price**: Combined time-price Fibonacci analysis
- **Expansions**: Fibonacci expansion levels
- **Spirals**: Fibonacci spiral overlays
- All calculated automatically with customizable ratio sets

### Additional Analysis
- Hurst Cycles analysis
- Gann Analysis
- Scanner module for market-wide pattern screening
- Strategy trading with backtesting
- Replay mode for historical analysis

### Pricing (One-Time + Annual)
| Edition | Price | Key Modules |
|---------|-------|-------------|
| Basic | $495 | Charting, basic analysis |
| Professional | $795 | + Strategy trading |
| Elliott Wave | $995 | + Elliott Wave + Fibonacci |
| Ultimate | $1,495 | + Harmonics, Scanner, Hurst, Gann |

---

## 6. HARMONIC TRADER / HPC SOFTWARE — Specialized Harmonic Pattern Analysis

### Overview
HarmonicTrader.com was founded by **Scott Carney**, the original creator of harmonic patterns (Gartley, Bat, Crab, Butterfly, Shark). The HPC (Harmonic Pattern Collection) software is the "official" implementation of Carney's methodology.

### Harmonic Pattern Capabilities
| Pattern | Key Ratios |
|---------|------------|
| **Gartley** | B=0.618XA, D=0.786XA, C=0.382-0.886AB |
| **Bat** | B=0.382-0.50XA, D=0.886XA |
| **Alternate Bat** | B=0.382XA, D=1.13XA |
| **Butterfly** | B=0.786XA, D=1.27XA |
| **Crab** | B=0.382-0.618XA, D=1.618XA |
| **Deep Crab** | B=0.886XA, D=1.618XA |
| **Shark** | C=1.13-1.618OA, D=0.886OC |
| **Cypher** | B=0.382-0.618XA, C=1.272-1.414XA |
| **5-0** | B=1.13-1.618XA, C=0.50AB |

### PRZ Calculation Method
- **Potential Reversal Zone (PRZ)**: The convergence zone where multiple Fibonacci measurements align
- PRZ is calculated by the intersection of:
  1. Primary Fibonacci ratio (e.g., 0.786XA for Gartley)
  2. Alternate Fibonacci ratios from different legs
  3. AB=CD completion point
- The tighter the PRZ (more Fibonacci confluence), the higher-probability the trade
- HPC software **automatically generates EXACT patterns** with precise PRZ identification
- Engulfing candlestick confirmation within PRZ for entry validation

### Platform Availability
- Available as TradingView indicator/script (Pine Script)
- Standalone HPC software with scanner
- 14-day free trial available

### Accuracy Claims
- Claims to be the most accurate implementation because it uses Carney's original, rigorously defined ratios
- No published win-rate, but emphasizes that exact ratio compliance is key to accuracy
- PRZ confirmation with price action (engulfing candles) improves entry precision

---

## 7. BOOKMAP / JIGSAW — Order Flow Analysis

### BOOKMAP

| Feature | Details |
|---------|---------|
| **Liquidity Heatmap** | Real-time visualization of limit order book as color-coded heatmap. Shows where liquidity is building/declining |
| **Volume Bubbles** | Executed trade volume displayed as bubbles at price levels. Size = volume, color = buy/sell aggression |
| **Volume Profile** | Session and historical volume profile showing POC, VAH, VAL |
| **Order Book** | Real-time Level 2/Level 3 data visualization |
| **Replay Mode** | Historical replay for order flow analysis practice |
| **Correlation Tracker** | Multi-instrument correlation visualization |
| **Add-on API** | Custom indicators via API |
| **Platform** | Desktop (Windows), subscription-based |
| **Editions** | Global ($19/mo), Global Plus ($49/mo), Advanced ($99/mo) |

### JIGSAW DAYTRADR

| Feature | Details |
|---------|---------|
| **DOM (Depth of Market)** | Advanced price ladder with real-time order flow |
| **Depth & Sales** | Combined order book + time & sales in single view |
| **Footprint Charts** | Bid/ask footprint at each price level |
| **Volume Profile** | Session volume profile with POC, Value Area |
| **Tape Reading** | Real-time tape reading tools for large order detection |
| **Iceberg Order Detection** | Identifies hidden large orders |
| **Trade Execution** | Built-in order execution with realistic fill simulation |
| **Replay Mode** | Recorded market replay for practice |
| **Education** | Comprehensive order flow trading education included |
| **Platform** | Desktop (Windows), subscription ($75/mo) or one-time ($1,500) |

### Comparison: Bookmap vs Jigsaw

| Dimension | Bookmap | Jigsaw |
|-----------|---------|--------|
| **Core Focus** | Liquidity visualization (heatmap) | Order flow execution & tape reading |
| **Best For** | Identifying where liquidity sits | Reading order flow for execution timing |
| **Heatmap** | Best-in-class | Basic |
| **DOM** | Basic | Advanced (industry-leading) |
| **Execution** | Via integration | Built-in, with realistic fills |
| **Education** | Limited | Comprehensive included |
| **Footprint** | Via add-ons | Native |

---

## 8. COMPREHENSIVE COMPARISON TABLE

| Feature | AutoChartist | TradingView | MetaTrader 5 | TrendSpider | MotiveWave | HPC/Scott Carney | Bookmap/Jigsaw |
|---------|-------------|-------------|--------------|-------------|------------|-----------------|----------------|
| **Chart Pattern Detection** | ✅ Automated, 15+ types | ✅ Built-in auto + community | ❌ None built-in | ✅ Automated, 10+ types | ❌ Manual only | ❌ Not chart patterns | ❌ N/A |
| **Fibonacci Patterns** | ✅ ABCD, 3-Drive, 3-Point | ✅ Via community scripts | ⚠️ Manual Fibo tools | ✅ Auto Fibo levels | ✅ Comprehensive auto | ✅ Core feature | ❌ N/A |
| **Harmonic Patterns** | ❌ No | ✅ Via community scripts | ❌ No | ⚠️ Limited | ✅ Full (9+ patterns) | ✅ Full (9+ patterns, original ratios) | ❌ N/A |
| **Elliott Wave** | ❌ No | ⚠️ Manual tools + scripts | ⚠️ Basic manual tools | ⚠️ Limited | ✅ Best-in-class | ❌ No | ❌ N/A |
| **Pattern Quality Scoring** | ✅ 6 metrics, 1-10 scale | ❌ No | ❌ No | ⚠️ Parameter-based | ⚠️ Ratio validation | ✅ PRZ precision | ❌ N/A |
| **Multi-Timeframe** | ⚠️ Scans MTF, no overlay | ✅ Full MTF overlay | ⚠️ Limited | ✅ Best-in-class MTFA | ✅ Full MTF | ❌ Single TF | ⚠️ Single TF |
| **Automated Trend Lines** | ❌ No | ❌ No | ❌ No | ✅ Core feature | ❌ No | ❌ No | ❌ No |
| **Order Flow / Volume Profile** | ❌ No | ⚠️ Premium tier | ❌ No | ⚠️ Basic | ⚠️ Basic | ❌ No | ✅ Best-in-class |
| **Candlestick Patterns** | ❌ No | ✅ 30+ built-in | ❌ No | ✅ 30+ auto-detected | ❌ No | ❌ No | ❌ N/A |
| **Risk Management** | ✅ Volatility analysis, position sizing | ⚠️ Via scripts | ⚠️ Basic SL/TP | ⚠️ Alerts | ⚠️ Strategy module | ❌ No | ⚠️ Execution tools |
| **Backtesting** | ❌ No | ✅ Strategy Tester (Pine) | ✅ Strategy Tester | ✅ Strategy testing | ✅ Full backtesting | ❌ No | ❌ No |
| **API / Automation** | ✅ REST API | ✅ Pine Script + Webhooks | ✅ MQL4/5 | ✅ ML strategy builder | ✅ SDK | ⚠️ TradingView script | ⚠️ Limited |
| **Broker Integration** | ✅ Via brokers | ✅ 50+ brokers | ✅ 1000+ brokers | ⚠️ Select brokers | ✅ 30+ brokers | ❌ Standalone | ✅ Futures FCMs |
| **Price (entry)** | Free via brokers | Free / $14.95/mo | Free | $29/mo | $495 one-time | ~$39/mo | $19-75/mo |
| **Mathematical Rigor** | High (algorithmic) | Medium (varies) | Low (manual) | High (algorithmic) | Very High (rules-based) | Very High (original ratios) | High (data-based) |

---

## 9. WHAT PROFESSIONAL TRADERS EXPECT: Must-Have Features

Based on research across professional trading communities and platform reviews:

### Tier 1 — Non-Negotiable "Must-Haves"
1. **Automated Pattern Recognition** with quality scoring — saves hours of manual scanning
2. **Multi-Timeframe Analysis** — professional trading decisions require HTF context on LTF charts
3. **Fibonacci Tools** — retracement, extension, projection with snap-to-precision
4. **Risk Management** — position sizing calculator, R-multiple tracking, risk/reward ratio display
5. **Real-Time Alerting** — pattern completion alerts, breakout alerts, price alerts
6. **Chart Pattern + Candlestick Pattern Combination** — confluence-based analysis

### Tier 2 — Expected in Professional Tools
7. **Harmonic Pattern Detection** with PRZ identification — Gartley, Bat, Crab, Butterfly, Shark, Cypher
8. **Elliott Wave Analysis** — at minimum manual labeling, ideally automated counting
9. **Volume Profile** — POC, Value Area, volume nodes for institutional S/R
10. **Backtesting Capability** — validate patterns and strategies against historical data
11. **Scanner / Screener** — market-wide scanning for pattern setups
12. **Order Flow Visualization** — for futures/equities traders: DOM, footprint, tape

### Tier 3 — Differentiating "Nice-to-Haves"
13. **AI-Powered Analysis** — automated trend line detection, ML-based signals
14. **Community Scripts/Marketplace** — extensibility through user-created tools
15. **Broker Integration** — trade execution from the analysis platform
16. **Education Integration** — built-in learning resources
17. **Mobile Companion** — alerts and pattern notifications on mobile
18. **Replay Mode** — practice on historical data with order flow

---

## 10. KEY INSIGHTS FOR ROUA TRADING EVALUATION

### Market Gaps & Opportunities
1. **No single platform combines all analysis types** — AutoChartist has patterns but no order flow; Bookmap has order flow but no patterns; MotiveWave has Elliott Wave but no auto chart patterns
2. **Pattern quality scoring is rare** — Only AutoChartist provides a systematic 1-10 quality rating. This is a significant differentiator
3. **Harmonic pattern tools lack integration** — Scott Carney's HPC is standalone; MotiveWave has harmonics but limited auto-detection; TradingView relies on community scripts of varying quality
4. **Multi-timeframe analysis is poorly implemented** — TrendSpider is the only platform with truly native, intuitive MTFA. Most others require manual chart switching
5. **Mathematical rigor varies widely** — MotiveWave and HPC are the most mathematically rigorous; TradingView and MT5 depend on user skill

### Competitive Benchmarking for Roua Trading
| Capability | Best-in-Class | Minimum Viable | Roua Target |
|------------|---------------|----------------|-------------|
| Chart Pattern Auto-Detection | AutoChartist (15+ types) | 6-8 core patterns | 10+ patterns with quality scoring |
| Pattern Quality Rating | AutoChartist (6 metrics) | Single quality score | 4+ metrics (Initial Trend, Clarity, Uniformity, Breakout) |
| Fibonacci Patterns | AutoChartist (4 types) | ABCD + 3-Drive | All 4 AutoChartist types |
| Harmonic Patterns | HPC/MotiveWave (9+) | Gartley + Bat + Butterfly | 6+ patterns with PRZ |
| Elliott Wave | MotiveWave (full suite) | Manual wave labeling | Auto wave counting + validation |
| Multi-Timeframe | TrendSpider (native overlay) | Switch TF manually | TrendSpider-level MTF overlay |
| Order Flow | Bookmap/Jigsaw | Volume Profile | Volume Profile + basic heatmap |
| Risk Management | AutoChartist (volatility-based) | Basic position size | Volatility + R:R calculator |
| Candlestick Patterns | TradingView (30+) | 10-15 core patterns | 20+ patterns with confluence |

### Pricing Intelligence
- Free tier is expected (TradingView, MT4/5, AutoChartist via brokers)
- Professional tier: $29-89/month (TrendSpider, TradingView Premium)
- Desktop professional: $495-1,495 one-time (MotiveWave)
- Order flow specialist: $19-150/month (Bookmap/Jigsaw)

---

## SOURCES

- AutoChartist: autochartist.com, support.autochartist.com, earnforex.com
- TradingView: tradingview.com/features, tradingview.com/support
- MetaTrader: metatrader4.com, metatrader5.com, mql5.com
- TrendSpider: trendspider.com, help.trendspider.com
- MotiveWave: motivewave.com, docs.motivewave.com
- Harmonic Trader: harmonictrader.com
- Bookmap: bookmap.com
- Jigsaw: jigsawtrading.com
