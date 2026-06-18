const COLORS = {
  green:  { border: '#d1fae5', value: '#15803d', bg: '#f0fdf4' },
  blue:   { border: '#bfdbfe', value: '#1d4ed8', bg: '#eff6ff' },
  yellow: { border: '#fde68a', value: '#92400e', bg: '#fffbeb' },
  red:    { border: '#fecaca', value: '#b91c1c', bg: '#fef2f2' },
  gray:   { border: '#e5e7eb', value: '#374151', bg: '#f9fafb' },
  purple: { border: '#e9d5ff', value: '#5b21b6', bg: '#faf5ff' },
}

// SVG icons for StatCard
const ICONS = {
  assets: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
    </svg>
  ),
  accessories: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
    </svg>
  ),
  loans: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
    </svg>
  ),
  maintenance: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  ),
}

export default function StatCard({ label, value, color = 'gray', icon }) {
  const c = COLORS[color] || COLORS.gray
  const svgIcon = icon && ICONS[icon]
  return (
    <div style={{
      background: '#ffffff', border: `1px solid ${c.border}`,
      borderRadius: '8px', padding: '14px 16px',
      display: 'flex', flexDirection: 'column', gap: '6px',
      boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase',
          letterSpacing: '0.05em', color: '#6b7280' }}>
          {label}
        </span>
        {svgIcon && (
          <span style={{ color: c.value, opacity: 0.5 }}>{svgIcon}</span>
        )}
      </div>
      <span style={{ fontSize: '26px', fontWeight: 700, color: c.value, lineHeight: 1 }}>
        {value ?? '—'}
      </span>
    </div>
  )
}
