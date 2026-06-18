import { useState } from 'react'
import DataTable from '../../components/DataTable'
import Modal from '../../components/Modal'
import { useAuth } from '../../context/AuthContext'
import { createRegion } from '../../services/api'

const EMPTY_FORM = { name: '', departments: '' }

export default function Regions({ regions, onRefresh }) {
  const { isEditor } = useAuth()
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  function openAdd() {
    setForm(EMPTY_FORM)
    setError('')
    setModalOpen(true)
  }

  function closeModal() {
    setModalOpen(false)
    setError('')
  }

  async function handleSubmit() {
    if (!form.name.trim()) {
      setError('Region name is required.')
      return
    }
    setSubmitting(true)
    setError('')
    try {
      const depts = form.departments
        .split(',')
        .map(s => s.trim())
        .filter(Boolean)
      await createRegion({ name: form.name.trim(), departments: depts })
      setModalOpen(false)
      onRefresh()
    } catch (e) {
      setError(e.response?.data?.message || e.message || 'Failed to create region.')
    } finally {
      setSubmitting(false)
    }
  }

  const columns = [
    {
      key: 'name',
      label: 'Name',
    },
    {
      key: 'departments',
      label: 'Departments',
      render: (v) =>
        Array.isArray(v) && v.length > 0
          ? v.join(', ')
          : <span className="text-gray-400 text-xs">—</span>,
    },
    {
      key: 'createdAt',
      label: 'Created At',
      render: (v) =>
        v ? new Date(v).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '—',
    },
    {
      key: '_id',
      label: 'Actions',
      sortable: false,
      render: () => (
        <span className="text-xs text-gray-400">—</span>
      ),
    },
  ]

  const inp = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400'

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold text-gray-800">Regions</h2>
          <p className="text-xs text-gray-400 mt-0.5">{regions.length} region{regions.length !== 1 ? 's' : ''}</p>
        </div>
        {isEditor && (
          <button
            onClick={openAdd}
            className="bg-green-600 hover:bg-green-700 text-white text-sm font-semibold px-4 py-1.5 rounded-lg"
          >
            + Add Region
          </button>
        )}
      </div>

      <DataTable
        columns={columns}
        rows={regions}
        emptyText="No regions found"
      />

      <Modal open={modalOpen} onClose={closeModal} title="Add Region">
        <div className="flex flex-col gap-3">
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Region Name *</label>
            <input
              placeholder="e.g. India, USA"
              value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}
              className={inp}
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Departments (comma-separated, optional)</label>
            <input
              placeholder="e.g. IT, Engineering, HR"
              value={form.departments}
              onChange={e => setForm({ ...form, departments: e.target.value })}
              className={inp}
            />
          </div>
          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
          )}
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button
            onClick={closeModal}
            className="px-4 py-2 text-sm rounded-lg border border-gray-300 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="px-4 py-2 text-sm rounded-lg bg-green-600 text-white hover:bg-green-700 font-semibold disabled:opacity-60"
          >
            {submitting ? 'Creating…' : 'Create'}
          </button>
        </div>
      </Modal>
    </div>
  )
}
