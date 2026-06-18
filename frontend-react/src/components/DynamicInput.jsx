/**
 * DynamicInput — renders a form field based on DynamicField schema.
 * Supports: text, number, date, select, textarea
 */
const inputStyle = {
  width: '100%', border: '1px solid #d1d5db', borderRadius: '8px',
  padding: '8px 12px', fontSize: '13px', color: '#1f2937',
  background: '#fff', outline: 'none', transition: 'border-color 0.15s, box-shadow 0.15s',
  boxSizing: 'border-box',
}

function Input({ type = 'text', value, onChange, placeholder, rows }) {
  if (type === 'textarea') {
    return (
      <textarea value={value ?? ''} onChange={onChange} placeholder={placeholder} rows={rows || 2}
        style={inputStyle}
        onFocus={e => { e.target.style.borderColor = '#16a34a'; e.target.style.boxShadow = '0 0 0 3px rgba(22,163,74,0.12)' }}
        onBlur={e => { e.target.style.borderColor = '#d1d5db'; e.target.style.boxShadow = 'none' }} />
    )
  }
  return (
    <input type={type} value={value ?? ''} onChange={onChange} placeholder={placeholder}
      style={inputStyle}
      onFocus={e => { e.target.style.borderColor = '#16a34a'; e.target.style.boxShadow = '0 0 0 3px rgba(22,163,74,0.12)' }}
      onBlur={e => { e.target.style.borderColor = '#d1d5db'; e.target.style.boxShadow = 'none' }} />
  )
}

export default function DynamicInput({ field, value, onChange }) {
  const handleChange = (e) => onChange(field.name, e.target.value)

  if (field.type === 'select') {
    return (
      <select value={value ?? ''} onChange={handleChange} style={inputStyle}
        onFocus={e => { e.target.style.borderColor = '#16a34a'; e.target.style.boxShadow = '0 0 0 3px rgba(22,163,74,0.12)' }}
        onBlur={e => { e.target.style.borderColor = '#d1d5db'; e.target.style.boxShadow = 'none' }}>
        <option value="">Select…</option>
        {(field.options || []).map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    )
  }

  if (field.type === 'textarea') return <Input type="textarea" value={value} onChange={handleChange} placeholder={field.label} />
  if (field.type === 'date')     return <Input type="date"     value={value} onChange={handleChange} />
  if (field.type === 'number')   return <Input type="number"   value={value} onChange={handleChange} placeholder={field.label} />
  return <Input type="text" value={value} onChange={handleChange} placeholder={field.label} />
}
