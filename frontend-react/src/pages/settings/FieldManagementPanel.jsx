import { useEffect, useState } from 'react'
import { getDynamicFields, createDynamicField, updateDynamicField, deleteDynamicField, getFieldUsage, getAssetCategories } from '../../services/api'
import Modal from '../../components/Modal'
const FIELD_TYPES = ['text','number','date','select']
const GROUPS = ['','Basic Info','Technical Specs','Assignment Info','Financial Info','Other']
const EDITABLE_BY = [
  { value: 'all',      label: 'Everyone' },
  { value: 'it_staff', label: 'IT Staff & Admin' },
  { value: 'admin',    label: 'Admin Only' },
]

const inp = 'w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

const EMPTY_FORM = { label: '', name: '', type: 'text', required: false, visible: true, group: '', editableBy: 'all', options: '' }

function TypeBadge({ type }) {
  const colors = { text: 'bg-blue-50 text-blue-700', number: 'bg-purple-50 text-purple-700', date: 'bg-orange-50 text-orange-700', select: 'bg-teal-50 text-teal-700' }
  return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${colors[type] || 'bg-gray-100 text-gray-600'}`}>{type}</span>
}

function EditableByBadge({ val }) {
  if (val === 'admin') return <span className="text-xs px-2 py-0.5 rounded-full bg-red-50 text-red-700 font-medium">Admin only</span>
  if (val === 'it_staff') return <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-50 text-yellow-700 font-medium">IT Staff+</span>
  return null
}

// ─── Add / Edit Field Modal ───────────────────────────────────────────────────
function FieldFormModal({ open, onClose, onSaved, entityType, category, existingField, existingNames }) {
  const isEdit = !!existingField
  const [form, setForm] = useState(EMPTY_FORM)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [typeWarning, setTypeWarning] = useState('')

  useEffect(() => {
    if (open) {
      if (isEdit) {
        setForm({
          label: existingField.label,
          name: existingField.name,
          type: existingField.type,
          required: existingField.required,
          visible: existingField.visible,
          group: existingField.group || '',
          editableBy: existingField.editableBy || 'all',
          options: (existingField.options || []).join(', '),
        })
      } else {
        setForm(EMPTY_FORM)
      }
      setError('')
      setTypeWarning('')
    }
  }, [open, existingField])

  // Warn when type changes on an existing field
  async function handleTypeChange(newType) {
    setForm(f => ({ ...f, type: newType }))
    if (!isEdit || newType === existingField.type) { setTypeWarning(''); return }
    try {
      const res = await getFieldUsage(existingField._id)
      const count = res.data?.count || 0
      if (count > 0) {
        setTypeWarning(`⚠️ ${count} record(s) have data in this field. Changing the type may cause display issues for existing values.`)
      } else {
        setTypeWarning('')
      }
    } catch { setTypeWarning('') }
  }

  async function handleSave(e) {
    e.preventDefault()
    setError('')
    if (!form.label.trim()) return setError('Label is required')
    if (!form.name.trim())  return setError('Field key is required')
    if (!isEdit && existingNames.includes(form.name)) return setError(`Key "${form.name}" already exists`)
    setSaving(true)
    try {
      const payload = {
        label: form.label.trim(),
        name: form.name.trim(),
        type: form.type,
        required: form.required,
        visible: form.visible,
        group: form.group,
        editableBy: form.editableBy,
        options: form.type === 'select' ? form.options.split(',').map(s => s.trim()).filter(Boolean) : [],
        // If there's a type warning the user has seen it and clicked Save — pass forceTypeChange
        ...(isEdit && form.type !== existingField.type && typeWarning ? { forceTypeChange: true } : {}),
      }
      if (isEdit) {
        await updateDynamicField(existingField._id, payload)
      } else {
        await createDynamicField({ ...payload, entityType, category: category || '', order: 9999 })
      }
      onSaved()
    } catch (e) {
      // Backend type-change block (shouldn't normally hit since we pass forceTypeChange)
      if (e.response?.data?.code === 'TYPE_CHANGE_BLOCKED') {
        setError(`Type change blocked: ${e.response.data.usageCount} record(s) have existing data. Save again to force.`)
        setTypeWarning(`⚠️ ${e.response.data.usageCount} record(s) will have mismatched data after this type change.`)
      } else {
        setError(e.response?.data?.message || e.message)
      }
    } finally { setSaving(false) }
  }

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? `Edit Field — ${existingField?.label}` : 'Add Custom Field'} width="max-w-lg">
      <form onSubmit={handleSave} className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Display Label *</label>
            <input value={form.label} onChange={e => setForm({ ...form, label: e.target.value, name: isEdit ? form.name : e.target.value.replace(/\s+/g,'_').toLowerCase() })} placeholder="e.g. RAM Size" className={inp} required />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Field Key * {isEdit && existingField?.isFixed && <span className="text-gray-400">(locked)</span>}</label>
            <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value.replace(/[^a-z0-9_]/g,'') })}
              placeholder="e.g. ram_size" className={inp} required disabled={isEdit && existingField?.isFixed} />
            <p className="text-[10px] text-gray-400 mt-0.5">Lowercase letters, numbers, underscores only</p>
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Type</label>
            <select value={form.type} onChange={e => handleTypeChange(e.target.value)} className={inp}>
              {FIELD_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Group</label>
            <select value={form.group} onChange={e => setForm({ ...form, group: e.target.value })} className={inp}>
              {GROUPS.map(g => <option key={g} value={g}>{g || '— No group —'}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Editable By</label>
            <select value={form.editableBy} onChange={e => setForm({ ...form, editableBy: e.target.value })} className={inp}>
              {EDITABLE_BY.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-2 pt-1">
            <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
              <input type="checkbox" checked={form.required} onChange={e => setForm({ ...form, required: e.target.checked })} className="w-4 h-4 accent-blue-600" />
              Required field
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
              <input type="checkbox" checked={form.visible} onChange={e => setForm({ ...form, visible: e.target.checked })} className="w-4 h-4 accent-blue-600" />
              Visible in table
            </label>
          </div>
        </div>
        {form.type === 'select' && (
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Options (comma-separated)</label>
            <input value={form.options} onChange={e => setForm({ ...form, options: e.target.value })} placeholder="Option A, Option B, Option C" className={inp} />
          </div>
        )}
        {typeWarning && <p className="text-sm text-yellow-700 bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-2">{typeWarning}</p>}
        {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm rounded border border-gray-300 hover:bg-gray-50">Cancel</button>
          <button type="submit" disabled={saving} className="px-5 py-2 text-sm rounded bg-blue-600 text-white hover:bg-blue-700 font-semibold disabled:opacity-50">
            {saving ? 'Saving...' : isEdit ? 'Save Changes' : 'Add Field'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

// ─── Fields Table ─────────────────────────────────────────────────────────────
function FieldsTable({ fields, loading, onEdit, onDelete, onToggleVisible, onMove }) {
  const sorted = [...fields].sort((a, b) => a.order - b.order)
  if (loading) return <div className="py-10 text-center text-sm text-gray-400">Loading fields...</div>
  if (!sorted.length) return (
    <div className="py-12 text-center bg-gray-50 rounded-xl border border-dashed border-gray-200">
      <p className="text-2xl mb-2">🗂️</p>
      <p className="text-sm text-gray-500">No fields yet</p>
      <p className="text-xs text-gray-400 mt-1">Add a custom field to get started</p>
    </div>
  )

  // Group fields
  const groups = {}
  sorted.forEach(f => {
    const g = f.group || ''
    if (!groups[g]) groups[g] = []
    groups[g].push(f)
  })

  return (
    <div className="flex flex-col gap-4">
      {Object.entries(groups).map(([group, groupFields]) => (
        <div key={group}>
          {group && (
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{group}</span>
              <div className="flex-1 h-px bg-gray-100" />
            </div>
          )}
          <div className="rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  {['Label','Key','Type','Required','Visible','Editable By','Order',''].map(h => (
                    <th key={h} className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-3 py-2 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {groupFields.map((field, idx) => (
                  <tr key={field._id} className="border-t border-gray-100 hover:bg-gray-50 transition-colors">
                    <td className="px-3 py-2.5 font-medium text-gray-800">
                      {field.isFixed && <span className="mr-1.5 text-xs text-gray-400" title="System field — cannot be deleted">🔒</span>}
                      {field.label}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-xs text-gray-500 bg-gray-50">{field.name}</td>
                    <td className="px-3 py-2.5"><TypeBadge type={field.type} /></td>
                    <td className="px-3 py-2.5">
                      {field.required
                        ? <span className="text-xs font-semibold text-red-600">Required</span>
                        : <span className="text-xs text-gray-400">Optional</span>}
                    </td>
                    <td className="px-3 py-2.5">
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" checked={field.visible} onChange={() => onToggleVisible(field)} className="sr-only peer" />
                        <div className="w-9 h-5 bg-gray-200 rounded-full peer peer-checked:bg-blue-500 after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-4" />
                      </label>
                    </td>
                    <td className="px-3 py-2.5"><EditableByBadge val={field.editableBy} /></td>
                    <td className="px-3 py-2.5">
                      <div className="flex gap-1">
                        <button onClick={() => onMove(field, 'up')} disabled={idx === 0}
                          className="text-xs px-1.5 py-0.5 border border-gray-200 rounded hover:bg-gray-100 disabled:opacity-30 transition-colors">↑</button>
                        <button onClick={() => onMove(field, 'down')} disabled={idx === groupFields.length - 1}
                          className="text-xs px-1.5 py-0.5 border border-gray-200 rounded hover:bg-gray-100 disabled:opacity-30 transition-colors">↓</button>
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex gap-1">
                        <button onClick={() => onEdit(field)}
                          className="text-xs px-2 py-1 text-blue-600 hover:bg-blue-50 rounded font-medium transition-colors">Edit</button>
                        {!field.isFixed && (
                          <button onClick={() => onDelete(field)}
                            className="text-xs px-2 py-1 text-red-500 hover:bg-red-50 rounded font-medium transition-colors">Del</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Asset Fields Tab ─────────────────────────────────────────────────────────
function AssetFieldsTab() {
  const [assetCats, setAssetCats] = useState([])
  const [category, setCategory] = useState('')
  const [fields, setFields] = useState([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editField, setEditField] = useState(null)

  useEffect(() => {
    getAssetCategories()
      .then(r => {
        const cats = Array.isArray(r.data?.data) ? r.data.data : []
        setAssetCats(cats)
        if (cats.length > 0 && !category) setCategory(cats[0].name)
      })
      .catch(() => {})
  }, [])

  async function load() {
    if (!category) return
    setLoading(true)
    try {
      const res = await getDynamicFields('asset', category)
      setFields(Array.isArray(res.data?.data) ? res.data.data : [])
    } catch { setFields([]) }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [category])

  async function handleToggleVisible(field) {
    try {
      await updateDynamicField(field._id, { visible: !field.visible })
      setFields(prev => prev.map(f => f._id === field._id ? { ...f, visible: !f.visible } : f))
    } catch (e) { console.error(e) }
  }

  async function handleMove(field, direction) {
    const sorted = [...fields].sort((a, b) => a.order - b.order)
    const idx = sorted.findIndex(f => f._id === field._id)
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= sorted.length) return
    const swap = sorted[swapIdx]
    try {
      await Promise.all([updateDynamicField(field._id, { order: swap.order }), updateDynamicField(swap._id, { order: field.order })])
      setFields(prev => prev.map(f => {
        if (f._id === field._id) return { ...f, order: swap.order }
        if (f._id === swap._id) return { ...f, order: field.order }
        return f
      }))
    } catch (e) { console.error(e) }
  }

  async function handleDelete(field) {
    // Fetch usage count first so the confirmation message is informative
    let usageCount = 0
    try { const r = await getFieldUsage(field._id); usageCount = r.data?.count || 0 } catch {}

    const msg = usageCount > 0
      ? `Delete field "${field.label}"?\n\n⚠️ ${usageCount} asset record(s) have data in this field. The field will be soft-deleted — existing data is preserved but the field will no longer appear in the UI.\n\nThis cannot be undone.`
      : `Delete field "${field.label}"?\n\nNo records currently use this field. It will be permanently removed.`

    const confirmed = window.confirm(msg)
    if (!confirmed) return
    try {
      // Hard-delete when no data, soft-delete when data exists
      await deleteDynamicField(field._id, usageCount === 0)
      setFields(prev => prev.filter(f => f._id !== field._id))
    } catch (e) { alert('❌ ' + (e.response?.data?.message || e.message)) }
  }

  const existingNames = fields.map(f => f.name)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <label className="text-xs text-gray-500 font-medium">Category</label>
          <select value={category} onChange={e => setCategory(e.target.value)}
            className="border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            {assetCats.map(c => <option key={c._id} value={c.name}>{c.name}</option>)}
          </select>
          <span className="text-xs text-gray-400">{fields.length} fields</span>
        </div>
        <button onClick={() => { setEditField(null); setModalOpen(true) }}
          className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-1.5 rounded transition-colors">
          + Add Field
        </button>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 flex items-start gap-2">
        <span className="text-blue-500 text-sm mt-0.5">ℹ️</span>
        <p className="text-xs text-blue-700">🔒 Fixed fields are system-defined and cannot be deleted or renamed. You can toggle their visibility and reorder them freely.</p>
      </div>

      <FieldsTable fields={fields} loading={loading}
        onEdit={f => { setEditField(f); setModalOpen(true) }}
        onDelete={handleDelete}
        onToggleVisible={handleToggleVisible}
        onMove={handleMove}
      />

      <FieldFormModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSaved={() => { setModalOpen(false); load() }}
        entityType="asset"
        category={category}
        existingField={editField}
        existingNames={existingNames}
      />
    </div>
  )
}

// ─── Employee Fields Tab ──────────────────────────────────────────────────────
function EmployeeFieldsTab() {
  const [fields, setFields] = useState([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editField, setEditField] = useState(null)

  async function load() {
    setLoading(true)
    try {
      const res = await getDynamicFields('employee', '')
      setFields(Array.isArray(res.data?.data) ? res.data.data : [])
    } catch { setFields([]) }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  async function handleToggleVisible(field) {
    try {
      await updateDynamicField(field._id, { visible: !field.visible })
      setFields(prev => prev.map(f => f._id === field._id ? { ...f, visible: !f.visible } : f))
    } catch (e) { console.error(e) }
  }

  async function handleMove(field, direction) {
    const sorted = [...fields].sort((a, b) => a.order - b.order)
    const idx = sorted.findIndex(f => f._id === field._id)
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= sorted.length) return
    const swap = sorted[swapIdx]
    try {
      await Promise.all([updateDynamicField(field._id, { order: swap.order }), updateDynamicField(swap._id, { order: field.order })])
      setFields(prev => prev.map(f => {
        if (f._id === field._id) return { ...f, order: swap.order }
        if (f._id === swap._id) return { ...f, order: field.order }
        return f
      }))
    } catch (e) { console.error(e) }
  }

  async function handleDelete(field) {
    let usageCount = 0
    try { const r = await getFieldUsage(field._id); usageCount = r.data?.count || 0 } catch {}

    const msg = usageCount > 0
      ? `Delete field "${field.label}"?\n\n⚠️ ${usageCount} employee record(s) have data in this field. The field will be soft-deleted — existing data is preserved but the field will no longer appear in the UI.\n\nThis cannot be undone.`
      : `Delete field "${field.label}"?\n\nNo records currently use this field. It will be permanently removed.`

    const confirmed = window.confirm(msg)
    if (!confirmed) return
    try {
      await deleteDynamicField(field._id, usageCount === 0)
      setFields(prev => prev.filter(f => f._id !== field._id))
    } catch (e) { alert('❌ ' + (e.response?.data?.message || e.message)) }
  }

  const existingNames = fields.map(f => f.name)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">{fields.length} fields configured</span>
        </div>
        <button onClick={() => { setEditField(null); setModalOpen(true) }}
          className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-1.5 rounded transition-colors">
          + Add Field
        </button>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 flex items-start gap-2">
        <span className="text-blue-500 text-sm mt-0.5">ℹ️</span>
        <p className="text-xs text-blue-700">Employee fields apply globally across all employees. 🔒 Fixed fields are system-defined and cannot be deleted.</p>
      </div>

      <FieldsTable fields={fields} loading={loading}
        onEdit={f => { setEditField(f); setModalOpen(true) }}
        onDelete={handleDelete}
        onToggleVisible={handleToggleVisible}
        onMove={handleMove}
      />

      <FieldFormModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSaved={() => { setModalOpen(false); load() }}
        entityType="employee"
        category=""
        existingField={editField}
        existingNames={existingNames}
      />
    </div>
  )
}

// ─── Main Export ──────────────────────────────────────────────────────────────
export default function FieldManagementPanel() {
  const [tab, setTab] = useState('assets')

  const tabs = [
    { key: 'assets',    label: 'Asset Fields',    icon: '💻' },
    { key: 'employees', label: 'Employee Fields',  icon: '👥' },
  ]

  return (
    <div className="flex flex-col gap-5">
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-start justify-between mb-5">
          <div>
            <h2 className="text-base font-semibold text-gray-800">Field Management</h2>
            <p className="text-xs text-gray-400 mt-0.5">Configure dynamic fields for each module. Changes reflect immediately in tables, forms, import, and export.</p>
          </div>
        </div>

        {/* Tab bar */}
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit mb-6">
          {tabs.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 text-sm px-4 py-1.5 rounded-md font-medium transition-colors
                ${tab === t.key ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              <span>{t.icon}</span> {t.label}
            </button>
          ))}
        </div>

        {tab === 'assets'    && <AssetFieldsTab />}
        {tab === 'employees' && <EmployeeFieldsTab />}
      </div>
    </div>
  )
}
