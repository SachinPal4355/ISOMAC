import { useEffect, useState, useRef, useMemo } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  getAssets, createAsset, updateAsset, deleteAsset,
  getDynamicFields, exportAssets, getAssetCategories,
} from '../services/api'
import Layout from '../components/Layout'
import SidebarSection from '../components/SidebarSection'
import DataTable from '../components/DataTable'
import Badge from '../components/Badge'
import Modal from '../components/Modal'
import StatCard from '../components/StatCard'
import DynamicInput from '../components/DynamicInput'
import AssetFieldConfig from './assets/AssetFieldConfig'
import { useAuth } from '../context/AuthContext'

const STATS = ['Available', 'Assigned', 'In Repair', 'Retired', 'Missing']

// All-view fallback columns when no category is selected
const ALL_VIEW_FIELDS = [
  { name: 'assetTag',      label: 'Asset Tag', type: 'text' },
  { name: 'name',          label: 'Name',      type: 'text' },
  { name: 'category',      label: 'Category',  type: 'text' },
  { name: 'brand',         label: 'Brand',     type: 'text' },
  { name: 'serialno',      label: 'Serial No', type: 'text' },
  { name: 'status',        label: 'Status',    type: 'select' },
  { name: 'location',      label: 'Location',  type: 'text' },
  { name: 'warrantyExpiry',label: 'Warranty',  type: 'date' },
]

function renderCell(field, row) {
  const value = resolveValue(field.name, row)
  if (field.name === 'status') return <Badge label={value} />
  if (field.name === 'assetTag') return <span className="font-mono text-xs font-semibold text-gray-800">{value || '—'}</span>
  if (field.name === 'serialno') return <span className="font-mono text-xs">{value || '—'}</span>
  if (field.name === 'warrantyExpiry' || field.type === 'date') {
    if (!value) return '—'
    if (field.name === 'warrantyExpiry') {
      const days = Math.ceil((new Date(value) - new Date()) / 86400000)
      return (
        <span className={`text-xs font-semibold ${days < 0 ? 'text-red-600' : days <= 90 ? 'text-yellow-600' : 'text-green-600'}`}>
          {days < 0 ? 'Expired' : `${days}d`}
        </span>
      )
    }
    return new Date(value).toLocaleDateString()
  }
  return value ?? '—'
}

function resolveValue(fieldName, row) {
  const root = row[fieldName]
  if (root !== undefined && root !== null && root !== '') return root
  const cf = row.customFields
  if (!cf) return undefined
  if (cf instanceof Map) return cf.get(fieldName)
  return cf[fieldName]
}

function getStorageKey(category, userId) {
  return `asset_col_prefs_${userId}_${category || 'All'}`
}

