'use client'

const T = {
  green: '#00FFA3', greenDim: '#00CC82', red: '#FF4757', redDim: '#FF3344',
  amber: '#FFB800', text2: '#94a3b8', text3: '#8B92A8', text: '#F0F2F5',
}

interface ScoreGaugeProps {
  score: number
  size?: number
  label?: string
  showValue?: boolean
}

function getScoreColor(score: number): string {
  if (score >= 40) return T.green
  if (score >= 15) return T.greenDim
  if (score > -15) return T.amber
  if (score > -40) return T.redDim
  return T.red
}

export function ScoreGauge({ score, size = 44, label, showValue = true }: ScoreGaugeProps) {
  const color = getScoreColor(score)
  const r = (size - 6) / 2
  const cx = size / 2
  const cy = size / 2
  const circumference = 2 * Math.PI * r
  const normalizedScore = ((score + 100) / 200) // -100..100 → 0..1
  const dashOffset = circumference * (1 - normalizedScore)

  const gradId = `sg-${Math.random().toString(36).slice(2, 8)}`

  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
      <svg width={size} height={size} style={{ transform: 'scaleX(-1)' }}>
        <defs>
          <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={color} stopOpacity={0.6} />
            <stop offset="100%" stopColor={color} stopOpacity={1} />
          </linearGradient>
        </defs>
        {/* Track */}
        <circle cx={cx} cy={cy} r={r} fill="none"
          stroke="rgba(255,255,255,0.06)" strokeWidth={3} />
        {/* Fill */}
        <circle cx={cx} cy={cy} r={r} fill="none"
          stroke={`url(#${gradId})`} strokeWidth={3}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          style={{ transition: 'stroke-dashoffset 0.6s ease' }}
          transform={`rotate(-90 ${cx} ${cy})`} />
      </svg>
      {showValue && (
        <div style={{
          position: 'relative', marginTop: -size * 0.6, marginBottom: size * 0.35,
          fontSize: size * 0.24, fontWeight: 800, color, textAlign: 'center',
          fontFamily: "'JetBrains Mono', monospace",
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          height: size * 0.35,
        }}>
          {score > 0 ? '+' : ''}{score}
        </div>
      )}
      {label && (
        <span style={{
          fontSize: size * 0.17, color: T.text3, fontWeight: 600,
          fontFamily: "'Cairo', sans-serif",
        }}>
          {label}
        </span>
      )}
    </div>
  )
}
