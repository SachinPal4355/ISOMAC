import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getAssets, getAccessories, getAssignments, getMaintenanceLogs, getAssetCategories, getRequests, getOrganizations } from '../services/api'
import Layout from '../components/Layout'
import StatCard from '../components/StatCard'
import { useAuth } from '../context/AuthContext'
import { Chart, registerables } from 'chart.js'
Chart.register(...registerables)

export default function Dashboard() {
  const navigate = useNavigate()
  const { user, isEmployee, isCompanyAdmin, isSuperAdmin } = useAuth()

  // Employee dashboard — minimal
  if (isEmployee) return <EmployeeDashboard user={user} />

  return <AdminDashboard navigate={navigate} isSuperAdmin={isSuperAdmin} isCompanyAdmin={isCompanyAdmin} />
}

// ─── Employee Dashboard ───────────────────────────────────────────────────────
function EmployeeDashboard({ user }) {
  const navigate = useNavigate()
  const [requests, setRequests] = useState([])

  useEffect(() => {
    getRequests({ limit: 5 }).then(r => setRequests(Array.isArray(r.data?.data) ? r.data.data : [])).catch(() => {})
  }, [])

  return (
    <Layout>
      <div className="max-w-2xl mx-auto flex flex-col gap-6">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Welcome, {user?.username}</h1>
          <p className="text-xs text-gray-400 mt-0.5">Employee Portal</p>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <button onClick={() => navigate('/requests')}
            className="bg-green-600 hover:bg-green-700 text-white rounded-xl p-6 text-left transition-colors">
            <div className="mb-2">
              <svg className="w-7 h-7 text-white opacity-80" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" /></svg>
            </div>
            <div className="font-semibold">Raise a Request</div>
            <div className="text-xs text-green-200 mt-1">Submit IT requests</div>
          </button>
          <button onClick={() => navigate('/requests')}
            className="bg-white border border-gray-200 hover:border-green-300 rounded-xl p-6 text-left transition-colors">
            <div className="mb-2">
              <svg className="w-7 h-7 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg>
            </div>
            <div className="font-semibold text-gray-800">My Requests</div>
            <div className="text-xs text-gray-400 mt-1">View request status</div>
          </button>
        </div>
        {requests.length > 0 && (
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">Recent Requests</h2>
            <div className="flex flex-col gap-2">
              {requests.slice(0, 3).map(r => (
                <div key={r._id} className="flex items-center justify-between text-sm">
                  <span className="text-gray-700 truncate">{r.title}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ml-2 flex-shrink-0
                    ${r.status === 'approved' ? 'bg-green-100 text-green-700' :
                      r.status === 'rejected' ? 'bg-red-100 text-red-700' :
                      'bg-yellow-100 text-yellow-700'}`}>
                    {r.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Layout>
  )
}

// ─── Admin/Editor Dashboard ───────────────────────────────────────────────────
function AdminDashboard({ navigate, isSuperAdmin, isCompanyAdmin }) {
  const chartRef  = useRef(null)
  const chartInst = useRef(null)
  const [assets, setAssets]           = useState([])
  const [accessories, setAccessories] = useState([])
  const [assetCats, setAssetCats]     = useState([])
  const [accCats, setAccCats]         = useState([])
  const [assignments, setAssignments] = useState([])
  const [maintenance, setMaintenance] = useState([])
  const [loading, setLoading]         = useState(true)

  useEffect(() => { load() }, [])

  async function load() {
    try {
      const [assetRes, accRes, asgRes, mntRes, catRes] = await Promise.all([
        getAssets({ limit: 500 }), getAccessories({ limit: 500 }),
        getAssignments({ limit: 500 }), getMaintenanceLogs({ limit: 500 }),
        getAssetCategories()
      ])
      const assetData = Array.isArray(assetRes.data?.data) ? assetRes.data.data : (Array.isArray(assetRes.data) ? assetRes.data : [])
      const accData   = Array.isArray(accRes.data?.data)   ? accRes.data.data   : (Array.isArray(accRes.data)   ? accRes.data   : [])
      const asgData   = Array.isArray(asgRes.data?.data)   ? asgRes.data.data   : (Array.isArray(asgRes.data)   ? asgRes.data   : [])
      const mntData   = Array.isArray(mntRes.data?.data)   ? mntRes.data.data   : (Array.isArray(mntRes.data)   ? mntRes.data   : [])
      const allCats   = Array.isArray(catRes.data?.data)   ? catRes.data.data   : []
      setAssets(assetData)
      setAccessories(accData)
      setAssignments(asgData)
      setMaintenance(mntData)
      setAssetCats(allCats.filter(c => c.type === 'asset'))
      setAccCats(allCats.filter(c => c.type === 'accessory'))
      buildChart(assetData, accData)
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  function buildChart(assetData, accData) {
    const allItems = [...assetData, ...accData]
    const counts = {}
    allItems.forEach(a => { const s = a.status || 'Unknown'; counts[s] = (counts[s] || 0) + 1 })
    if (chartInst.current) chartInst.current.destroy()
    if (!chartRef.current) return
    chartInst.current = new Chart(chartRef.current, {
      type: 'bar',
      data: {
        labels: Object.keys(counts),
        datasets: [{ label: 'Items', data: Object.values(counts),
          backgroundColor: ['#16a34a','#2563eb','#d97706','#dc2626','#7c3aed','#0891b2','#be185d'],
          borderRadius: 6 }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true, grid: { color: '#f3f4f6' } }, x: { grid: { display: false } } },
        animation: { duration: 800 }
      }
    })
  }

  const activeAssignments = assignments.filter(a => a.status === 'Active').length
  const openMaintenance   = maintenance.filter(m => m.status !== 'Completed').length
  const allItems          = [...assets, ...accessories]

  return (
    <Layout>
      <div className="max-w-6xl mx-auto flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-800">Dashboard</h1>
          <span className="text-xs text-gray-400">{new Date().toLocaleDateString('en-IN', { weekday:'long', year:'numeric', month:'long', day:'numeric' })}</span>
        </div>

        {/* Top stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Total Assets"     value={assets.length}       color="blue"   icon="assets" />
          <StatCard label="Accessories"      value={accessories.length}  color="purple" icon="accessories" />
          <StatCard label="Active Loans"     value={activeAssignments}   color="yellow" icon="loans" />
          <StatCard label="Open Maintenance" value={openMaintenance}     color="red"    icon="maintenance" />
        </div>

        {/* Asset status row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Available" value={allItems.filter(a => a.status === 'Available').length} color="green" />
          <StatCard label="Assigned"  value={allItems.filter(a => a.status === 'Assigned').length}  color="blue" />
          <StatCard label="In Repair" value={allItems.filter(a => a.status === 'In Repair').length} color="yellow" />
          <StatCard label="Retired"   value={allItems.filter(a => a.status === 'Retired').length}   color="gray" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Assets by category */}
          <div className="bg-white rounded-lg border border-gray-200 p-5 flex flex-col gap-5">
            {/* Asset categories */}
            <div>
              <h2 className="text-sm font-semibold text-gray-700 mb-3">Assets by Category</h2>
              {assetCats.length === 0 ? (
                <p className="text-sm text-gray-400">No asset categories</p>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  {assetCats.map(cat => {
                    const count = assets.filter(a => a.category === cat.name).length
                    return (
                      <button key={cat._id}
                        onClick={() => navigate(`/assets?category=${encodeURIComponent(cat.name)}`)}
                        className="flex flex-col items-center p-3 rounded-lg border border-gray-100 hover:border-green-300 hover:bg-green-50 transition-colors cursor-pointer">
                        <span className="text-xl font-bold text-gray-800">{count}</span>
                        <span className="text-xs text-gray-500 text-center mt-0.5">{cat.name}</span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Accessory categories */}
            <div>
              <h2 className="text-sm font-semibold text-gray-700 mb-3">Accessories by Category</h2>
              {accCats.length === 0 ? (
                <p className="text-sm text-gray-400">No accessory categories</p>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  {accCats.map(cat => {
                    const count = accessories.filter(a => a.category === cat.name).length
                    return (
                      <button key={cat._id}
                        onClick={() => navigate(`/accessories?category=${encodeURIComponent(cat.name)}`)}
                        className="flex flex-col items-center p-3 rounded-lg border border-gray-100 hover:border-purple-300 hover:bg-purple-50 transition-colors cursor-pointer">
                        <span className="text-xl font-bold text-gray-800">{count}</span>
                        <span className="text-xs text-gray-500 text-center mt-0.5">{cat.name}</span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Status chart */}
          <div className="bg-white rounded-lg border border-gray-200 p-5">
            <h2 className="text-sm font-semibold text-gray-700 mb-4">Status Distribution (Assets + Accessories)</h2>
            <div style={{ height: 200 }}>
              <canvas ref={chartRef} />
            </div>
          </div>
        </div>

        {/* Recent assignments */}
        <div className="bg-white rounded-lg border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Recent Active Loans</h2>
          {assignments.filter(a => a.status === 'Active').slice(0, 5).length === 0
            ? <p className="text-sm text-gray-400">No active loans</p>
            : <table className="w-full text-sm">
                <thead><tr className="text-xs text-gray-400 border-b">
                  <th className="text-left pb-2">Asset</th>
                  <th className="text-left pb-2">Assigned To</th>
                  <th className="text-left pb-2">Since</th>
                </tr></thead>
                <tbody>
                  {assignments.filter(a => a.status === 'Active').slice(0, 5).map(a => (
                    <tr key={a._id} className="border-b border-gray-50">
                      <td className="py-2 font-mono text-xs">{a.asset?.assetTag} — {a.asset?.name}</td>
                      <td className="py-2">{a.assignedTo?.fullName || a.assignedTo?.username}</td>
                      <td className="py-2 text-gray-400 text-xs">{a.assignedAt ? new Date(a.assignedAt).toLocaleDateString() : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
          }
        </div>
      </div>
    </Layout>
  )
}
