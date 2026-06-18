import { useState, useEffect } from 'react'
import Modal from '../../components/Modal'
import Badge from '../../components/Badge'
import { getEmployeeAssetHistory } from '../../services/api'

export default function EmployeeDetailPanel({ employee, onClose }) {
  const [history, setHistory] = useState([])
  const [historyLoading, setHistoryLoading] = useState(true)

  useEffect(() => {
    if (!employee?._id) return
    setHistoryLoading(true)
    getEmployeeAssetHistory(employee._id)
      .then(r => setHistory(Array.isArray(r.data?.data) ? r.data.data : []))
      .catch(() => setHistory([]))
      .finally(() => setHistoryLoading(false))
  }, [employee?._id])

  if (!employee) return null

  const assignedAssets = employee.assets || []

  return (
    <Modal title={employee.name} onClose={onClose}>
      <div className="flex flex-col gap-5 min-w-[480px] max-w-2xl">

        {/* Profile */}
        <div className="grid grid-cols-2 gap-3">
          {[
            ['Full Name', employee.name],
            ['Email', employee.email],
            ['Phone', employee.phone || '—'],
            ['Department', employee.department],
            ['Region', employee.regionId?.name || '—'],
            ['Role', employee.role],
          ].map(([label, value]) => (
            <div key={label}>
              <p className="text-xs text-gray-400 uppercase tracking-wide">{label}</p>
              <p className="text-sm font-medium text-gray-700 mt-0.5">{value}</p>
            </div>
          ))}
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wide">Status</p>
            <div className="mt-0.5"><Badge label={employee.status} /></div>
          </div>
        </div>

        {/* Currently Assigned Assets */}
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-2">Currently Assigned Assets</h3>
          {assignedAssets.length === 0 ? (
            <p className="text-xs text-gray-400 italic">No assets assigned</p>
          ) : (
            <div className="flex flex-col gap-2">
              {assignedAssets.map(asset => (
                <div key={asset._id || asset} className="flex items-center gap-3 p-2 bg-gray-50 rounded-lg border border-gray-200">
                  <span className="font-mono text-xs font-semibold text-green-700">{asset.assetTag || asset}</span>
                  {asset.name && <span className="text-xs text-gray-600">{asset.name}</span>}
                  {asset.category && <span className="text-xs text-gray-400">{asset.category}</span>}
                  {asset.status && <Badge label={asset.status} />}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Asset History Timeline */}
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-2">Asset History</h3>
          {historyLoading ? (
            <p className="text-xs text-gray-400">Loading...</p>
          ) : history.length === 0 ? (
            <p className="text-xs text-gray-400 italic">No asset history</p>
          ) : (
            <div className="flex flex-col gap-3 max-h-48 overflow-y-auto pr-1">
              {history.map(entry => (
                <div key={entry._id} className="flex items-start gap-3">
                  <div className={`mt-1.5 w-2.5 h-2.5 rounded-full flex-shrink-0
                    ${entry.action === 'assigned' ? 'bg-green-500' : 'bg-gray-400'}`} />
                  <div>
                    <p className="text-sm font-medium text-gray-700">
                      {entry.action === 'assigned' ? 'Assigned' : 'Returned'} — {entry.assetId?.name || '—'} ({entry.assetId?.assetTag || '—'})
                    </p>
                    <p className="text-xs text-gray-400">{new Date(entry.date).toLocaleString()}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}