export default function Assets() {
  const { isEditor, isAdmin, user } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const urlCategory = new URLSearchParams(location.search).get('category')

  const [assets, setAssets]             = useState([])
  const [categories, setCategories]     = useState([])
  const [catFilter, setCatFilter]       = useState(urlCategory || 'All')
  const [statusFilter, setStatusFilter] = useState('All')
  const [search, setSearch]             = useState('')
  const [loading, setLoading]           = useState(true)
  const [loadError, setLoadError]       = useState('')
  const [exporting, setExporting]       = useState(false)

  // Schema fields for table columns (current filter category)
  const [catFields, setCatFields]       = useState([])
  // Schema fields for modal form (form's selected category — all fields incl. fixed)
  const [formFields, setFormFields]     = useState([])

  const [hiddenCols, setHiddenCols]     = useState({})
  const [colPickerOpen, setColPickerOpen] = useState(false)
  const colPickerRef = useRef(null)
  const [fieldConfigCat, setFieldConfigCat] = useState(null)

  const [modalOpen, setModalOpen]   = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [editId, setEditId]         = useState(null)
  // Unified form state — both fixed and custom fields stored flat
  const [formData, setFormData]     = useState({})

  // ── Load data ───────────────────────────────────────────────────────────────
  useEffect(() => { load() }, [])
  useEffect(() => {
    if (urlCategory && urlCategory !== catFilter) setCatFilter(urlCategory)
  }, [urlCategory])

  async function load() {
    setLoadError('')
    try {
      const [aRes, cRes] = await Promise.all([getAssets(), getAssetCategories()])
      // Handle both paginated { data: [...] } and legacy flat array responses
      const assetList = Array.isArray(aRes.data?.data) ? aRes.data.data : (Array.isArray(aRes.data) ? aRes.data : [])
      setAssets(assetList)
      const allCats = Array.isArray(cRes.data?.data) ? cRes.data.data : []
      setCategories(allCats.filter(c => !c.type || c.type === 'asset'))
    } catch (e) {
      setLoadError('Failed to load assets.')
      console.error(e)
    } finally { setLoading(false) }
  }

  // Reload table schema when category filter changes
  useEffect(() => {
    if (catFilter === 'All') {
      // All view: fetch all asset fields (no category filter), dedupe by name
      getDynamicFields('asset')
        .then(r => {
          const all = Array.isArray(r.data?.data) ? r.data.data : []
          // Deduplicate by field name, keep first occurrence (lowest order)
          const seen = new Set()
          const deduped = all
            .filter(f => f.visible && !f.isDeleted)
            .sort((a, b) => a.order - b.order)
            .filter(f => { if (seen.has(f.name)) return false; seen.add(f.name); return true })
          setCatFields(deduped)
        })
        .catch(() => setCatFields([]))
      return
    }
    getDynamicFields('asset', catFilter)
      .then(r => setCatFields(Array.isArray(r.data?.data) ? r.data.data : []))
      .catch(() => setCatFields([]))
  }, [catFilter])

  // Reload form schema when form category changes
  useEffect(() => {
    const cat = formData.category
    if (!cat) { setFormFields([]); return }
    getDynamicFields('asset', cat)
      .then(r => setFormFields(Array.isArray(r.data?.data) ? r.data.data : []))
      .catch(() => setFormFields([]))
  }, [formData.category])

  // Column visibility prefs
  useEffect(() => {
    const key = getStorageKey(catFilter, user?._id)
    try { setHiddenCols(JSON.parse(localStorage.getItem(key) || '{}')) }
    catch { setHiddenCols({}) }
  }, [catFilter, user?._id])

  useEffect(() => {
    function handler(e) { if (colPickerRef.current && !colPickerRef.current.contains(e.target)) setColPickerOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  function saveHiddenCols(next) {
    setHiddenCols(next)
    localStorage.setItem(getStorageKey(catFilter, user?._id), JSON.stringify(next))
  }

  // ── Build table columns ─────────────────────────────────────────────────────
  function buildColumns() {
    let schemaFields

    if (catFilter !== 'All' && catFields.length > 0) {
      // Category view: use schema fields for that category
      schemaFields = catFields
        .filter(f => f.visible && !f.isDeleted)
        .sort((a, b) => a.order - b.order)
    } else if (catFilter === 'All' && catFields.length > 0) {
      // All view: use deduped schema fields, but inject 'category' after 'name' if not present
      schemaFields = catFields // already filtered+deduped in the useEffect
      const hasCategory = schemaFields.some(f => f.name === 'category')
      if (!hasCategory) {
        const nameIdx = schemaFields.findIndex(f => f.name === 'name')
        const catField = { name: 'category', label: 'Category', type: 'text', order: -1, visible: true }
        schemaFields = nameIdx >= 0
          ? [...schemaFields.slice(0, nameIdx + 1), catField, ...schemaFields.slice(nameIdx + 1)]
          : [catField, ...schemaFields]
      }
    } else {
      // Fallback while loading
      schemaFields = ALL_VIEW_FIELDS
    }

    const schemaCols = schemaFields
      .filter(f => !hiddenCols[f.name])
      .map(f => ({
        key: f.name,
        label: f.label,
        render: (_, row) => renderCell(f, row),
      }))

    return [
      ...schemaCols,
      {
        key: '__actions', label: 'Actions', sortable: false,
        render: (_, row) => isEditor && (
          <div className="flex gap-1">
            <button onClick={() => openEdit(row)}
              style={{ fontSize: '11px', background: '#fef3c7', color: '#b45309', border: 'none',
                padding: '4px 10px', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}
              onMouseEnter={e => e.currentTarget.style.background = '#fde68a'}
              onMouseLeave={e => e.currentTarget.style.background = '#fef3c7'}>Edit</button>
            {isAdmin && <button onClick={() => handleDelete(row._id)}
              style={{ fontSize: '11px', background: '#fee2e2', color: '#b91c1c', border: 'none',
                padding: '4px 10px', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}
              onMouseEnter={e => e.currentTarget.style.background = '#fecaca'}
              onMouseLeave={e => e.currentTarget.style.background = '#fee2e2'}>Del</button>}
          </div>
        ),
      },
    ]
  }

  const columns = useMemo(() => buildColumns(), [catFields, catFilter, hiddenCols, isEditor, isAdmin])

  // Picker must use the FULL schema (before hiding), so hidden cols still appear in the list
  const allPickerCols = (() => {
    let schemaFields
    if (catFilter !== 'All' && catFields.length > 0) {
      schemaFields = catFields.filter(f => f.visible && !f.isDeleted).sort((a, b) => a.order - b.order)
    } else if (catFilter === 'All' && catFields.length > 0) {
      schemaFields = catFields
      const hasCategory = schemaFields.some(f => f.name === 'category')
      if (!hasCategory) {
        const nameIdx = schemaFields.findIndex(f => f.name === 'name')
        const catField = { name: 'category', label: 'Category', type: 'text' }
        schemaFields = nameIdx >= 0
          ? [...schemaFields.slice(0, nameIdx + 1), catField, ...schemaFields.slice(nameIdx + 1)]
          : [catField, ...schemaFields]
      }
    } else {
      schemaFields = ALL_VIEW_FIELDS
    }
    return schemaFields.map(f => ({ key: f.name, label: f.label }))
  })()

  // ── Form helpers ────────────────────────────────────────────────────────────
  // Visible form fields sorted by order, required fields first within each group
  const visibleFormFields = formFields
    .filter(f => f.visible && !f.isDeleted)
    .sort((a, b) => a.order - b.order)

  function setField(name, value) {
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  function openAdd() {
    setEditId(null)
    setFormData({ category: catFilter !== 'All' ? catFilter : '', status: 'Available' })
    setModalOpen(true)
  }

  function openEdit(a) {
    setEditId(a._id)
    // Flatten root fields + customFields into one object
    const cf = a.customFields && typeof a.customFields === 'object' ? a.customFields : {}
    const flat = {
      ...a,
      ...cf,
      purchaseDate:    a.purchaseDate    ? a.purchaseDate.split('T')[0]    : '',
      warrantyExpiry:  a.warrantyExpiry  ? a.warrantyExpiry.split('T')[0]  : '',
    }
    setFormData(flat)
    setModalOpen(true)
  }

  async function handleSubmit() {
    if (!formData.assetTag || !formData.name || !formData.category)
      return alert('Asset Tag, Name and Category are required')

    const ROOT_FIELDS = ['assetTag','name','category','brand','model','serialno',
      'purchaseDate','purchaseCost','warrantyExpiry','status','location','notes','quantity']
    const rootPayload = {}
    const customPayload = {}
    Object.entries(formData).forEach(([k, v]) => {
      if (ROOT_FIELDS.includes(k)) rootPayload[k] = v
      else if (!['_id','__v','type','createdAt','updatedAt','assignedTo','employeeRef',
                 'locationRef','source','customFields'].includes(k)) {
        customPayload[k] = v
      }
    })

    const requiredMissing = visibleFormFields.filter(f => !f.isFixed && f.required && !customPayload[f.name])
    if (requiredMissing.length) return alert(`Required: ${requiredMissing.map(f => f.label).join(', ')}`)

    setSubmitting(true)
    try {
      const payload = { ...rootPayload, type: 'asset', customFields: customPayload }
      if (editId) await updateAsset(editId, payload)
      else await createAsset(payload)
      setModalOpen(false); load()
    } catch (e) { alert('Error: ' + (e.response?.data?.message || e.message)) }
    finally { setSubmitting(false) }
  }

  async function handleDelete(id) {
    if (!window.confirm('Delete this asset?')) return
    try { await deleteAsset(id); load() }
    catch (e) { alert('Error: ' + (e.response?.data?.message || e.message)) }
  }

  async function handleExport(format) {
    setExporting(true)
    try {
      const params = { format }
      if (catFilter !== 'All') params.category = catFilter
      if (statusFilter !== 'All') params.status = statusFilter
      const res = await exportAssets(params)
      const url = URL.createObjectURL(new Blob([res.data]))
      const a = document.createElement('a'); a.href = url; a.download = `assets_export.${format}`; a.click()
      URL.revokeObjectURL(url)
    } catch (e) { console.error(e) }
    finally { setExporting(false) }
  }

  // ── Sidebar / filter ────────────────────────────────────────────────────────
  const catNames = categories.map(c => c.name)
  const catCounts = {}
  catNames.forEach(c => { catCounts[c] = assets.filter(a => a.category === c).length })
  const statusCounts = {}
  ;['All', ...STATS].forEach(s => { statusCounts[s] = s === 'All' ? assets.length : assets.filter(a => a.status === s).length })

  const filtered = useMemo(() => assets.filter(a => {
    const matchCat    = catFilter === 'All' || a.category === catFilter
    const matchStatus = statusFilter === 'All' || a.status === statusFilter
    const matchSearch = !search || [a.assetTag, a.name, a.serialno, a.brand, a.model, a.location]
      .some(v => (v || '').toLowerCase().includes(search.toLowerCase()))
    return matchCat && matchStatus && matchSearch
  }), [assets, catFilter, statusFilter, search])

  const sidebar = (
    <div>
      <SidebarSection title="Categories"
        items={[{ label: 'All', value: 'All', count: assets.length }, ...catNames.map(c => ({ label: c, value: c, count: catCounts[c] || 0 }))]}
        selected={catFilter}
        onSelect={v => { setCatFilter(v); setStatusFilter('All') }}
        renderExtra={isEditor ? (item) => item.value !== 'All' ? (
          <button onClick={e => { e.stopPropagation(); setFieldConfigCat(item.value) }}
            className="ml-auto text-[10px] text-gray-400 hover:text-green-600 px-1" title="Configure fields">⚙</button>
        ) : null : undefined}
      />
      <SidebarSection title="Status"
        items={['All', ...STATS].map(s => ({ label: s, value: s, count: statusCounts[s] }))}
        selected={statusFilter} onSelect={setStatusFilter} />
    </div>
  )

  // ── Render ──────────────────────────────────────────────────────────────────
  const btn = { border: 'none', borderRadius: '4px', padding: '6px 12px', fontSize: '13px', fontWeight: 500, cursor: 'pointer' }
  const inputSt = { border: '1px solid #d1d5db', borderRadius: '4px', padding: '6px 10px', fontSize: '13px', outline: 'none', background: '#fff' }
  const focusIn  = e => { e.target.style.borderColor = '#2563eb'; e.target.style.boxShadow = '0 0 0 2px rgba(37,99,235,0.1)' }
  const focusOut = e => { e.target.style.borderColor = '#d1d5db'; e.target.style.boxShadow = 'none' }

  return (
    <Layout sidebar={sidebar}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
          <div>
            <h1 style={{ fontSize: '18px', fontWeight: 600, color: '#111827', margin: 0 }}>Assets</h1>
            <p style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>
              {filtered.length} of {assets.length} records{catFilter !== 'All' ? ` — ${catFilter}` : ''}
            </p>
          </div>
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
            <input placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)}
              style={{ ...inputSt, width: '190px' }} onFocus={focusIn} onBlur={focusOut} />

            <div style={{ position: 'relative' }} ref={colPickerRef}>
              <button onClick={() => setColPickerOpen(v => !v)}
                style={{ ...btn, background: '#fff', border: '1px solid #d1d5db', color: '#374151' }}
                onMouseEnter={e => e.currentTarget.style.background = '#f9fafb'}
                onMouseLeave={e => e.currentTarget.style.background = '#fff'}>
                Columns
              </button>
              {colPickerOpen && (
                <div className="dropdown-panel" style={{ position: 'absolute', right: 0, top: '34px', zIndex: 30,
                  background: '#fff', border: '1px solid #e5e7eb', borderRadius: '4px',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.08)', padding: '10px', width: '190px',
                  display: 'flex', flexDirection: 'column', gap: '3px' }}>
                  <p style={{ fontSize: '10px', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase',
                    letterSpacing: '0.05em', margin: '0 0 6px' }}>Show / Hide</p>
                  {allPickerCols.map(c => (
                    <label key={c.key} style={{ display: 'flex', alignItems: 'center', gap: '7px',
                      fontSize: '13px', color: '#374151', cursor: 'pointer', padding: '2px 0' }}>
                      <input type="checkbox" checked={!hiddenCols[c.key]}
                        onChange={e => saveHiddenCols({ ...hiddenCols, [c.key]: !e.target.checked })}
                        style={{ accentColor: '#2563eb' }} />
                      {c.label}
                    </label>
                  ))}
                  {allPickerCols.length === 0 && <p style={{ fontSize: '12px', color: '#9ca3af' }}>No columns</p>}
                </div>
              )}
            </div>

            <button onClick={() => handleExport('csv')} disabled={exporting}
              style={{ ...btn, background: '#fff', border: '1px solid #d1d5db', color: '#374151' }}
              onMouseEnter={e => e.currentTarget.style.background = '#f9fafb'}
              onMouseLeave={e => e.currentTarget.style.background = '#fff'}>
              Export CSV
            </button>
            <button onClick={() => handleExport('xlsx')} disabled={exporting}
              style={{ ...btn, background: '#fff', border: '1px solid #d1d5db', color: '#374151' }}
              onMouseEnter={e => e.currentTarget.style.background = '#f9fafb'}
              onMouseLeave={e => e.currentTarget.style.background = '#fff'}>
              Export XLSX
            </button>
            {isEditor && (
              <button onClick={openAdd}
                style={{ ...btn, background: '#2563eb', color: '#fff', fontWeight: 600 }}
                onMouseEnter={e => e.currentTarget.style.background = '#1d4ed8'}
                onMouseLeave={e => e.currentTarget.style.background = '#2563eb'}>
                + Add Asset
              </button>
            )}
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {STATS.map((s, i) => {
            const colors = ['green', 'blue', 'yellow', 'gray', 'red']
            return <StatCard key={s} label={s} value={assets.filter(a => a.status === s).length} color={colors[i]} />
          })}
        </div>

        {loadError && !loading && (
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '4px', padding: '10px 14px',
            display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '13px', color: '#b91c1c' }}>⚠ {loadError}</span>
            <button onClick={load} style={{ ...btn, marginLeft: 'auto', background: '#dc2626', color: '#fff' }}>Retry</button>
          </div>
        )}

        {!loading && !loadError && assets.length === 0 ? (
          <div className="empty-state" style={{ textAlign: 'center', padding: '48px 20px', background: '#fff',
            border: '1px solid #e5e7eb', borderRadius: '6px' }}>
            <p style={{ fontWeight: 600, fontSize: '14px', color: '#111827', marginBottom: '4px' }}>No assets found</p>
            <p style={{ fontSize: '13px', color: '#6b7280', marginBottom: '16px' }}>Import your asset data or add one manually.</p>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
              <button onClick={() => navigate('/settings?tab=import-export')}
                style={{ ...btn, background: '#2563eb', color: '#fff', fontWeight: 600 }}>Import Data</button>
              {isEditor && (
                <button onClick={openAdd}
                  style={{ ...btn, background: '#fff', border: '1px solid #d1d5db', color: '#374151' }}>+ Add Asset</button>
              )}
            </div>
          </div>
        ) : (
          <DataTable columns={columns} rows={filtered} loading={loading} emptyText="No assets match your filters" />
        )}
      </div>

      {/* Add/Edit Modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editId ? 'Edit Asset' : 'Add Asset'} width="max-w-2xl">
        <div style={{ marginBottom: '12px' }}>
          <label style={{ fontSize: '12px', fontWeight: 600, color: '#374151', display: 'block', marginBottom: '4px' }}>Category *</label>
          <select value={formData.category || ''} onChange={e => setField('category', e.target.value)}
            style={{ width: '100%', border: '1px solid #d1d5db', borderRadius: '4px', padding: '7px 10px',
              fontSize: '13px', outline: 'none', background: '#fff' }}
            onFocus={focusIn} onBlur={focusOut}>
            <option value="">Select category</option>
            {catNames.map(c => <option key={c}>{c}</option>)}
          </select>
        </div>

        {!formData.category ? (
          <p style={{ textAlign: 'center', padding: '20px', color: '#9ca3af', fontSize: '13px' }}>Select a category to load fields</p>
        ) : visibleFormFields.length === 0 ? (
          <p style={{ textAlign: 'center', padding: '20px', color: '#9ca3af', fontSize: '13px' }}>Loading fields…</p>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {visibleFormFields.map(f => (
              <div key={f.name} className={f.name === 'notes' ? 'col-span-2' : ''}>
                <label style={{ fontSize: '12px', fontWeight: 600, color: '#374151', display: 'block', marginBottom: '4px' }}>
                  {f.label}{f.required ? ' *' : ''}
                </label>
                <DynamicInput field={f} value={formData[f.name] ?? ''} onChange={setField} />
              </div>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px',
          paddingTop: '12px', borderTop: '1px solid #e5e7eb' }}>
          <button onClick={() => setModalOpen(false)}
            style={{ ...btn, background: '#fff', border: '1px solid #d1d5db', color: '#374151' }}
            onMouseEnter={e => e.currentTarget.style.background = '#f9fafb'}
            onMouseLeave={e => e.currentTarget.style.background = '#fff'}>
            Cancel
          </button>
          <button onClick={handleSubmit} disabled={submitting}
            style={{ ...btn, background: '#2563eb', color: '#fff', fontWeight: 600,
              display: 'inline-flex', alignItems: 'center', gap: '6px', opacity: submitting ? 0.8 : 1 }}
            onMouseEnter={e => { if (!submitting) e.currentTarget.style.background = '#1d4ed8' }}
            onMouseLeave={e => e.currentTarget.style.background = '#2563eb'}>
            {submitting && <span className="spinner" />}
            {editId ? 'Update Asset' : 'Create Asset'}
          </button>
        </div>
      </Modal>

      {fieldConfigCat && (
        <AssetFieldConfig
          category={fieldConfigCat}
          onClose={() => {
            setFieldConfigCat(null)
            if (catFilter === fieldConfigCat) {
              getDynamicFields('asset', catFilter)
                .then(r => setCatFields(Array.isArray(r.data?.data) ? r.data.data : []))
                .catch(() => {})
            }
          }}
        />
      )}
    </Layout>
  )
}
