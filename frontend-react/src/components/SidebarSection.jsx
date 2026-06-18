export default function SidebarSection({ title, items = [], onSelect, selected, renderExtra }) {
  return (
    <div style={{ padding: '10px 8px', borderBottom: '1px solid #e5e7eb' }}>
      <p style={{ fontSize: '10px', fontWeight: 700, color: '#9ca3af',
        textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0 0 6px 4px' }}>
        {title}
      </p>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {items.map(item => {
          const isActive = selected === item.value
          return (
            <li key={item.value}>
              <button onClick={() => onSelect(item.value)} className="sidebar-item"
                style={{
                  width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center',
                  justifyContent: 'space-between', padding: '5px 8px', borderRadius: '3px',
                  fontSize: '13px', fontWeight: isActive ? 600 : 400, border: 'none', cursor: 'pointer',
                  background: isActive ? '#eff6ff' : 'transparent',
                  color: isActive ? '#1d4ed8' : '#374151',
                  borderLeft: isActive ? '2px solid #2563eb' : '2px solid transparent',
                  marginBottom: '1px',
                }}
                onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = '#f9fafb' }}
                onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent' }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {item.label}
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
                  {item.count !== undefined && (
                    <span style={{ fontSize: '11px', color: isActive ? '#2563eb' : '#9ca3af', fontWeight: 500 }}>
                      {item.count}
                    </span>
                  )}
                  {renderExtra && renderExtra(item)}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
