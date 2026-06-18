import { useEffect, useState } from 'react'
import { getLicenses, createLicense, updateLicense, deleteLicense } from '../services/api'
import Layout from '../components/Layout'
import SidebarSection from '../components/SidebarSection'
import DataTable from '../components/DataTable'
import Badge from '../components/Badge'
import Modal from '../components/Modal'
import StatCard from '../components/StatCard'
import { useAuth } from '../context/AuthContext'

const LICENSE_TYPES = ['Perpetual','Subscription','OEM','Open Source']
const STATUSES      = ['Active','Expired','Cancelled']
const EF = { softwareName:'', licenseKey:'', vendor:'', licenseType:'Subscription', seats:1, usedSeats:0, purchaseDate:'', expiryDate:'', cost:'', status:'Active', notes:'' }

function expiryInfo(expiryDate, status) {
  if (status === 'Cancelled') return { label:'Cancelled', color:'gray' }
  if (!expiryDate) return { label:'No Expiry', color:'blue' }
  const days = Math.ceil((new Date(expiryDate) - new Date()) / 86400000)
  if (days < 0)   return { label:'Expired',       color:'red' }
  if (days <= 30) return { label:`${days}d left`,  color:'red' }
  if (days <= 90) return { label:`${days}d left`,  color:'yellow' }
  return              { label:`${days}d left`,      color:'green' }
}

