'use client'

export default function IOSSwitch({ value, onChange, color }: { value: boolean; onChange: (v: boolean) => void; color?: string }) {
  const bg = value ? (color || '#00D4FF') : 'rgba(255,255,255,0.1)'
  return (
    <button className="m-switch" style={{ background: bg }} onClick={() => onChange(!value)}>
      <div className="m-switch__thumb" style={{ insetInlineStart: value ? 20 : 2 }} />
    </button>
  )
}
