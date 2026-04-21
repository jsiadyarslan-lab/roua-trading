import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic' // Ensure it always fetches fresh data

// A selection of baseline symbols to simulate the scanner over
const BASELINE_SYMBOLS = [
  { sym: 'EUR/USD', type: 'Forex' },
  { sym: 'XAU/USD', type: 'Forex' },
  { sym: 'BTC/USD', type: 'Crypto' },
  { sym: 'ETH/USD', type: 'Crypto' },
  { sym: 'SOL/USD', type: 'Crypto' },
  { sym: 'USD/JPY', type: 'Forex' },
  { sym: 'GBP/USD', type: 'Forex' },
  { sym: 'NVDA', type: 'Stock' },
  { sym: 'TSLA', type: 'Stock' },
  { sym: 'AAPL', type: 'Stock' }
]

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const filterType = searchParams.get('type') || 'All'
    
    // 1. Fetch available assets from PortfolioAsset to blend real DB data
    const dbAssets = await db.portfolioAsset.findMany({
      select: { symbol: true, assetType: true }
    }).catch(() => [])

    const dbSymbolSet = new Set(dbAssets.map(a => a.symbol))
    
    // 2. Blend baseline constants with DB data
    const allScannerSymbols = [...BASELINE_SYMBOLS]
    dbAssets.forEach(asset => {
      if (!dbSymbolSet.has(asset.symbol)) {
        allScannerSymbols.push({ sym: asset.symbol, type: asset.assetType })
      }
    })

    // Filter if requested
    const filteredSymbols = allScannerSymbols.filter(s => 
      filterType === 'All' ? true : s.type === filterType
    )

    // 3. Generate dynamic technical analysis parameters indicating typical scanner outputs
    const results = filteredSymbols.map(asset => {
      const volatility = Math.random() * 5
      const isPositive = Math.random() > 0.4
      const changePct = isPositive ? (volatility) : (-volatility)
      const rsi = Math.floor(Math.random() * 60) + 20 // 20-80
      const macd = (Math.random() * 4 - 2).toFixed(2)
      
      let aiScore = 'Neutral'
      let aiColor = '#FFB800' // amber
      
      if (rsi < 35 && macd > 0) {
        aiScore = 'Strong Buy'
        aiColor = '#00FFC6' // green
      } else if (rsi > 65 && macd < 0) {
        aiScore = 'Strong Sell'
        aiColor = '#FF4D4D' // red
      } else if (changePct > 2) {
        aiScore = 'Buy'
        aiColor = '#00FFC6'
      } else if (changePct < -2) {
        aiScore = 'Sell'
        aiColor = '#FF4D4D'
      }

      // Generate a mock sparkline (mini chart data)
      const sparkline = Array.from({ length: 12 }, () => Math.random() * 20 + 40 + (isPositive ? 10 : -10))

      return {
        symbol: asset.sym,
        type: asset.type,
        price: asset.sym.includes('BTC') ? 64000 + Math.random()*2000 : Math.random() * 100 + 10,
        changePct: changePct,
        rsi: rsi,
        macd: macd,
        aiScore: aiScore,
        aiColor: aiColor,
        volume: Math.floor(Math.random() * 80) + 10 + 'M',
        sparkline
      }
    })

    // Add a slight delay for realistic loader feel
    await new Promise(r => setTimeout(r, 600))

    return NextResponse.json({
      success: true,
      data: results
    })

  } catch (error) {
    console.error('Scanner API Error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error during market scanning' },
      { status: 500 }
    )
  }
}
