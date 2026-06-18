import { useState, useMemo, useCallback } from 'react'

const ROW_HEIGHT = 41 // px per row
const OVERSCAN   = 5  // extra rows above/below viewport

function SkeletonRows({ cols, count = 6 }) {
  return Array.from({ length: count }).map((_, i) => (
    <tr key={i} style={{ borderBottom: '1px solid #e5e7eb' }}>
      {Array.from({ length: cols }).map((_, j) => (
        <td key={j} style={{ padding: '10px 12px' }}>
          <div className="skeleton" style={{ height: '12px', width: j === 0 ? '60%' : '80%' }} />
        </td>
      ))}
    </tr>
  ))
}

/**
 * DataTable — memoized sort + optional virtual windowing for 200+ rows.
 * Props:
 *   columns  – array of { key, label, sortable?, render? }
 *   rows     – array of data objects
 *   loading  – show skeleton
 *   emptyText
 *   maxHeight – px; when set, enables virtual scrolling (default 480)
 *   virtual  – explicitly enable/disable virtual scrolling (auto when rows > 150)
 */
export default function DataTable({
  columns,
  rows,
  emptyText = 'No data found',
  loading = false,
  maxHeight = 480,
  virtual,
}) {
  const [sortKey, setSortKey] = useState(null)
  const [sortDir, setSortDir] = useState('asc')
  const [scrollTop, setScrollTop] = useState(0)

  const handleSort = useCallback((key) => {
    setSortKey(prev => {
      if (prev === key) { setSortDir(d => d === 'asc' ? 'desc' : 'asc'); return key }
      setSortDir('asc'); return key
    })
  }, [])

  // Memoized sort — O(n log n) only when sort key/dir or rows change
  const sorted = useMemo(() => {
    if (!sortKey) return rows
    return [...rows].sort((a, b) => {
      const av = a[sortKey], bv = b[sortKey]
      if (av == null) return sortDir === 'asc' ? 1 : -1
      if (bv == null) return sortDir === 'asc' ? -1 : 1
      if (typeof av === 'object' || typeof bv === 'object') return 0
      const cmp = String(av).localeCompare(String(bv), undefined, { numeric: true })
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [rows, sortKey, sortDir])

  // Virtual scrolling: only render visible rows
  const useVirtual = virtual !== undefined ? virtual : sorted.length > 150
  const totalHeight = sorted.length * ROW_HEIGHT

  const { startIdx, endIdx } = useMemo(() => {
    if (!useVirtual) return { startIdx: 0, endIdx: sorted.length }
    const visibleRows = Math.ceil(maxHeight / ROW_HEIGHT)
    const start = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN)
    const end   = Math.min(sorted.length, start + visibleRows + OVERSCAN * 2)
    return { startIdx: start, endIdx: end }
  }, [useVirtual, scrollTop, sorted.length, maxHeight])

  const visibleRows = useVirtual ? sorted.slice(startIdx, endIdx) : sorted
  const paddingTop  = useVirtual ? startIdx * ROW_HEIGHT : 0
  const paddingBot  = useVirtual ? (sorted.length - endIdx) * ROW_HEIGHT : 0

  const thStyle = {
    padding: '9px 12px', textAlign: 'left', fontSize: '11px', fontWeight: 700,
    color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em',
    whiteSpace: 'nowrap', userSelect: 'none', background: '#f3f4f6',
    borderRight: '1px solid #e5e7eb', transition: 'color 0.15s ease',
  }

  return (
    <div
      className="data-table"
      style={{
        overflowX: 'auto',
        overflowY: useVirtual ? 'auto' : 'visible',
        maxHeight: useVirtual ? maxHeight : undefined,
        background: '#fff',
        border: '1px solid #e5e7eb',
        borderRadius: '6px',
      }}
      onScroll={useVirtual ? e => setScrollTop(e.currentTarget.scrollTop) : undefined}
    >
      <table style={{ width: '100%', fontSize: '13px', borderCollapse: 'collapse' }}>
        <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
          <tr style={{ background: '#f3f4f6', borderBottom: '1px solid #e5e7eb' }}>
            {columns.map(col => (
              <th
                key={col.key}
                onClick={() => col.sortable !== false && handleSort(col.key)}
                style={{ ...thStyle, cursor: col.sortable !== false ? 'pointer' : 'default' }}
                onMouseEnter={e => { if (col.sortable !== false) e.currentTarget.style.color = '#111827' }}
                onMouseLeave={e => { e.currentTarget.style.color = '#6b7280' }}
              >
                {col.label}
                {sortKey === col.key && (
                  <span style={{ marginLeft: '4px', color: '#2563eb' }}>{sortDir === 'asc' ? '↑' : '↓'}</span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading && <SkeletonRows cols={columns.length} />}

          {/* Virtual top spacer */}
          {!loading && useVirtual && paddingTop > 0 && (
            <tr><td colSpan={columns.length} style={{ height: paddingTop, padding: 0 }} /></tr>
          )}

          {!loading && visibleRows.map((row, i) => {
            const absIdx = startIdx + i
            return (
              <tr
                key={row._id || absIdx}
                style={{
                  borderBottom: '1px solid #e5e7eb',
                  background: absIdx % 2 === 0 ? '#ffffff' : '#fafafa',
                  height: ROW_HEIGHT,
                }}
                onMouseEnter={e => { e.currentTarget.style.background = '#f3f4f6' }}
                onMouseLeave={e => { e.currentTarget.style.background = absIdx % 2 === 0 ? '#ffffff' : '#fafafa' }}
              >
                {columns.map(col => (
                  <td key={col.key} style={{ padding: '9px 12px', color: '#111827', verticalAlign: 'middle', borderRight: '1px solid #f3f4f6' }}>
                    {col.render ? col.render(row[col.key], row) : (row[col.key] != null ? String(row[col.key]) : '—')}
                  </td>
                ))}
              </tr>
            )
          })}

          {/* Virtual bottom spacer */}
          {!loading && useVirtual && paddingBot > 0 && (
            <tr><td colSpan={columns.length} style={{ height: paddingBot, padding: 0 }} /></tr>
          )}

          {!loading && !sorted.length && (
            <tr>
              <td colSpan={columns.length}>
                <div className="empty-state" style={{ padding: '40px', textAlign: 'center', color: '#9ca3af', fontSize: '13px' }}>
                  {emptyText}
                </div>
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
