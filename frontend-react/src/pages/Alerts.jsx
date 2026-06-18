import { useState, useEffect, useCallback } from 'react'
import Layout from '../components/Layout'
import { getAlerts, markAlertRead, markAllAlertsRead, deleteAlert, runAlertChecks } from '../services/api'

const TYPE_LABELS = {
  warranty_expiry: 'Warranty',
  license_expiry: 'License',
  maintenance_due: 'Maintenance',
  low_stock: 'Low Stock',
  overdue_asset: 'Overdue Asset',
}

const SEV_BADGE = {
  high:   'bg-red-100 text-red-700',
  medium: 'bg-yellow-100 text-yellow-700',
  low:    'bg-blue-100 text-blue-700',
}

export default function Alerts() {
  const [alerts, setAlerts] = useState([])
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [filter, setFilter] = useState('all') // all | unread | read
  const [severityFilter, setSeverityFilter] = useState('all')
  const [msg, setMsg] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = {}
      if (filter !== 'all') params.status = filter
      if (severityFilter !== 'all') params.severity = severityFilter
      const res = await getAlerts(params)
      setAlerts(Array.isArray(res.data?.data) ? res.data.data : [])
    } catch {
      setAlerts([])
    } finally {
      setLoading(false)
    }
  }, [filter, severityFilter])

  useEffect(() => { load() }, [load])

  async function handleMarkRead(id) {
    await markAlertRead(id)
    setAlerts(prev => prev.map(a => a._id === id ? { ...a, status: 'read' } : a))
  }

  async function handleMarkAll() {
    await markAllAlertsRead()
    setAlerts(prev => prev.map(a => ({ ...a, status: 'read' })))
  }

  async function handleDelete(id) {
    await deleteAlert(id)
    setAlerts(prev => prev.filter(a => a._id !== id))
  }

  async function handleRunChecks() {
    setRunning(true)
    setMsg('')
    try {
      await runAlertChecks({})
      setMsg('✅ Alert checks completed. Refreshing...')
      await load()
    } catch (e) {
      setMsg('❌ ' + (e.response?.data?.message || e.message))
    } finally {
      setRunning(false)
    }
  }

  const unreadCount = alerts.filter(a => a.status === 'unread').length

  return (
    <Layout>
      <div className="flex flex-col gap-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-800">Alerts</h1>
            {unreadCount > 0 && (
              <p className="text-sm text-gray-500 mt-0.5">{unreadCount} unread alert{unreadCount !== 1 ? 's' : ''}</p>
            )}
          </div>
          <div className="flex gap-2">
            <button onClick={handleMarkAll}
              className="text-xs px-3 py-1.5 border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors">
              Mark all read
            </button>
            <button onClick={handleRunChecks} disabled={running}
              className="text-xs px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50">
              {running ? 'Running...' : 'Run Checks Now'}
            </button>
          </div>
        </div>

        {msg && <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-4 py-2">{msg}</p>}

        {/* Filters */}
        <div className="flex gap-2 flex-wrap">
          {['all','unread','read'].map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors capitalize
                ${filter === f ? 'bg-gray-800 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
              {f}
            </button>
          ))}
          <div className="w-px bg-gray-200 mx-1" />
          {['all','high','medium','low'].map(s => (
            <button key={s} onClick={() => setSeverityFilter(s)}
              className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors capitalize
                ${severityFilter === s ? 'bg-gray-800 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
              {s === 'all' ? 'All Severity' : s}
            </button>
          ))}
        </div>

        {/* Alert list */}
        <div className="flex flex-col gap-2">
          {loading ? (
            <div className="text-center py-12 text-gray-400 text-sm">Loading alerts...</div>
          ) : alerts.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
              <div className="text-4xl mb-3">🔔</div>
              <p className="text-gray-500 text-sm">No alerts found</p>
              <p className="text-gray-400 text-xs mt-1">Run checks to generate alerts from current data</p>
            </div>
          ) : (
            alerts.map(alert => (
              <div key={alert._id}
                className={`bg-white rounded-xl border px-4 py-3 flex items-start gap-3 transition-colors
                  ${alert.status === 'unread' ? 'border-l-4 border-l-orange-400 border-gray-200' : 'border-gray-200 opacity-75'}`}>
                {/* Severity dot */}
                <div className={`mt-1 w-2.5 h-2.5 rounded-full flex-shrink-0
                  ${alert.severity === 'high' ? 'bg-red-500' : alert.severity === 'medium' ? 'bg-yellow-400' : 'bg-blue-400'}`} />

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${SEV_BADGE[alert.severity] || 'bg-gray-100 text-gray-600'}`}>
                      {alert.severity?.toUpperCase()}
                    </span>
                    <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                      {TYPE_LABELS[alert.type] || alert.type}
                    </span>
                    {alert.status === 'unread' && (
                      <span className="text-xs text-orange-600 font-semibold">NEW</span>
                    )}
                  </div>
                  <p className="text-sm text-gray-700 mt-1">{alert.message}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {new Date(alert.createdAt).toLocaleString()}
                  </p>
                </div>

                <div className="flex gap-1 flex-shrink-0">
                  {alert.status === 'unread' && (
                    <button onClick={() => handleMarkRead(alert._id)}
                      className="text-xs px-2 py-1 text-blue-600 hover:bg-blue-50 rounded transition-colors">
                      Read
                    </button>
                  )}
                  <button onClick={() => handleDelete(alert._id)}
                    className="text-xs px-2 py-1 text-red-500 hover:bg-red-50 rounded transition-colors">
                    ✕
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </Layout>
  )
}
