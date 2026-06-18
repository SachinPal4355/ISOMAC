import { useEffect, useState } from 'react'
import { getInventory, addInventory, updateInventory } from '../services/api'
import Layout from '../components/Layout'
import SidebarSection from '../components/SidebarSection'
import DataTable from '../components/DataTable'
import Badge from '../components/Badge'
import Modal from '../components/Modal'
import StatCard from '../components/StatCard'

const STATUSES = ['In Stock','Active','Disposed','Expired','Missing','Reassigned and Active','Repair']
const ITEMS    = ['Laptop','Monitor','Headset','Mouse','Keyboard','Docking Station','MacBook','Mac Mini','iMac']

function warrantyStatus(purchaseDate) {
  if (!purchaseDate) return 'none'
  const expiry = new Date(purchaseDate)
  expiry.setFullYear(expiry.getFullYear() + 3)
  return expiry < new Date() ? 'expired' : 'valid'
}

function escapeCsv(v) {
  const s = String(v ?? '')
  return s.includes('"')||s.includes(',')||s.includes('\n') ? `"${s.replace(/"/g,'""')}"` : s
}

export default function Inventory() {
  const [items, setItems]       = useState([])
  const [loading, setLoading]   = useState(true)
  const [catFilter, setCatFilter] = useState('All')
  const [statusFilter, setStatusFilter] = useState('All')
  const [search, setSearch]     = useState('')
  const [warrantyFilter, setWarrantyFilter] = useState('All')

  // Add form modal
  const [addOpen, setAddOpen]   = useState(false)
  const [form, setForm]         = useState({ itemName:'', serialno:'', purchaseDate:'', status:'In Stock' })

  // Quick update modal
  const [updateOpen, setUpdateOpen] = useState(false)
  const [quickSerial, setQuickSerial] = useState('')
  const [quick, setQuick]       = useState({ itemName:'', serialno:'', name:'', email:'', purchaseDate:'', status:'', comment:'' })

  useEffect(() => { load() }, [])

  async function load() {
    try { const r = await getInventory(); setItems(Array.isArray(r.data) ? r.data : []) }
    catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  async function handleAdd() {
    if (!form.itemName||!form.serialno||!form.status) return alert('Item Name, Serial No and Status required')
    try {
      await addInventory({ ...form, name:'-', email:'-', actionType:'Add' })
      setAddOpen(false)
      setForm({ itemName:'', serialno:'', purchaseDate:'', status:'In Stock' })
      load()
    } catch (e) { alert('❌ '+(e.response?.data?.message||'Failed to add')) }
  }

  async function handleQuickSearch() {
    const serial = quickSerial.trim()
    if (!serial) return alert('Enter a serial number')
    const match = items.filter(i => (i.serialno||'').toLowerCase() === serial.toLowerCase())
      .sort((a,b) => new Date(b.createdAt)-new Date(a.createdAt))
    if (!match.length) return alert('No record found')
    const l = match[0]
    setQuick({ itemName:l.itemName||'', serialno:l.serialno||'', name:l.name||'', email:l.email||'',
      purchaseDate:l.purchaseDate?l.purchaseDate.split('T')[0]:'', status:l.status||'', comment:'' })
  }

  async function handleQuickUpdate() {
    if (!quick.serialno) return alert('Serial number required')
    if (!quick.comment)  return alert('Comment is required before updating')
    try {
      await updateInventory(quick.serialno, { itemName:quick.itemName, name:quick.name, email:quick.email,
        purchaseDate:quick.purchaseDate||null, status:quick.status, comment:quick.comment })
      setUpdateOpen(false); load()
    } catch (e) { alert('❌ '+(e.response?.data?.message||'Update failed')) }
  }

  function exportCSV() {
    const headers = ['Item Name','Serial No','Name','Email','Purchase Date','Status','Warranty','Entry Date','Action','Comment']
    const rows = filtered.map(i => [
      i.itemName, i.serialno, i.name, i.email,
      i.purchaseDate ? new Date(i.purchaseDate).toLocaleDateString() : '-',
      i.status, warrantyStatus(i.purchaseDate),
      i.createdAt ? new Date(i.createdAt).toLocaleString('en-IN') : '-',
      i.actionType||'Add', i.comment||''
    ])
    const csv = '\uFEFF'+[headers,...rows].map(r=>r.map(escapeCsv).join(',')).join('\r\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8;'}))
    a.download = 'InventoryData.csv'; a.click()
  }

  // Sidebar counts
  const itemCounts = {}
  ITEMS.forEach(it => { itemCounts[it] = items.filter(i=>(i.itemName||'').toLowerCase().includes(it.toLowerCase())).length })
  const statusCounts = {}
  STATUSES.forEach(s => { statusCounts[s] = items.filter(i=>i.status===s).length })

  const filtered = items.filter(i => {
    const ws = warrantyStatus(i.purchaseDate)
    const matchCat    = catFilter === 'All' || (i.itemName||'').toLowerCase().includes(catFilter.toLowerCase())
    const matchStatus = statusFilter === 'All' || i.status === statusFilter
    const matchW      = warrantyFilter === 'All' || ws === warrantyFilter
    const matchSearch = !search || [i.itemName,i.serialno,i.name,i.email]
      .some(v=>(v||'').toLowerCase().includes(search.toLowerCase()))
    return matchCat && matchStatus && matchW && matchSearch
  })

  const columns = [
    { key:'itemName',   label:'Item Name' },
    { key:'serialno',   label:'Serial No', render: v => <span className="font-mono text-xs">{v}</span> },
    { key:'name',       label:'Assigned To' },
    { key:'email',      label:'Email', render: v => <span className="text-xs">{v||'—'}</span> },
    { key:'purchaseDate', label:'Purchase Date', render: v => v ? new Date(v).toLocaleDateString() : '—' },
    { key:'status',     label:'Status', render: v => <Badge label={v} /> },
    { key:'purchaseDate', label:'Warranty', sortable: false, render: (v) => {
      const ws = warrantyStatus(v)
      if (ws === 'none') return '—'
      return <span className={`text-lg ${ws==='expired'?'text-red-500':'text-green-500'}`}>●</span>
    }},
    { key:'createdAt',  label:'Entry Date', render: v => v ? new Date(v).toLocaleString('en-IN',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}) : '—' },
    { key:'actionType', label:'Action', render: v => <span className={`text-xs font-semibold ${v==='Updated'?'text-orange-500':'text-green-600'}`}>{v||'Add'}</span> },
    { key:'comment',    label:'Comment', render: v => <span className="text-xs">{v||'—'}</span> },
  ]

  const inp = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400'

  const sidebar = (
    <div>
      <SidebarSection title="Item Type"
        items={[{label:'All',value:'All',count:items.length},...ITEMS.map(it=>({label:it,value:it,count:itemCounts[it]}))] }
        selected={catFilter} onSelect={setCatFilter} />
      <SidebarSection title="Status"
        items={[{label:'All',value:'All',count:items.length},...STATUSES.map(s=>({label:s,value:s,count:statusCounts[s]}))]}
        selected={statusFilter} onSelect={setStatusFilter} />
      <SidebarSection title="Warranty"
        items={[{label:'All',value:'All'},{label:'Valid 🟢',value:'valid'},{label:'Expired 🔴',value:'expired'}]}
        selected={warrantyFilter} onSelect={setWarrantyFilter} />
    </div>
  )

  return (
    <Layout sidebar={sidebar}>
      <div className="flex flex-col gap-4">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-bold text-gray-800">Inventory</h1>
            <p className="text-xs text-gray-400 mt-0.5">{filtered.length} of {items.length} entries</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <input placeholder="Search..." value={search} onChange={e=>setSearch(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400 w-44" />
            <button onClick={() => setUpdateOpen(true)}
              className="border border-gray-300 text-gray-700 text-sm px-3 py-1.5 rounded-lg hover:bg-gray-50">
              Quick Update
            </button>
            <button onClick={exportCSV}
              className="border border-green-600 text-green-700 text-sm px-3 py-1.5 rounded-lg hover:bg-green-50">
              Export CSV
            </button>
            <button onClick={() => setAddOpen(true)}
              className="bg-green-600 hover:bg-green-700 text-white text-sm font-semibold px-4 py-1.5 rounded-lg">
              + Add Item
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="Total Entries" value={items.length} color="blue" />
          <StatCard label="Unique Serials" value={new Set(items.map(i=>i.serialno).filter(Boolean)).size} color="green" />
          <StatCard label="Active" value={items.filter(i=>i.status==='Active').length} color="yellow" />
          <StatCard label="In Stock" value={items.filter(i=>i.status==='In Stock').length} color="gray" />
        </div>

        <DataTable columns={columns} rows={filtered} loading={loading} emptyText="No inventory entries match your filters" />
      </div>

      {/* Add Modal */}
      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Add Inventory Item">
        <div className="flex flex-col gap-3">
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Item Name *</label>
            <select value={form.itemName} onChange={e=>setForm({...form,itemName:e.target.value})} className={inp}>
              <option value="">Select item</option>
              {ITEMS.map(i=><option key={i}>{i}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Serial No *</label>
            <input placeholder="Serial No" value={form.serialno} onChange={e=>setForm({...form,serialno:e.target.value})} className={inp} />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Purchase Date</label>
            <input type="date" value={form.purchaseDate} onChange={e=>setForm({...form,purchaseDate:e.target.value})} className={inp} />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Status *</label>
            <select value={form.status} onChange={e=>setForm({...form,status:e.target.value})} className={inp}>
              {STATUSES.map(s=><option key={s}>{s}</option>)}
            </select>
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={() => setAddOpen(false)} className="px-4 py-2 text-sm rounded-lg border border-gray-300 hover:bg-gray-50">Cancel</button>
          <button onClick={handleAdd} className="px-4 py-2 text-sm rounded-lg bg-green-600 text-white hover:bg-green-700 font-semibold">Add Item</button>
        </div>
      </Modal>

      {/* Quick Update Modal */}
      <Modal open={updateOpen} onClose={() => setUpdateOpen(false)} title="Quick Update" width="max-w-xl">
        <div className="flex gap-2 mb-4">
          <input placeholder="Enter Serial Number..." value={quickSerial} onChange={e=>setQuickSerial(e.target.value)}
            className={inp} />
          <button onClick={handleQuickSearch} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700 whitespace-nowrap">
            Fetch
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {[['itemName','Item Name'],['serialno','Serial No'],['name','Assigned To'],['email','Email']].map(([f,p])=>(
            <div key={f}>
              <label className="text-xs text-gray-500 mb-1 block">{p}</label>
              <input value={quick[f]} onChange={e=>setQuick({...quick,[f]:e.target.value})} className={inp} />
            </div>
          ))}
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Purchase Date</label>
            <input type="date" value={quick.purchaseDate} onChange={e=>setQuick({...quick,purchaseDate:e.target.value})} className={inp} />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Status</label>
            <select value={quick.status} onChange={e=>setQuick({...quick,status:e.target.value})} className={inp}>
              <option value="">Select status</option>
              {STATUSES.map(s=><option key={s}>{s}</option>)}
            </select>
          </div>
          <div className="col-span-2">
            <label className="text-xs text-gray-500 mb-1 block">Comment * (required)</label>
            <input placeholder="Reason for update..." maxLength={100} value={quick.comment}
              onChange={e=>setQuick({...quick,comment:e.target.value})} className={inp} />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={() => setUpdateOpen(false)} className="px-4 py-2 text-sm rounded-lg border border-gray-300 hover:bg-gray-50">Cancel</button>
          <button onClick={handleQuickUpdate} className="px-4 py-2 text-sm rounded-lg bg-green-600 text-white hover:bg-green-700 font-semibold">Update</button>
        </div>
      </Modal>
    </Layout>
  )
}
