import { useEffect, useState } from 'react'
import Modal from '../../components/Modal'
import {
  getDynamicFields,
  createDynamicField,
  updateDynamicField,
  deleteDynamicField,
} from '../../services/api'

const inp = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400'
const EMPTY_FORM = { name: '', label: '', type: 'text', required: false, options: '' }

export default function AssetFieldConfig({ category, entityType = 'asset', onClose }) {
  const [fields, setFields] = useState([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState(EMPTY_FORM)
  const [formError, setFormError] = useState('')
  const [formMsg, setFormMsg] = useState('')

  async function load() {
    setLoading(true)
    try {
      const res = await getDynamicFields(entityType, category)
      setFields(Array.isArray(res.data?.data) ? res.data.data.sort((a, b) => a.order - b.order) : [])
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
      await Promise.all([
        updateDynamicField(field._id, { order: swap.order }),
        updateDynamicField(swap._id, { order: field.order }),
      ])
      setFields(prev => prev.map(f => {
        if (f._id === field._id) return { ...f, order: swap.order }
        if (f._id === swap._id) return { ...f, order: field.order }
        return f
      }).sort((a, b) => a.order - b.order))
    } catch (e) { console.error(e) }
  }

  async function handleDelete(field) {
    if (!window.confirm(`Delete field "${field.label}"?`)) return
    try {
      await deleteDynamicField(field._id)
      setFields(prev => prev.filter(f => f._id !== field._id))
    } catch (e) {
      alert('❌ ' + (e.response?.data?.message || e.message))
    }
  }

  async function handleAdd(e) {
    e.preventDefault()
    setFormError(''); setFormMsg('')
    if (fields.some(f => f.name === form.name)) {
      return setFormError(`Field key "${form.name}" already exists in this category`)
    }
    try {
      const maxOrder = fields.length > 0 ? Math.max(...fields.map(f => f.order)) : 0
      await createDynamicField({
        entityType,
        category,
        name: form.name,
        label: form.label,
        type: form.type,
        required: form.required,
        visible: true,
        order: maxOrder + 1,
        options: form.type === 'select' ? form.options.split(',').map(s => s.trim()).filter(Boolean) : [],
      })
      setFormMsg('✅ Field added')
      setForm(EMPTY_FORM)
      load()
    } catch (e) {
      setFormError(e.response?.data?.message || e.message)
    }
  }

  const sorted = [...fields].sort((a, b) => a.order - b.order)

  return (
    <Modal open onClose={onClose} title={`Field Config — ${category}`} width="max-w-2xl">
      <div className="flex flex-col gap-5">

        {/* Fields table */}
        <div>
          <p className="text-xs text-gray-400 mb-3">🔒 Fixed fields cannot be deleted or renamed. Toggle visibility or reorder freely.</p>
          {loading ? (
            <p className="text-sm text-gray-400">Loading...</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-gray-200">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    {['Label','Key','Type','Req','Visible','Order',''].map(h => (
                      <th key={h} className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-3 py-2">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((field, idx) => (
                    <tr key={field._id} className="border-t border-gray-100 hover:bg-gray-50">
                      <td className="px-3 py-2 font-medium text-gray-700">
                        {field.isFixed && <span className="mr-1 text-gray-400">🔒</span>}
                        {field.label}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs text-gray-500">{field.name}</td>
                      <td className="px-3 py-2 text-gray-600 capitalize">{field.type}</td>
                      <td className="px-3 py-2 text-gray-500">{field.required ? '✓' : '—'}</td>
                      <td className="px-3 py-2">
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input type="checkbox" checked={field.visible} onChange={() => handleToggleVisible(field)} className="sr-only peer" />
                          <div className="w-9 h-5 bg-gray-200 rounded-full peer peer-checked:bg-green-500 after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-4" />
                        </label>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex gap-1">
                          <button onClick={() => handleMove(field, 'up')} disabled={idx === 0}
                            className="text-xs px-1.5 py-0.5 border border-gray-200 rounded hover:bg-gray-100 disabled:opacity-30">↑</button>
                          <button onClick={() => handleMove(field, 'down')} disabled={idx === sorted.length - 1}
                            className="text-xs px-1.5 py-0.5 border border-gray-200 rounded hover:bg-gray-100 disabled:opacity-30">↓</button>
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        {!field.isFixed && (
                          <button onClick={() => handleDelete(field)}
                            className="text-xs text-red-500 hover:text-red-700 hover:bg-red-50 px-2 py-0.5 rounded">Del</button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {sorted.length === 0 && (
                    <tr><td colSpan={7} className="px-3 py-4 text-center text-gray-400 text-sm">No fields</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Add custom field form */}
        <div className="border-t border-gray-100 pt-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Add Custom Field</h3>
          <form onSubmit={handleAdd} className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Label *</label>
              <input placeholder="Display label" value={form.label}
                onChange={e => setForm({ ...form, label: e.target.value })} className={inp} required />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Field Key *</label>
              <input placeholder="field_key" value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value.replace(/\s+/g, '_').toLowerCase() })} className={inp} required />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Type</label>
              <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })} className={inp}>
                {['text','number','date','select'].map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-2 pt-5">
              <input type="checkbox" id="acf-req" checked={form.required}
                onChange={e => setForm({ ...form, required: e.target.checked })} className="w-4 h-4 accent-green-600" />
              <label htmlFor="acf-req" className="text-sm text-gray-600">Required</label>
            </div>
            {form.type === 'select' && (
              <div className="col-span-2">
                <label className="text-xs text-gray-500 mb-1 block">Options (comma-separated)</label>
                <input placeholder="Option 1, Option 2" value={form.options}
                  onChange={e => setForm({ ...form, options: e.target.value })} className={inp} />
              </div>
            )}
            <div className="col-span-2 flex items-center gap-3">
              <button type="submit" className="bg-green-600 hover:bg-green-700 text-white text-sm font-semibold px-4 py-2 rounded-lg">
                Add Field
              </button>
              {formError && <span className="text-sm text-red-600">{formError}</span>}
              {formMsg   && <span className="text-sm text-green-600">{formMsg}</span>}
            </div>
          </form>
        </div>
      </div>
    </Modal>
  )
}
