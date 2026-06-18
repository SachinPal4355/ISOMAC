import { useEffect, useState } from 'react'
import { getAssignments, createAssignment, returnAssignment, getAssets, getUsers } from '../services/api'
import Layout from '../components/Layout'
import SidebarSection from '../components/SidebarSection'
import DataTable from '../components/DataTable'
import Badge from '../components/Badge'
import Modal from '../components/Modal'
import StatCard from '../components/StatCard'
import { useAuth } from '../context/AuthContext'

export default function Assignments() {
  const { isEditor } = useAuth()
  const [assignments, setAssignments] = useState([])
  const [assets, setAssets]           = useState([])
  const [users, setUsers]             = useState([])
  const [statusFilter, setStatusFilter] = useState('All')
  const [search, setSearch]           = useState('')
  const [modalOpen, setModalOpen]     = useState(false)
  const [form, setForm]               = useState({ assetId:'', userId:'', notes:'' })
  const [loading, setLoading]         = useState(true)

  useEffect(() => { load() }, [])

  async function load() {
    try {
      const [asgRes, assetRes] = await Promise.all([getAssignments(), getAssets()])
      setAssignments(Array.isArray(asgRes.data?.data) ? asgRes.data.data : (Array.isArray(asgRes.data) ? asgRes.data : []))
      const assetList = Array.isArray(assetRes.data?.data) ? assetRes.data.data : (Array.isArray(assetRes.data) ? assetRes.data : [])
      setAssets(assetList.filter(a => a.status === 'Available'))
      if (isEditor) { const ur = await getUsers(); setUsers(Array.isArray(ur.data) ? ur.data : []) }
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  async function handleAssign() {
    if (!form.assetId||!form.userId) return alert('Select both asset and user')
    try {
      await createAssignment({ assetId:form.assetId, userId:form.userId, notes:form.notes })
      setModalOpen(false); setForm({ assetId:'', userId:'', notes:'' }); load()
    } catch (e) { alert('❌ '+(e.response?.data?.message||e.message)) }
  }

  async function handleReturn(id) {
    if (!window.confirm('Mark as returned?')) return
    try { await returnAssignment(id); load() }
    catch (e) { alert('❌ '+(e.response?.data?.message||e.message)) }
  }

  const statusCounts = {
    All: assignments.length,
    Active: assignments.filter(a=>a.status==='Active').length,
    Returned: assignments.filter(a=>a.status==='Returned').length,
  }

  const filtered = assignments.filter(a => {
    const matchStatus = statusFilter === 'All' || a.status === statusFilter
    const text = [a.asset?.assetTag,a.asset?.name,a.assignedTo?.username,a.assignedTo?.fullName,a.assignedTo?.email]
      .map(v=>(v||'').toLowerCase()).join(' ')
    return matchStatus && (!search || text.includes(search.toLowerCase()))
  })

  const columns = [
    { key:'asset',      label:'Asset Tag', render:(_,r) => <span className="font-mono text-xs font-semibold">{r.asset?.assetTag||'—'}</span> },
    { key:'_name',      label:'Asset Name', sortable:false, render:(_,r) => r.asset?.name||'—' },
    { key:'_cat',       label:'Category', sortable:false, render:(_,r) => r.asset?.category||'—' },
    { key:'assignedTo', label:'Assigned To', render:(_,r) => r.assignedTo?.fullName||r.assignedTo?.username||'—' },
    { key:'_email',     label:'Email', sortable:false, render:(_,r) => <span className="text-xs">{r.assignedTo?.email||'—'}</span> },
    { key:'assignedBy', label:'By', render:(_,r) => r.assignedBy?.username||'—' },
    { key:'assignedAt', label:'Assigned', render: v => v ? new Date(v).toLocaleDateString('en-IN') : '—' },
    { key:'returnedAt', label:'Returned', render: v => v ? new Date(v).toLocaleDateString('en-IN') : '—' },
    { key:'notes',      label:'Notes', render: v => <span className="text-xs">{v||'—'}</span> },
    { key:'status',     label:'Status', render: v => <Badge label={v} /> },
    { key:'_id',        label:'Actions', sortable:false, render:(_,r) => (
      isEditor && r.status === 'Active' &&
      <button onClick={() => handleReturn(r._id)}
        className="text-xs bg-orange-100 text-orange-700 hover:bg-orange-200 px-2 py-1 rounded font-medium">
        Return
      </button>
    )}
  ]

  const inp = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400'

  const sidebar = (
    <SidebarSection title="Status"
      items={Object.entries(statusCounts).map(([k,v])=>({label:k,value:k,count:v}))}
      selected={statusFilter} onSelect={setStatusFilter} />
  )

  return (
    <Layout sidebar={sidebar}>
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-bold text-gray-800">Loans / Assignments</h1>
            <p className="text-xs text-gray-400 mt-0.5">{filtered.length} records</p>
          </div>
          <div className="flex gap-2">
            <input placeholder="Search..." value={search} onChange={e=>setSearch(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400 w-44" />
            {isEditor && (
              <button onClick={() => setModalOpen(true)}
                className="bg-green-600 hover:bg-green-700 text-white text-sm font-semibold px-4 py-1.5 rounded-lg">
                + Assign Asset
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <StatCard label="Total" value={assignments.length} color="blue" />
          <StatCard label="Active Loans" value={statusCounts.Active} color="green" />
          <StatCard label="Returned" value={statusCounts.Returned} color="gray" />
        </div>

        <DataTable columns={columns} rows={filtered} loading={loading} emptyText="No assignments found" />
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Assign Asset to User">
        <div className="flex flex-col gap-3">
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Asset (Available only) *</label>
            <select value={form.assetId} onChange={e=>setForm({...form,assetId:e.target.value})} className={inp}>
              <option value="">Select asset</option>
              {assets.map(a=><option key={a._id} value={a._id}>{a.assetTag} — {a.name} ({a.category})</option>)}
            </select>
            {assets.length === 0 && <p className="text-xs text-orange-500 mt-1">No available assets</p>}
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Assign To *</label>
            <select value={form.userId} onChange={e=>setForm({...form,userId:e.target.value})} className={inp}>
              <option value="">Select user</option>
              {users.map(u=><option key={u._id} value={u._id}>{u.username}{u.fullName?` (${u.fullName})`:''}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Notes</label>
            <input placeholder="Optional notes" value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})} className={inp} />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={() => setModalOpen(false)} className="px-4 py-2 text-sm rounded-lg border border-gray-300 hover:bg-gray-50">Cancel</button>
          <button onClick={handleAssign} className="px-4 py-2 text-sm rounded-lg bg-green-600 text-white hover:bg-green-700 font-semibold">Assign</button>
        </div>
      </Modal>
    </Layout>
  )
}
