import { useState, useEffect } from 'react'
import Modal from '../../components/Modal'
import { createEmployee, updateEmployee } from '../../services/api'

const EMPTY = { name: '', email: '', phone: '', department: '', regionId: '', role: 'User', status: 'Active' }

export default function EmployeeForm({ employee, regions, onClose, onSaved }) {
  const isEdit = Boolean(employee)
  const [form, setForm] = useState(EMPTY)
  const [deptSuggestions, setDeptSuggestions] = useState([])
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (employee) {
      setForm({
        name: employee.name || '',
        email: employee.email || '',
        phone: employee.phone || '',
        department: employee.department || '',
        regionId: employee.regionId?._id || employee.regionId || '',
        role: employee.role || 'User',
        status: employee.status || 'Active',
      })
    } else {
      setForm(EMPTY)
    }
  }, [employee])

  useEffect(() => {
    const region = regions.find(r => r._id === form.regionId)
    setDeptSuggestions(region?.departments || [])
  }, [form.regionId, regions])

  function handleChange(e) {
    const { name, value } = e.target
    setForm(prev => ({ ...prev, [name]: value }))
    if (error) setError('')
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      if (isEdit) {
        await updateEmployee(employee._id, form)
      } else {
        await createEmployee(form)
      }
      onSaved()
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'An error occurred')
    } finally {
      setSaving(false)
    }
  }

  const inp = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400'

  return (
    <Modal open onClose={onClose} title={isEdit ? 'Edit Employee' : 'Add Employee'}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">
            {error}
          </div>
        )}
        <div>
          <label className="text-xs text-gray-500 mb-1 block">Full Name *</label>
          <input name="name" type="text" required placeholder="e.g. Jane Smith"
            value={form.name} onChange={handleChange} className={inp} />
        </div>
        <div>
          <label className="text-xs text-gray-500 mb-1 block">Email *</label>
          <input name="email" type="email" required placeholder="e.g. jane@company.com"
            value={form.email} onChange={handleChange} className={inp} />
        </div>
        <div>
          <label className="text-xs text-gray-500 mb-1 block">Phone</label>
          <input name="phone" type="text" placeholder="e.g. +1 555 000 1234"
            value={form.phone} onChange={handleChange} className={inp} />
        </div>
        <div>
          <label className="text-xs text-gray-500 mb-1 block">Region *</label>
          <select name="regionId" required value={form.regionId} onChange={handleChange} className={inp}>
            <option value="">Select a region…</option>
            {regions.map(r => <option key={r._id} value={r._id}>{r.name}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-gray-500 mb-1 block">Department *</label>
          <input name="department" type="text" required placeholder="e.g. Engineering"
            value={form.department} onChange={handleChange} list="dept-suggestions" className={inp} />
          <datalist id="dept-suggestions">
            {deptSuggestions.map(d => <option key={d} value={d} />)}
          </datalist>
        </div>
        <div>
          <label className="text-xs text-gray-500 mb-1 block">Role *</label>
          <select name="role" required value={form.role} onChange={handleChange} className={inp}>
            <option value="User">User</option>
            <option value="Admin">Admin</option>
          </select>
        </div>
        <div>
          <label className="text-xs text-gray-500 mb-1 block">Status *</label>
          <select name="status" required value={form.status} onChange={handleChange} className={inp}>
            <option value="Active">Active</option>
            <option value="Inactive">Inactive</option>
          </select>
        </div>
        <div className="flex justify-end gap-2 mt-2">
          <button type="button" onClick={onClose}
            className="px-4 py-2 text-sm rounded-lg border border-gray-300 hover:bg-gray-50">
            Cancel
          </button>
          <button type="submit" disabled={saving}
            className="px-4 py-2 text-sm rounded-lg bg-green-600 text-white hover:bg-green-700 font-semibold disabled:opacity-60">
            {saving ? 'Saving…' : isEdit ? 'Update' : 'Create'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
