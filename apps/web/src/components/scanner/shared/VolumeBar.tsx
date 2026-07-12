'use client'



interface VolumeBarProps {
  current: number
  average?: number
  height?: number
}

export function VolumeBar({ current, average, height = 6 }: VolumeBarProps) {
  // Normalize: if we have average, scale relative to it; otherwise use a max
  const maxVal = average ? Math.max(current, average) * 1.2 : current * 1.2 || 1
  const currentPct = Math.min((current / maxVal) * 100, 100)

  let barColor = '#00D4FF'
  if (average) {
    const ratio = current / average
    if (ratio >= 1.5) barColor = '#00FFA3'   // high volume
    else if (ratio >= 1) barColor = '#00D4FF'  // normal
    else if (ratio >= 0.5) barColor = '#FFB800' // low
    else barColor = '#FF4757'                    // very low
  }

  const avgPct = average ? Math.min((average / maxVal) * 100, 100) : 0

  return (
    <div style={{ position: 'relative', width: '100%', height, borderRadius: height / 2, background: '#151A22', overflow: 'hidden' }}>
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
          background: `${'#6B7280'}80`,
          zIndex: 1,
        }} />
      )}
    </div>
  )
}
