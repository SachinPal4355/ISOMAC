import { useEffect, useState } from 'react'
import { getAssets, getAssignments, getMaintenanceLogs, getLicenses } from '../services/api'
import Layout from '../components/Layout'
import SidebarSection from '../components/SidebarSection'
import DataTable from '../components/DataTable'
import Badge from '../components/Badge'
import StatCard from '../components/StatCard'

const REPORT_TYPES = [
  { value:'assets',      label:'Assets Report' },
  { value:'assignments', label:'Loans Report' },
  { value:'maintenance', label:'Maintenance Report' },
  { value:'licenses',    label:'License Report' },
]

function escapeCsv(v) {
  const s = String(v ?? '')
  return s.includes('"')||s.includes(',')||s.includes('\n') ? `"${s.replace(/"/g,'""')}"` : s
}

function downloadCSV(headers, rows, filename) {
  const csv = '\uFEFF'+[headers,...rows].map(r=>r.map(escapeCsv).join(',')).join('\r\n')
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8;'}))
  a.download = filename; a.click()
}

export default function Reports() {
  const [reportType, setReportType] = useState('assets')
  const [data, setData]     = useState({ assets:[], assignments:[], maintenance:[], licenses:[] })
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    try {
      const [aRes, asgRes, mRes, lRes] = await Promise.all([
        getAssets(), getAssignments(), getMaintenanceLogs(), getLicenses()
      ])
      setData({
        assets:      Array.isArray(aRes.data)   ? aRes.data   : [],
        assignments: Array.isArray(asgRes.data) ? asgRes.data : [],
        maintenance: Array.isArray(mRes.data)   ? mRes.data   : [],
        licenses:    Array.isArray(lRes.data)   ? lRes.data   : [],
      })
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  const configs = {
    assets: {
      label: 'Assets',
      rows: data.assets,
      columns: [
        { key:'assetTag',  label:'Asset Tag', render: v => <span className="font-mono text-xs font-semibold">{v}</span> },
        { key:'name',      label:'Name' },
        { key:'category',  label:'Category' },
        { key:'brand',     label:'Brand', render: v=>v||'—' },
        { key:'serialno',  label:'Serial', render: v=><span className="font-mono text-xs">{v||'—'}</span> },
        { key:'status',    label:'Status', render: v=><Badge label={v} /> },
        { key:'location',  label:'Location', render: v=>v||'—' },
        { key:'purchaseCost', label:'Cost', render: v=>v?`₹${Number(v).toLocaleString()}`:'—' },
      ],
      exportFn: (rows) => downloadCSV(
        ['Asset Tag','Name','Category','Brand','Model','Serial','Status','Location','Cost','Purchase Date','Warranty Expiry'],
        rows.map(r=>[r.assetTag,r.name,r.category,r.brand,r.model,r.serialno,r.status,r.location,r.purchaseCost,
          r.purchaseDate?new Date(r.purchaseDate).toLocaleDateString():'',
          r.warrantyExpiry?new Date(r.warrantyExpiry).toLocaleDateString():'']),
        'Assets_Report.csv'
      )
    },
    assignments: {
      label: 'Loans',
      rows: data.assignments,
      columns: [
        { key:'asset',      label:'Asset', sortable:false, render:(_,r)=><span className="font-mono text-xs font-semibold">{r.asset?.assetTag}</span> },
        { key:'_name',      label:'Asset Name', sortable:false, render:(_,r)=>r.asset?.name||'—' },
        { key:'assignedTo', label:'User', sortable:false, render:(_,r)=>r.assignedTo?.fullName||r.assignedTo?.username||'—' },
        { key:'assignedAt', label:'Assigned', render: v=>v?new Date(v).toLocaleDateString():'—' },
        { key:'returnedAt', label:'Returned', render: v=>v?new Date(v).toLocaleDateString():'—' },
        { key:'status',     label:'Status', render: v=><Badge label={v} /> },
      ],
      exportFn: (rows) => downloadCSV(
        ['Asset Tag','Asset Name','Assigned To','Email','Assigned By','Assigned At','Returned At','Status','Notes'],
        rows.map(r=>[r.asset?.assetTag,r.asset?.name,r.assignedTo?.username,r.assignedTo?.email,
          r.assignedBy?.username,
          r.assignedAt?new Date(r.assignedAt).toLocaleDateString():'',
          r.returnedAt?new Date(r.returnedAt).toLocaleDateString():'',
          r.status,r.notes||'']),
        'Loans_Report.csv'
      )
    },
    maintenance: {
      label: 'Maintenance',
      rows: data.maintenance,
      columns: [
        { key:'asset',       label:'Asset', sortable:false, render:(_,r)=><span className="font-mono text-xs font-semibold">{r.asset?.assetTag}</span> },
        { key:'type',        label:'Type' },
        { key:'description', label:'Description', render: v=><span className="text-xs">{v}</span> },
        { key:'performedBy', label:'Technician', render: v=>v||'—' },
        { key:'cost',        label:'Cost', render: v=>v?`₹${Number(v).toLocaleString()}`:'—' },
        { key:'status',      label:'Status', render: v=><Badge label={v} /> },
        { key:'completedDate',label:'Completed', render: v=>v?new Date(v).toLocaleDateString():'—' },
      ],
      exportFn: (rows) => downloadCSV(
        ['Asset Tag','Asset Name','Type','Description','Technician','Cost','Status','Scheduled','Completed'],
        rows.map(r=>[r.asset?.assetTag,r.asset?.name,r.type,r.description,r.performedBy,r.cost,r.status,
          r.scheduledDate?new Date(r.scheduledDate).toLocaleDateString():'',
          r.completedDate?new Date(r.completedDate).toLocaleDateString():'']),
        'Maintenance_Report.csv'
      )
    },
    licenses: {
      label: 'Licenses',
      rows: data.licenses,
      columns: [
        { key:'softwareName', label:'Software', render: v=><span className="font-semibold">{v}</span> },
        { key:'vendor',       label:'Vendor', render: v=>v||'—' },
        { key:'licenseType',  label:'Type' },
        { key:'seats',        label:'Seats', render:(v,r)=>`${r.usedSeats}/${v}` },
        { key:'status',       label:'Status', render: v=><Badge label={v} /> },
        { key:'expiryDate',   label:'Expiry', render: v=>v?new Date(v).toLocaleDateString():'—' },
      ],
      exportFn: (rows) => downloadCSV(
        ['Software','Vendor','Type','Total Seats','Used Seats','Cost','Status','Purchase Date','Expiry Date'],
        rows.map(r=>[r.softwareName,r.vendor,r.licenseType,r.seats,r.usedSeats,r.cost,r.status,
          r.purchaseDate?new Date(r.purchaseDate).toLocaleDateString():'',
          r.expiryDate?new Date(r.expiryDate).toLocaleDateString():'']),
        'Licenses_Report.csv'
      )
    }
  }

  const cfg = configs[reportType]
  const filtered = cfg.rows.filter(row => {
    if (!search) return true
    return JSON.stringify(row).toLowerCase().includes(search.toLowerCase())
  })

  const sidebar = (
    <SidebarSection title="Report Type"
      items={REPORT_TYPES.map(r=>({ label:r.label, value:r.value, count:data[r.value]?.length }))}
      selected={reportType} onSelect={v => { setReportType(v); setSearch('') }} />
  )

  return (
    <Layout sidebar={sidebar}>
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-bold text-gray-800">Reports — {cfg.label}</h1>
            <p className="text-xs text-gray-400 mt-0.5">{filtered.length} records</p>
          </div>
          <div className="flex gap-2">
            <input placeholder="Search all fields..." value={search} onChange={e=>setSearch(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400 w-52" />
            <button onClick={() => cfg.exportFn(filtered)}
              className="border border-green-600 text-green-700 text-sm px-4 py-1.5 rounded-lg hover:bg-green-50 font-medium">
              Export CSV
            </button>
          </div>
        </div>

        {/* Summary stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {REPORT_TYPES.map((r,i) => {
            const colors = ['blue','yellow','purple','red']
            return <StatCard key={r.value} label={r.label.replace(' Report','')} value={data[r.value]?.length} color={colors[i]} />
          })}
        </div>

        <DataTable columns={cfg.columns} rows={filtered} loading={loading} emptyText={`No ${cfg.label.toLowerCase()} data`} />
      </div>
    </Layout>
  )
}
