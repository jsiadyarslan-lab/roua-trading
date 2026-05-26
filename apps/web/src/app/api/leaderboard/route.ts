import { NextResponse } from 'next/server'

/* ── Mock Leaderboard API ──
 * Returns demo leaderboard data for the leaderboard page.
 * In production, this would query the database for real trader performance.
 */

interface Trader {
  id: string
  name: string
  type: string
  avatar: string
  returnPct: number
  winRate: number
  maxDrawdown: number
  aum: string
  followers: number
  followAvailable: boolean
  consistency: number
  isCurrentUser?: boolean
}

interface Badge {
  id: string
  name: string
  desc: string
  icon: string
  color: string
  unlocked: boolean
}

const DEMO_TRADERS: Trader[] = [
  { id: '1', name: 'Quantum Alpha', type: 'High Frequency', avatar: 'QA', returnPct: 142.5, winRate: 87.5, maxDrawdown: -12.3, aum: '$4.2M', followers: 1240, followAvailable: true, consistency: 92 },
  { id: '2', name: 'Institutional Flow', type: 'Macro Swing', avatar: 'IF', returnPct: 31.0, winRate: 72.1, maxDrawdown: -8.1, aum: '$12.5M', followers: 890, followAvailable: true, consistency: 78 },
  { id: '3', name: 'Crypto Sniper', type: 'Scalping', avatar: 'CS', returnPct: 84.0, winRate: 91.2, maxDrawdown: -22.4, aum: '$1.1M', followers: 2100, followAvailable: true, consistency: 88 },
  { id: '4', name: 'DeFi Yield Master', type: 'Yield Farming', avatar: 'DY', returnPct: 18.0, winRate: 68.4, maxDrawdown: -4.2, aum: '$8.7M', followers: 560, followAvailable: false, consistency: 65 },
  { id: '5', name: 'Momentum Trader', type: 'Trend Following', avatar: 'MT', returnPct: 56.0, winRate: 79.3, maxDrawdown: -15.7, aum: '$3.1M', followers: 1680, followAvailable: true, consistency: 82 },
  { id: '6', name: 'Stable Earn', type: 'Arbitrage', avatar: 'SE', returnPct: 4.5, winRate: 94.8, maxDrawdown: -2.1, aum: '$22M', followers: 320, followAvailable: true, consistency: 97 },
  { id: '7', name: 'Gold Miner', type: 'Commodity Trading', avatar: 'GM', returnPct: 67.3, winRate: 75.8, maxDrawdown: -11.5, aum: '$5.8M', followers: 920, followAvailable: true, consistency: 73 },
  { id: '8', name: 'Forex Pro', type: 'Currency Pairs', avatar: 'FP', returnPct: 23.7, winRate: 82.4, maxDrawdown: -6.8, aum: '$7.3M', followers: 1150, followAvailable: false, consistency: 85 },
  { id: '9', name: 'Swing King', type: 'Swing Trading', avatar: 'SK', returnPct: 45.2, winRate: 71.9, maxDrawdown: -18.3, aum: '$2.4M', followers: 780, followAvailable: true, consistency: 69 },
  { id: '10', name: 'AI Enhanced', type: 'Algorithmic', avatar: 'AE', returnPct: 98.6, winRate: 83.7, maxDrawdown: -9.4, aum: '$6.1M', followers: 1450, followAvailable: true, consistency: 90 },
]

const DEMO_BADGES: Badge[] = [
  { id: 'b1', name: 'Early Adopter', desc: 'Joined Roua in the first year', icon: 'Star', color: '#FFD700', unlocked: true },
  { id: 'b2', name: 'Top 10', desc: 'Ranked in the top 10 traders', icon: 'Trophy', color: '#00D4FF', unlocked: true },
  { id: 'b3', name: 'Consistency King', desc: 'Maintained 80%+ consistency for 3 months', icon: 'Award', color: '#00FFA3', unlocked: false },
  { id: 'b4', name: 'Risk Manager', desc: 'Max drawdown below 5% for 6 months', icon: 'Shield', color: '#8B5CF6', unlocked: false },
  { id: 'b5', name: '100 Trades', desc: 'Completed 100 trades', icon: 'Target', color: '#F59E0B', unlocked: true },
  { id: 'b6', name: 'Community Star', desc: 'Gained 500+ followers', icon: 'Users', color: '#EC4899', unlocked: false },
]

export async function GET() {
  try {
    // Return demo leaderboard data
    // In production, this would fetch from the database
    return NextResponse.json({
      success: true,
      traders: DEMO_TRADERS,
      badges: DEMO_BADGES,
      currentUser: null,
      currentUserRank: null,
    })
  } catch (error) {
    console.error('[/api/leaderboard] Error:', error)
    return NextResponse.json(
      { success: false, traders: [], badges: [], currentUser: null, currentUserRank: null },
      { status: 500 }
    )
  }
}