export default function Licenses() {
  const { isEditor, isAdmin } = useAuth()
  const [licenses, setLicenses] = useState([])
  const [typeFilter, setTypeFilter]     = useState('All')
  const [statusFilter, setStatusFilter] = useState('All')
  const [search, setSearch]     = useState('')
  const [form, setForm]         = useState(EF)
  const [editId, setEditId]     = useState(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [loading, setLoading]   = useState(true)

  useEffect(() => { load() }, [])

  async function load() {
    try {
      const r = await getLicenses()
      const list = Array.isArray(r.data?.data) ? r.data.data : (Array.isArray(r.data) ? r.data : [])
      setLicenses(list)
    }
    catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  function openAdd() { setForm(EF); setEditId(null); setModalOpen(true) }
  function openEdit(l) {
    setEditId(l._id)
    setForm({ softwareName:l.softwareName||'', licenseKey:l.licenseKey||'', vendor:l.vendor||'',
      licenseType:l.licenseType||'Subscription', seats:l.seats||1, usedSeats:l.usedSeats||0,
      purchaseDate:l.purchaseDate?l.purchaseDate.split('T')[0]:'',
      expiryDate:l.expiryDate?l.expiryDate.split('T')[0]:'',
      cost:l.cost||'', status:l.status||'Active', notes:l.notes||'' })
    setModalOpen(true)
  }

  async function handleSubmit() {
    if (!form.softwareName) return alert('Software Name required')
    try {
      if (editId) await updateLicense(editId, form)
      else await createLicense(form)
      setModalOpen(false); load()
    } catch (e) { alert('❌ '+(e.response?.data?.message||e.message)) }
  }

  async function handleDelete(id) {
    if (!window.confirm('Delete this license?')) return
    try { await deleteLicense(id); load() }
    catch (e) { alert('❌ '+(e.response?.data?.message||e.message)) }
  }

  const typeCounts = {}
  ;['All',...LICENSE_TYPES].forEach(t => { typeCounts[t] = t==='All' ? licenses.length : licenses.filter(l=>l.licenseType===t).length })
  const statusCounts = {}
  ;['All',...STATUSES].forEach(s => { statusCounts[s] = s==='All' ? licenses.length : licenses.filter(l=>l.status===s).length })

  const filtered = licenses.filter(l => {
    const matchType   = typeFilter === 'All' || l.licenseType === typeFilter
    const matchStatus = statusFilter === 'All' || l.status === statusFilter
    const matchSearch = !search || [l.softwareName,l.vendor,l.licenseKey]
      .some(v=>(v||'').toLowerCase().includes(search.toLowerCase()))
    return matchType && matchStatus && matchSearch
  })

  const expiringSoon = licenses.filter(l => {
    if (!l.expiryDate || l.status !== 'Active') return false
    const d = Math.ceil((new Date(l.expiryDate)-new Date())/86400000)
    return d >= 0 && d <= 30
  }).length

  const columns = [
    { key:'softwareName', label:'Software', render: v => <span className="font-semibold">{v}</span> },
    { key:'vendor',       label:'Vendor', render: v => v||'—' },
    { key:'licenseType',  label:'Type' },
    { key:'seats',        label:'Seats', render:(v,r) => {
      const pct = v > 0 ? Math.round((r.usedSeats/v)*100) : 0
      return <div className="flex flex-col gap-1 min-w-16">
        <span className="text-xs">{r.usedSeats}/{v}</span>
        <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
          <div className={`h-full rounded-full ${pct>=90?'bg-red-500':pct>=70?'bg-yellow-400':'bg-green-500'}`}
            style={{width:`${Math.min(pct,100)}%`}} />
        </div>
      </div>
    }},
    { key:'cost',         label:'Cost', render: v => v ? `₹${Number(v).toLocaleString()}` : '—' },
    { key:'purchaseDate', label:'Purchased', render: v => v ? new Date(v).toLocaleDateString() : '—' },
    { key:'expiryDate',   label:'Expiry', render:(v,r) => {
      const info = expiryInfo(v, r.status)
      const cls = {green:'text-green-600',yellow:'text-yellow-600',red:'text-red-600',blue:'text-blue-600',gray:'text-gray-400'}
      return <span className={`text-xs font-semibold ${cls[info.color]}`}>{info.label}</span>
    }},
    { key:'status',       label:'Status', render: v => <Badge label={v} /> },
    { key:'_id',          label:'Actions', sortable:false, render:(_,r) => (
      isEditor && <div className="flex gap-1">
        <button onClick={() => openEdit(r)} className="text-xs bg-yellow-100 text-yellow-700 hover:bg-yellow-200 px-2 py-1 rounded font-medium">Edit</button>
        {isAdmin && <button onClick={() => handleDelete(r._id)} className="text-xs bg-red-100 text-red-700 hover:bg-red-200 px-2 py-1 rounded font-medium">Del</button>}
      </div>
    )}
  ]

  const inp = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400'

  const sidebar = (
    <div>
      <SidebarSection title="License Type"
        items={['All',...LICENSE_TYPES].map(t=>({label:t,value:t,count:typeCounts[t]}))}
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
            <h1 className="text-xl font-bold text-gray-800">Software Licenses</h1>
            <p className="text-xs text-gray-400 mt-0.5">{filtered.length} licenses</p>
          </div>
          <div className="flex gap-2">
            <input placeholder="Search..." value={search} onChange={e=>setSearch(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400 w-44" />
            {isEditor && (
              <button onClick={openAdd}
                className="bg-green-600 hover:bg-green-700 text-white text-sm font-semibold px-4 py-1.5 rounded-lg">
                + Add License
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="Total" value={licenses.length} color="blue" />
          <StatCard label="Active" value={statusCounts.Active||0} color="green" />
          <StatCard label="Expiring Soon" value={expiringSoon} color="yellow" />
          <StatCard label="Expired" value={statusCounts.Expired||0} color="red" />
        </div>

        <DataTable columns={columns} rows={filtered} loading={loading} emptyText="No licenses found" />
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editId ? 'Edit License' : 'Add License'} width="max-w-2xl">
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="text-xs text-gray-500 mb-1 block">Software Name *</label>
            <input placeholder="e.g. Microsoft Office 365" value={form.softwareName} onChange={e=>setForm({...form,softwareName:e.target.value})} className={inp} />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Vendor</label>
            <input placeholder="Vendor" value={form.vendor} onChange={e=>setForm({...form,vendor:e.target.value})} className={inp} />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">License Type</label>
            <select value={form.licenseType} onChange={e=>setForm({...form,licenseType:e.target.value})} className={inp}>
              {LICENSE_TYPES.map(t=><option key={t}>{t}</option>)}
            </select>
          </div>
          <div className="col-span-2">
            <label className="text-xs text-gray-500 mb-1 block">License Key</label>
            <input placeholder="License key" value={form.licenseKey} onChange={e=>setForm({...form,licenseKey:e.target.value})} className={inp} />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Total Seats</label>
            <input type="number" value={form.seats} onChange={e=>setForm({...form,seats:e.target.value})} className={inp} />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Used Seats</label>
            <input type="number" value={form.usedSeats} onChange={e=>setForm({...form,usedSeats:e.target.value})} className={inp} />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Cost (₹)</label>
            <input type="number" value={form.cost} onChange={e=>setForm({...form,cost:e.target.value})} className={inp} />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Status</label>
            <select value={form.status} onChange={e=>setForm({...form,status:e.target.value})} className={inp}>
              {STATUSES.map(s=><option key={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Purchase Date</label>
            <input type="date" value={form.purchaseDate} onChange={e=>setForm({...form,purchaseDate:e.target.value})} className={inp} />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Expiry Date</label>
            <input type="date" value={form.expiryDate} onChange={e=>setForm({...form,expiryDate:e.target.value})} className={inp} />
          </div>
          <div className="col-span-2">
            <label className="text-xs text-gray-500 mb-1 block">Notes</label>
            <input placeholder="Notes" value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})} className={inp} />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={() => setModalOpen(false)} className="px-4 py-2 text-sm rounded-lg border border-gray-300 hover:bg-gray-50">Cancel</button>
          <button onClick={handleSubmit} className="px-4 py-2 text-sm rounded-lg bg-green-600 text-white hover:bg-green-700 font-semibold">
            {editId ? 'Update' : 'Add License'}
          </button>
        </div>
      </Modal>
    </Layout>
  )
}
