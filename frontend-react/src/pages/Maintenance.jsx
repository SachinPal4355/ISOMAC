import { useEffect, useState } from 'react'
import { getMaintenanceLogs, createMaintenanceLog, updateMaintenanceLog, getAssets } from '../services/api'
import Layout from '../components/Layout'
import SidebarSection from '../components/SidebarSection'
import DataTable from '../components/DataTable'
import Badge from '../components/Badge'
import Modal from '../components/Modal'
import StatCard from '../components/StatCard'
import { useAuth } from '../context/AuthContext'

const TYPES    = ['Repair','Service','Inspection','Upgrade']
const STATUSES = ['Scheduled','In Progress','Completed']
const EF = { asset:'', type:'Repair', description:'', cost:'', performedBy:'', scheduledDate:'', completedDate:'', status:'Scheduled' }

export default function Maintenance() {
  const { isEditor } = useAuth()
  const [logs, setLogs]       = useState([])
  const [assets, setAssets]   = useState([])
  const [typeFilter, setTypeFilter]     = useState('All')
  const [statusFilter, setStatusFilter] = useState('All')
  const [search, setSearch]   = useState('')
  const [form, setForm]       = useState(EF)
  const [editId, setEditId]   = useState(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [])

  async function load() {
    try {
      const [lRes, aRes] = await Promise.all([getMaintenanceLogs(), getAssets()])
      setLogs(Array.isArray(lRes.data?.data) ? lRes.data.data : (Array.isArray(lRes.data) ? lRes.data : []))
      const assetList = Array.isArray(aRes.data?.data) ? aRes.data.data : (Array.isArray(aRes.data) ? aRes.data : [])
      setAssets(assetList)
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  function openAdd() { setForm(EF); setEditId(null); setModalOpen(true) }
  function openEdit(log) {
    setEditId(log._id)
    setForm({ asset:log.asset?._id||'', type:log.type||'Repair', description:log.description||'',
      cost:log.cost||'', performedBy:log.performedBy||'',
      scheduledDate:log.scheduledDate?log.scheduledDate.split('T')[0]:'',
      completedDate:log.completedDate?log.completedDate.split('T')[0]:'', status:log.status||'Scheduled' })
    setModalOpen(true)
  }

  async function handleSubmit() {
    if (!form.asset||!form.type||!form.description) return alert('Asset, Type and Description required')
    try {
      if (editId) await updateMaintenanceLog(editId, form)
      else await createMaintenanceLog(form)
      setModalOpen(false); load()
    } catch (e) { alert('❌ '+(e.response?.data?.message||e.message)) }
  }

  const typeCounts = {}
  ;['All',...TYPES].forEach(t => { typeCounts[t] = t==='All' ? logs.length : logs.filter(l=>l.type===t).length })
  const statusCounts = {}
  ;['All',...STATUSES].forEach(s => { statusCounts[s] = s==='All' ? logs.length : logs.filter(l=>l.status===s).length })

  const filtered = logs.filter(l => {
    const matchType   = typeFilter === 'All' || l.type === typeFilter
    const matchStatus = statusFilter === 'All' || l.status === statusFilter
    const matchSearch = !search || [l.asset?.assetTag,l.asset?.name,l.description,l.performedBy]
      .some(v=>(v||'').toLowerCase().includes(search.toLowerCase()))
    return matchType && matchStatus && matchSearch
  })

  const columns = [
    { key:'asset',        label:'Asset Tag', render:(_,r) => <span className="font-mono text-xs font-semibold">{r.asset?.assetTag||'—'}</span> },
    { key:'_name',        label:'Asset', sortable:false, render:(_,r) => r.asset?.name||'—' },
    { key:'type',         label:'Type', render: v => <span className="text-xs font-medium">{v}</span> },
    { key:'description',  label:'Description', render: v => <span className="text-xs max-w-xs block truncate" title={v}>{v}</span> },
    { key:'performedBy',  label:'Technician', render: v => v||'—' },
    { key:'cost',         label:'Cost', render: v => v ? `₹${Number(v).toLocaleString()}` : '—' },
    { key:'scheduledDate',label:'Scheduled', render: v => v ? new Date(v).toLocaleDateString() : '—' },
    { key:'completedDate',label:'Completed', render: v => v ? new Date(v).toLocaleDateString() : '—' },
    { key:'status',       label:'Status', render: v => <Badge label={v} /> },
    { key:'loggedBy',     label:'Logged By', render:(_,r) => r.loggedBy?.username||'—' },
    { key:'_id',          label:'Actions', sortable:false, render:(_,r) => (
      isEditor && <button onClick={() => openEdit(r)}
        className="text-xs bg-yellow-100 text-yellow-700 hover:bg-yellow-200 px-2 py-1 rounded font-medium">Edit</button>
    )}
  ]

  const inp = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400'

  const sidebar = (
    <div>
      <SidebarSection title="Type"
        items={['All',...TYPES].map(t=>({label:t,value:t,count:typeCounts[t]}))}
        selected={typeFilter} onSelect={setTypeFilter} />
      <SidebarSection title="Status"
        items={['All',...STATUSES].map(s=>({label:s,value:s,count:statusCounts[s]}))}
        selected={statusFilter} onSelect={setStatusFilter} />
    </div>
  )

  return (
    <Layout sidebar={sidebar}>
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-bold text-gray-800">Maintenance</h1>
            <p className="text-xs text-gray-400 mt-0.5">{filtered.length} records</p>
          </div>
          <div className="flex gap-2">
            <input placeholder="Search..." value={search} onChange={e=>setSearch(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400 w-44" />
            {isEditor && (
              <button onClick={openAdd}
                className="bg-green-600 hover:bg-green-700 text-white text-sm font-semibold px-4 py-1.5 rounded-lg">
                + Log Maintenance
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="Total Logs" value={logs.length} color="blue" />
          <StatCard label="Scheduled" value={statusCounts.Scheduled||0} color="yellow" />
          <StatCard label="In Progress" value={statusCounts['In Progress']||0} color="purple" />
          <StatCard label="Completed" value={statusCounts.Completed||0} color="green" />
        </div>

        <DataTable columns={columns} rows={filtered} loading={loading} emptyText="No maintenance logs found" />
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editId ? 'Edit Log' : 'Log Maintenance'} width="max-w-xl">
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="text-xs text-gray-500 mb-1 block">Asset *</label>
            <select value={form.asset} onChange={e=>setForm({...form,asset:e.target.value})} className={inp}>
              <option value="">Select asset</option>
              {assets.map(a=><option key={a._id} value={a._id}>{a.assetTag} — {a.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Type *</label>
            <select value={form.type} onChange={e=>setForm({...form,type:e.target.value})} className={inp}>
              {TYPES.map(t=><option key={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Status</label>
            <select value={form.status} onChange={e=>setForm({...form,status:e.target.value})} className={inp}>
              {STATUSES.map(s=><option key={s}>{s}</option>)}
            </select>
          </div>
          <div className="col-span-2">
            <label className="text-xs text-gray-500 mb-1 block">Description *</label>
            <input placeholder="Describe the work..." value={form.description} onChange={e=>setForm({...form,description:e.target.value})} className={inp} />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Technician</label>
            <input placeholder="Performed by" value={form.performedBy} onChange={e=>setForm({...form,performedBy:e.target.value})} className={inp} />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Cost (₹)</label>
            <input type="number" value={form.cost} onChange={e=>setForm({...form,cost:e.target.value})} className={inp} />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Scheduled Date</label>
            <input type="date" value={form.scheduledDate} onChange={e=>setForm({...form,scheduledDate:e.target.value})} className={inp} />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Completed Date</label>
            <input type="date" value={form.completedDate} onChange={e=>setForm({...form,completedDate:e.target.value})} className={inp} />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={() => setModalOpen(false)} className="px-4 py-2 text-sm rounded-lg border border-gray-300 hover:bg-gray-50">Cancel</button>
          <button onClick={handleSubmit} className="px-4 py-2 text-sm rounded-lg bg-green-600 text-white hover:bg-green-700 font-semibold">
            {editId ? 'Update' : 'Create Log'}
          </button>
        </div>
      </Modal>
    </Layout>
  )
}
