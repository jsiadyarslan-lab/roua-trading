'use client'

const T = {
  green: '#00FFA3', red: '#FF4757', amber: '#FFB800',
  cyan: '#00D4FF', text3: '#8B92A8', bg: '#0B0E14',
  surface: '#1A1D29',
}

interface VolumeBarProps {
  current: number
  average?: number
  height?: number
}

export function VolumeBar({ current, average, height = 6 }: VolumeBarProps) {
  // Normalize: if we have average, scale relative to it; otherwise use a max
  const maxVal = average ? Math.max(current, average) * 1.2 : current * 1.2 || 1
  const currentPct = Math.min((current / maxVal) * 100, 100)

  let barColor = T.cyan
  if (average) {
    const ratio = current / average
    if (ratio >= 1.5) barColor = T.green   // high volume
    else if (ratio >= 1) barColor = T.cyan  // normal
    else if (ratio >= 0.5) barColor = T.amber // low
    else barColor = T.red                    // very low
  }

  const avgPct = average ? Math.min((average / maxVal) * 100, 100) : 0

  return (
    <div style={{ position: 'relative', width: '100%', height, borderRadius: height / 2, background: T.surface, overflow: 'hidden' }}>
      {/* Current volume bar */}
      <div style={{
        position: 'absolute', top: 0, right: 0,
        width: `${currentPct}%`, height: '100%',
        background: `linear-gradient(90deg, ${barColor}60, ${barColor})`,
        borderRadius: height / 2,
        transition: 'width 0.4s ease',
        boxShadow: currentPct > 70 ? `0 0 6px ${barColor}40` : 'none',
      }} />

      {/* Average line */}
      {average && avgPct > 0 && (
        <div style={{
          position: 'absolute', top: 0,
          right: `${avgPct}%`,
          width: 1, height: '100%',
          background: `${T.text3}80`,
          zIndex: 1,
        }} />
      )}
    </div>
  )
}
