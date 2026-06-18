/**
 * Requests.jsx — Request workflow page
 *
 * employee: create + view own requests
 * editor/admin: view all org requests, approve/reject
 */
import { useState, useEffect, useCallback } from 'react'
import Layout from '../components/Layout'
import { useAuth } from '../context/AuthContext'
import { getRequests, createRequest, updateRequest } from '../services/api'

const STATUS_BADGE = {
  pending:  'bg-yellow-100 text-yellow-700',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
}

export default function Requests() {
  const { isEmployee, isEditor, isAdmin } = useAuth()
  const [requests, setRequests]   = useState([])
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState('')
  const [showForm, setShowForm]   = useState(false)
  const [form, setForm]           = useState({ title: '', description: '' })
  const [submitting, setSubmitting] = useState(false)
  const [statusFilter, setStatusFilter] = useState('all')

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const params = {}
      if (statusFilter !== 'all') params.status = statusFilter
      const res = await getRequests(params)
      setRequests(Array.isArray(res.data?.data) ? res.data.data : [])
    } catch (e) {
      setError(e.response?.data?.message || 'Failed to load requests')
    } finally { setLoading(false) }
  }, [statusFilter])

  useEffect(() => { load() }, [load])

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.title.trim()) return
    setSubmitting(true)
    try {
      await createRequest(form)
      setForm({ title: '', description: '' })
      setShowForm(false)
      load()
    } catch (e) {
      setError(e.response?.data?.message || 'Failed to submit request')
    } finally { setSubmitting(false) }
  }

  async function handleAction(id, status) {
    const reason = status === 'rejected' ? window.prompt('Rejection reason (optional):') : undefined
    try {
      await updateRequest(id, { status, rejectionReason: reason || '' })
      load()
    } catch (e) {
      alert('❌ ' + (e.response?.data?.message || e.message))
    }
  }

  return (
    <Layout>
      <div className="flex flex-col gap-4 max-w-4xl mx-auto">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-800">
              {isEmployee ? 'My Requests' : 'All Requests'}
            </h1>
            <p className="text-xs text-gray-400 mt-0.5">{requests.length} request(s)</p>
          </div>
          {isEmployee && (
            <button onClick={() => setShowForm(v => !v)}
              className="bg-green-600 hover:bg-green-700 text-white text-sm font-semibold px-4 py-2 rounded-lg">
              + New Request
            </button>
          )}
        </div>

        {/* New request form */}
        {showForm && (
          <form onSubmit={handleSubmit} className="bg-white border border-gray-200 rounded-lg p-5 flex flex-col gap-3">
            <h2 className="text-sm font-semibold text-gray-700">Submit a Request</h2>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Title *</label>
              <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                placeholder="e.g. Request for laptop charger"
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                required />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Description</label>
              <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Describe your request..."
                rows={3}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400 resize-none" />
            </div>
            <div className="flex gap-2">
              <button type="submit" disabled={submitting}
                className="bg-green-600 hover:bg-green-700 text-white text-sm font-semibold px-4 py-2 rounded disabled:opacity-50">
                {submitting ? 'Submitting...' : 'Submit'}
              </button>
              <button type="button" onClick={() => setShowForm(false)}
                className="border border-gray-300 text-gray-600 text-sm px-4 py-2 rounded hover:bg-gray-50">
                Cancel
              </button>
            </div>
          </form>
        )}

        {/* Filters (admin/editor only) */}
        {!isEmployee && (
          <div className="flex gap-2">
            {['all', 'pending', 'approved', 'rejected'].map(s => (
              <button key={s} onClick={() => setStatusFilter(s)}
                className={`text-xs px-3 py-1.5 rounded-lg font-medium capitalize transition-colors
                  ${statusFilter === s ? 'bg-gray-800 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                {s === 'all' ? 'All' : s}
              </button>
            ))}
          </div>
        )}

        {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-4 py-2">{error}</p>}

        {/* Request list */}
        {loading ? (
          <div className="text-center py-12 text-gray-400 text-sm">Loading...</div>
        ) : requests.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-lg border border-gray-200">
            <div className="text-3xl mb-2">📋</div>
            <p className="text-gray-500 text-sm font-medium">No requests found</p>
            {isEmployee && <p className="text-gray-400 text-xs mt-1">Click "+ New Request" to submit one</p>}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {requests.map(req => (
              <div key={req._id} className="bg-white border border-gray-200 rounded-lg p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${STATUS_BADGE[req.status]}`}>
                        {req.status.toUpperCase()}
                      </span>
                      <h3 className="text-sm font-semibold text-gray-800">{req.title}</h3>
                    </div>
                    {req.description && (
                      <p className="text-xs text-gray-500 mt-1">{req.description}</p>
                    )}
                    <div className="flex items-center gap-3 mt-2 text-[10px] text-gray-400">
                      {!isEmployee && req.requestedBy && (
                        <span>By: {req.requestedBy.fullName || req.requestedBy.username}</span>
                      )}
                      <span>{new Date(req.createdAt).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}</span>
                      {req.rejectionReason && (
                        <span className="text-red-500">Reason: {req.rejectionReason}</span>
                      )}
                    </div>
                  </div>
                  {/* Approve/Reject buttons for editor+ */}
                  {(isEditor || isAdmin) && req.status === 'pending' && (
                    <div className="flex gap-1 flex-shrink-0">
                      <button onClick={() => handleAction(req._id, 'approved')}
                        className="text-xs bg-green-100 text-green-700 hover:bg-green-200 px-2.5 py-1 rounded font-medium">
                        Approve
                      </button>
                      <button onClick={() => handleAction(req._id, 'rejected')}
                        className="text-xs bg-red-100 text-red-700 hover:bg-red-200 px-2.5 py-1 rounded font-medium">
                        Reject
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  )
}
