'use client'

export default function IOSCard({ children, onClick, highlight = false, noMargin = false }: { children: React.ReactNode; onClick?: () => void; highlight?: boolean; noMargin?: boolean }) {
  return (
    <div className={`m-card ${highlight ? 'm-card--hl' : ''}`} onClick={onClick} style={{ cursor: onClick ? 'pointer' : 'default', margin: noMargin ? 0 : undefined }}>
      {children}
    </div>
  )
}
