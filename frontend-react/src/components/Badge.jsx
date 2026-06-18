const PRESETS = {
  Available:    { bg: '#dcfce7', color: '#15803d' },
  Assigned:     { bg: '#dbeafe', color: '#1d4ed8' },
  'In Repair':  { bg: '#fef3c7', color: '#92400e' },
  Retired:      { bg: '#f3f4f6', color: '#6b7280' },
  Missing:      { bg: '#fee2e2', color: '#b91c1c' },
  Active:       { bg: '#dcfce7', color: '#15803d' },
  Returned:     { bg: '#f3f4f6', color: '#6b7280' },
  Scheduled:    { bg: '#fef3c7', color: '#92400e' },
  'In Progress':{ bg: '#dbeafe', color: '#1d4ed8' },
  Completed:    { bg: '#dcfce7', color: '#15803d' },
  Expired:      { bg: '#fee2e2', color: '#b91c1c' },
  Cancelled:    { bg: '#f3f4f6', color: '#6b7280' },
  Inactive:     { bg: '#f3f4f6', color: '#6b7280' },
}

export default function Badge({ label, className = '' }) {
  const p = PRESETS[label] || { bg: '#f3f4f6', color: '#6b7280' }
  return (
    <span className={`badge ${className}`} style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: '3px',
      background: p.bg, color: p.color,
      fontSize: '11px', fontWeight: 600, whiteSpace: 'nowrap',
    }}>
      {label}
    </span>
  )
}
