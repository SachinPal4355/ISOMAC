export default function Modal({ open, onClose, title, children, width = 'max-w-lg' }) {
  if (!open) return null
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="modal-backdrop"
        style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)' }}
        onClick={onClose} />
      <div className={`modal-panel relative bg-white w-full ${width} mx-4`}
        style={{ borderRadius: '6px', border: '1px solid #e5e7eb',
          boxShadow: '0 8px 24px rgba(0,0,0,0.12)', maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 16px', borderBottom: '1px solid #e5e7eb', background: '#f9fafb' }}>
          <h3 style={{ fontWeight: 600, color: '#111827', fontSize: '14px', margin: 0 }}>{title}</h3>
          <button onClick={onClose}
            style={{ background: 'none', border: '1px solid #e5e7eb', borderRadius: '3px',
              width: '24px', height: '24px', cursor: 'pointer', fontSize: '14px', color: '#6b7280',
              display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}
            onMouseEnter={e => e.currentTarget.style.background = '#f3f4f6'}
            onMouseLeave={e => e.currentTarget.style.background = 'none'}>
            ×
          </button>
        </div>
        <div style={{ padding: '16px' }}>{children}</div>
      </div>
    </div>
  )
}
