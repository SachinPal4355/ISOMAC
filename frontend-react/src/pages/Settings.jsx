import { useState, useEffect, useCallback, useRef, Fragment } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import Layout from '../components/Layout'
import DataTable from '../components/DataTable'
import Badge from '../components/Badge'
import StatCard from '../components/StatCard'
import SidebarSection from '../components/SidebarSection'
import { useAuth } from '../context/AuthContext'
import FieldManagementPanel from './settings/FieldManagementPanel'
import AssetFieldConfig from './assets/AssetFieldConfig'
import {
  register, getUsers, updateUserRole, deleteUser, runAlertChecks,
  getAlerts, markAlertRead, markAllAlertsRead, deleteAlert,
  getAssets, getAssignments, getMaintenanceLogs, getLicenses,
  downloadTemplate, previewImport, commitImport,
  getRegions, exportEmployees, exportAssets,
  getDynamicFields, getFieldSchema, migrateFromInventory,
  getAssetCategories, createAssetCategory, updateAssetCategory, deleteAssetCategory,
  reclassifyAssets, getAuthAuditLogs, getAuthAuditActions, getAuditLogs,
  getGoogleUsers,
  mfaSetup, mfaVerify, mfaDisable, mfaStatus,
  getTenants, changePassword,
} from '../services/api'

// --- Constants ---
const ROLES_SUPER_ADMIN = ['admin', 'editor', 'viewer']
const ROLES_ADMIN       = ['editor', 'viewer']
const ASSET_STATUSES = ['Available','Assigned','In Repair','Retired','Missing']

// Module-level cache so multiple components share one fetch per page load
let _catCache = null
function useCategoryNames() {
  const [cats, setCats] = useState(_catCache || [])
  useEffect(() => {
    if (_catCache) return
    getAssetCategories()
      .then(r => { _catCache = Array.isArray(r.data?.data) ? r.data.data.map(c => c.name) : []; setCats(_catCache) })
      .catch(() => {})
  }, [])
  return cats
}

// SVG icon components for sidebar — avoids emoji rendering issues
const SidebarIcons = {
  users:          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>,
  'alert-config': <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>,
  'view-alerts':  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>,
  'import-export':<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>,
  reports:        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>,
  categories:     <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" /></svg>,
  'field-management': <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" /></svg>,
  migration:      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" /></svg>,
  system:         <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
  mfa:            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>,
  'auth-logs':    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>,
  'audit-logs':   <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>,
  'google-users': <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>,
}

const SIDEBAR_ITEMS = [
  { key: 'users',            label: 'User Management',     adminOnly: true },
  { key: 'alert-config',     label: 'Alert Configuration', editorOnly: true },
  { key: 'view-alerts',      label: 'View Alerts' },
  { key: 'import-export',    label: 'Import / Export',     editorOnly: true },
  { key: 'reports',          label: 'Reports' },
  { key: 'categories',       label: 'Categories',          editorOnly: true },
  { key: 'field-management', label: 'Field Management',    adminOnly: true },
  { key: 'migration',        label: 'Data Migration',      adminOnly: true },
  { key: 'system',           label: 'System Info' },
  { key: 'mfa',              label: 'Two-Factor Auth' },
  { key: 'auth-logs',        label: 'Auth Logs',           superAdminOnly: true },
  { key: 'audit-logs',       label: 'Audit Logs',          superAdminOnly: true },
  { key: 'google-users',     label: 'Google Users',        superAdminOnly: true },
]

const inp = 'w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

// --- CSV helper ---
function escapeCsv(v) {
  const s = String(v ?? '')
  return s.includes('"') || s.includes(',') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s
}
function downloadCSV(headers, rows, filename) {
  const csv = '\uFEFF' + [headers, ...rows].map(r => r.map(escapeCsv).join(',')).join('\r\n')
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }))
  a.download = filename; a.click()
}

// --- Import sub-components ---
const IMPORT_MODULES = [
  { value: 'assets',       label: 'Assets',       icon: null, desc: 'Import IT assets with tag, category, serial, location' },
  { value: 'accessories',  label: 'Accessories',  icon: null, desc: 'Import peripherals — mouse, keyboard, monitor, etc.' },
  { value: 'locations',    label: 'Locations',    icon: null, desc: 'Import location hierarchy' },
  { value: 'employees',    label: 'Employees',    icon: null, desc: 'Bulk import employee records with optional asset linking' },
]
const STEPS = ['Select Module', 'Upload File', 'Preview & Validate', 'Result']

function StepBar({ step }) {
  return (
    <div className="flex items-center gap-0 mb-5">
      {STEPS.map((s, i) => (
        <div key={s} className="flex items-center flex-1 last:flex-none">
          <div className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-semibold
            ${i < step ? 'text-blue-700' : i === step ? 'bg-blue-600 text-white' : 'text-gray-400'}`}>
            <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0
              ${i < step ? 'bg-blue-100 text-blue-700' : i === step ? 'bg-white text-blue-700' : 'bg-gray-100 text-gray-400'}`}>
              {i < step ? '✓' : i + 1}
            </span>
            {s}
          </div>
          {i < STEPS.length - 1 && <div className={`flex-1 h-0.5 mx-1 ${i < step ? 'bg-blue-400' : 'bg-gray-200'}`} />}
        </div>
      ))}
    </div>
  )
}

function DropZone({ onFile, file }) {
  const ref = useRef()
  const [drag, setDrag] = useState(false)
  return (
    <div onDragOver={e => { e.preventDefault(); setDrag(true) }} onDragLeave={() => setDrag(false)}
      onDrop={e => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f) onFile(f) }}
      onClick={() => ref.current.click()}
      className={`border-2 border-dashed rounded-md p-8 text-center cursor-pointer transition-colors
        ${drag ? 'border-blue-500 bg-blue-50' : file ? 'border-blue-400 bg-blue-50' : 'border-gray-300 hover:border-blue-400 hover:bg-gray-50'}`}>
      <input ref={ref} type="file" accept=".csv,.xlsx,.xls" className="hidden"
        onChange={e => e.target.files[0] && onFile(e.target.files[0])} />
      {file ? (
        <div className="flex flex-col items-center gap-1">
          <svg className="w-8 h-8 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          <p className="text-sm font-semibold text-blue-700">{file.name}</p>
          <p className="text-xs text-gray-400">{(file.size / 1024).toFixed(1)} KB — click to change</p>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-1">
          <svg className="w-8 h-8 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
          <p className="text-sm font-semibold text-gray-600">Drag & drop or click to browse</p>
          <p className="text-xs text-gray-400">CSV or XLSX, max 10 MB</p>
        </div>
      )}
    </div>
  )
}

// --- Main Settings component ---
export default function Settings() {
  const { isAdmin, isEditor, isSuperAdmin, user } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()

  const urlTab = new URLSearchParams(location.search).get('tab')
  const defaultTab = urlTab || (isAdmin ? 'users' : isEditor ? 'alert-config' : 'view-alerts')
  const [tab, setTab] = useState(defaultTab)

  useEffect(() => {
    if (urlTab) setTab(urlTab)
  }, [urlTab])

  function goTab(key) {
    setTab(key)
    navigate(`/settings?tab=${key}`, { replace: true })
  }

  const visibleItems = SIDEBAR_ITEMS.filter(i => {
    if (i.superAdminOnly) return isSuperAdmin
    if (i.adminOnly)      return isAdmin
    if (i.editorOnly)     return isEditor
    return true
  })

  return (
    <Layout>
      <div className="flex gap-5 min-h-[calc(100vh-8rem)]">
        {/* Sidebar */}
        <aside className="w-52 flex-shrink-0">
          <div className="bg-white rounded-md border border-gray-200 overflow-hidden sticky top-4">
            <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Control Center</p>
            </div>
            <nav className="py-1">
              {visibleItems.map(item => (
                <button key={item.key} onClick={() => goTab(item.key)}
                  className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-left transition-colors
                    ${tab === item.key
                      ? 'bg-blue-50 text-blue-700 font-semibold border-r-2 border-blue-600'
                      : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'}`}>
                  <span className={tab === item.key ? 'text-blue-600' : 'text-gray-400'}>
                    {SidebarIcons[item.key]}
                  </span>
                  {item.label}
                </button>
              ))}
            </nav>
          </div>
        </aside>

        {/* Right panel */}
        <div className="flex-1 min-w-0">
          {tab === 'users'            && isAdmin  && <UsersPanel />}
          {tab === 'alert-config'     && isEditor && <AlertConfigPanel />}
          {tab === 'view-alerts'      && <ViewAlertsPanel />}
          {tab === 'import-export'    && isEditor && <ImportExportPanel />}
          {tab === 'reports'          && <ReportsPanel />}
          {tab === 'categories'       && isEditor && <CategoriesPanel />}
          {tab === 'field-management' && isAdmin  && <FieldManagementPanel />}
          {tab === 'migration'        && isAdmin  && <MigrationPanel />}
          {tab === 'system'           && <SystemPanel user={user} />}
          {tab === 'mfa'              && <MfaPanel />}
          {tab === 'auth-logs'        && isSuperAdmin && <AuthLogsPanel />}
          {tab === 'audit-logs'       && isSuperAdmin && <AuditLogsPanel />}
          {tab === 'google-users'     && isSuperAdmin && <GoogleUsersPanel />}
        </div>
      </div>
    </Layout>
  )
}

// --- Users Panel ---
function UsersPanel() {
  const { user: currentUser, isSuperAdmin } = useAuth()
  // admin can only create editor/viewer; super_admin can create admin too
  const CREATE_ROLES = isSuperAdmin ? ['admin', 'editor', 'viewer'] : ['editor', 'viewer']

  const EMPTY_FORM = { username:'', password:'', role: CREATE_ROLES[0], fullName:'', email:'', department:'' }
  const [form, setForm]           = useState(EMPTY_FORM)
  const [msg, setMsg]             = useState({ text:'', ok:true })
  const [users, setUsers]         = useState([])
  const [tenants, setTenants]     = useState([])
  const [tenantFilter, setTenantFilter] = useState('all')
  const [usersLoading, setUsersLoading] = useState(true)
  const [roleErrors, setRoleErrors]     = useState({})
  const [deleting, setDeleting]         = useState(null)

  const EMPTY_ADMIN_FORM = { username:'', password:'', fullName:'', email:'', department:'' }
  const [adminModal, setAdminModal] = useState(false)
  const [adminForm, setAdminForm]   = useState(EMPTY_ADMIN_FORM)
  const [adminMsg, setAdminMsg]     = useState({ text:'', ok:true })

  async function loadUsers() {
    setUsersLoading(true)
    try {
      const res = await getUsers()
      setUsers(Array.isArray(res.data) ? res.data : [])
    } catch (e) { setUsers([]) } finally { setUsersLoading(false) }
  }

  useEffect(() => {
    loadUsers()
    if (isSuperAdmin) {
      getTenants().then(r => setTenants(Array.isArray(r.data?.data) ? r.data.data : [])).catch(() => {})
    }
  }, [isSuperAdmin])

  async function handleSubmit(e) {
    e.preventDefault()
    if (msg.submitting) return
    setMsg({ text:'', ok:true, submitting:true })
    try {
      await register(form.username, form.password, form.role, form.fullName, form.email, form.department)
      setMsg({ text:`User "${form.username}" created`, ok:true, submitting:false })
      setForm(EMPTY_FORM); loadUsers()
    } catch (e) { setMsg({ text: e.response?.data?.message || e.message, ok:false, submitting:false }) }
  }

  async function handleCreateAdmin(e) {
    e.preventDefault()
    if (adminMsg.submitting) return
    setAdminMsg({ text:'', ok:true, submitting:true })
    try {
      await register(adminForm.username, adminForm.password, 'admin', adminForm.fullName, adminForm.email, adminForm.department)
      setAdminMsg({ text:`Admin "${adminForm.username}" created`, ok:true, submitting:false })
      setAdminForm(EMPTY_ADMIN_FORM); loadUsers()
    } catch (e) { setAdminMsg({ text: e.response?.data?.message || e.message, ok:false, submitting:false }) }
  }

  async function handleRoleChange(userId, newRole) {
    setRoleErrors(prev => ({ ...prev, [userId]:'' }))
    try {
      await updateUserRole(userId, newRole)
      setUsers(prev => prev.map(u => u._id === userId ? { ...u, role:newRole } : u))
    } catch (e) { setRoleErrors(prev => ({ ...prev, [userId]: e.response?.data?.message || e.message })) }
  }

  async function handleDelete(u) {
    if (!window.confirm(`Delete "${u.username}"? This cannot be undone.`)) return
    setDeleting(u._id)
    try {
      await deleteUser(u._id)
      setUsers(prev => prev.filter(x => x._id !== u._id))
    } catch (e) {
      if (e.response?.status === 404) setUsers(prev => prev.filter(x => x._id !== u._id))
      else alert(e.response?.data?.message || e.message)
    } finally { setDeleting(null) }
  }

  const tenantName = (tid) => {
    if (!tid) return 'No Tenant'
    const t = tenants.find(t => String(t._id) === String(tid))
    return t?.name || String(tid).slice(-8)
  }

  const nonSuperUsers = users.filter(u => u.role !== 'super_admin')
  const tenantGroups = isSuperAdmin ? (() => {
    const map = {}
    nonSuperUsers.forEach(u => {
      const key = u.tenantId ? String(u.tenantId) : '__none__'
      if (!map[key]) map[key] = []
      map[key].push(u)
    })
    return map
  })() : null
  const tenantOptions = isSuperAdmin
    ? Array.from(new Set(nonSuperUsers.map(u => u.tenantId ? String(u.tenantId) : '__none__')))
    : []

  const ROLE_BADGE = {
    admin:'bg-red-100 text-red-700', company_admin:'bg-red-100 text-red-700',
    editor:'bg-blue-100 text-blue-700', viewer:'bg-gray-100 text-gray-600', employee:'bg-green-100 text-green-700',
  }

  return (
    <div className="flex flex-col gap-5">
      {isSuperAdmin && (
        <div className="flex justify-end">
          <button onClick={() => { setAdminModal(true); setAdminMsg({ text:'', ok:true }) }}
            className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3l3.5 3.5L12 2l3.5 4.5L19 3l-2 7H7L5 3z" /></svg>
            Create Admin
          </button>
        </div>
      )}

      {adminModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={e => e.target === e.currentTarget && setAdminModal(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-base font-semibold text-gray-800">Create Admin User</h3>
                <p className="text-xs text-gray-400 mt-0.5">Only super admin can create admin accounts.</p>
              </div>
              <button onClick={() => setAdminModal(false)} className="text-gray-400 hover:text-gray-600 text-xl"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
            </div>
            <form onSubmit={handleCreateAdmin} className="flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs text-gray-500 mb-1 block">Username *</label>
                  <input placeholder="username" value={adminForm.username} onChange={e=>setAdminForm({...adminForm,username:e.target.value})} className={inp} required /></div>
                <div><label className="text-xs text-gray-500 mb-1 block">Password *</label>
                  <input type="password" placeholder="password" value={adminForm.password} onChange={e=>setAdminForm({...adminForm,password:e.target.value})} className={inp} required /></div>
                <div><label className="text-xs text-gray-500 mb-1 block">Full Name</label>
                  <input placeholder="Full name" value={adminForm.fullName} onChange={e=>setAdminForm({...adminForm,fullName:e.target.value})} className={inp} /></div>
                <div><label className="text-xs text-gray-500 mb-1 block">Email</label>
                  <input type="email" placeholder="admin@company.com" value={adminForm.email} onChange={e=>setAdminForm({...adminForm,email:e.target.value})} className={inp} /></div>
                <div className="col-span-2"><label className="text-xs text-gray-500 mb-1 block">Department</label>
                  <input placeholder="Department" value={adminForm.department} onChange={e=>setAdminForm({...adminForm,department:e.target.value})} className={inp} /></div>
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-700">
                Admin users have full access within their tenant.
              </div>
              {adminMsg.text && (
                <p className={`text-xs px-3 py-2 rounded-lg border ${adminMsg.ok ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
                  {adminMsg.text}
                </p>
              )}
              <div className="flex gap-2 justify-end pt-1">
                <button type="button" onClick={() => setAdminModal(false)}
                  className="px-4 py-2 text-sm rounded-lg border border-gray-300 hover:bg-gray-50 text-gray-600">Cancel</button>
                <button type="submit" disabled={adminMsg.submitting}
                  className="px-5 py-2 text-sm rounded-lg bg-red-600 hover:bg-red-700 text-white font-semibold disabled:opacity-60">
                  {adminMsg.submitting ? 'Creating...' : 'Create Admin'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="bg-white rounded-md border border-gray-200 p-6">
        <h2 className="text-base font-semibold text-gray-800 mb-1">Create New User</h2>
        <p className="text-xs text-gray-400 mb-4">Add a new user account with role-based access.</p>
        <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-4">
          <div><label className="text-xs text-gray-500 mb-1 block">Username *</label>
            <input placeholder="username" value={form.username} onChange={e=>setForm({...form,username:e.target.value})} className={inp} required /></div>
          <div><label className="text-xs text-gray-500 mb-1 block">Password *</label>
            <input type="password" placeholder="password" value={form.password} onChange={e=>setForm({...form,password:e.target.value})} className={inp} required /></div>
          <div><label className="text-xs text-gray-500 mb-1 block">Full Name</label>
            <input placeholder="Full name" value={form.fullName} onChange={e=>setForm({...form,fullName:e.target.value})} className={inp} /></div>
          <div><label className="text-xs text-gray-500 mb-1 block">Email</label>
            <input type="email" placeholder="email@company.com" value={form.email} onChange={e=>setForm({...form,email:e.target.value})} className={inp} /></div>
          <div><label className="text-xs text-gray-500 mb-1 block">Department</label>
            <input placeholder="Department" value={form.department} onChange={e=>setForm({...form,department:e.target.value})} className={inp} /></div>
          <div><label className="text-xs text-gray-500 mb-1 block">Role</label>
            <select value={form.role} onChange={e=>setForm({...form,role:e.target.value})} className={inp}>
              {CREATE_ROLES.map(r => <option key={r} value={r}>{r.charAt(0).toUpperCase()+r.slice(1)}</option>)}
            </select></div>
          <div className="col-span-2 flex items-center gap-3 pt-1">
            <button type="submit" disabled={msg.submitting}
              className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-5 py-2 rounded-lg transition-colors disabled:opacity-60">
              {msg.submitting ? 'Creating...' : 'Create User'}
            </button>
            {msg.text && <span className={`text-sm ${msg.ok ? 'text-green-600' : 'text-red-600'}`}>{msg.text}</span>}
          </div>
        </form>
      </div>

      <div className="bg-white rounded-md border border-gray-200 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-base font-semibold text-gray-800">Manage Users</h2>
            <p className="text-xs text-gray-400 mt-0.5">Change roles or remove users. You cannot modify your own account.</p>
          </div>
          {isSuperAdmin && tenantOptions.length > 1 && (
            <select value={tenantFilter} onChange={e => setTenantFilter(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="all">All Companies ({nonSuperUsers.length})</option>
              {tenantOptions.map(tid => (
                <option key={tid} value={tid}>
                  {tenantName(tid === '__none__' ? null : tid)} ({(tenantGroups[tid] || []).length})
                </option>
              ))}
            </select>
          )}
        </div>
        <div className="flex gap-3 px-6 py-2.5 bg-gray-50 border-b border-gray-100">
          <span className="text-xs px-2.5 py-1 rounded-full font-medium bg-red-100 text-red-700">admin</span>
          <span className="text-xs px-2.5 py-1 rounded-full font-medium bg-blue-100 text-blue-700">editor</span>
          <span className="text-xs px-2.5 py-1 rounded-full font-medium bg-gray-100 text-gray-600">viewer</span>
        </div>
        {usersLoading ? (
          <div className="text-center py-12 text-gray-400 text-sm">Loading users...</div>
        ) : isSuperAdmin ? (
          Object.keys(tenantGroups).length === 0 ? (
            <div className="text-center py-12 text-gray-400 text-sm">No users found</div>
          ) : (
            Object.entries(tenantGroups)
              .filter(([key]) => tenantFilter === 'all' || key === tenantFilter)
              .map(([key, groupUsers]) => (
                <div key={key}>
                  {tenantFilter === 'all' && (
                    <div className="flex items-center gap-2 px-6 py-2 bg-blue-50/60 border-b border-blue-100">
                      <span className="text-xs font-semibold text-blue-700 uppercase tracking-wider">
                        {tenantName(key === '__none__' ? null : key)}
                      </span>
                      <span className="text-[10px] bg-white border border-blue-200 text-blue-500 px-2 py-0.5 rounded-full">
                        {groupUsers.length} users
                      </span>
                    </div>
                  )}
                  <UserTable users={groupUsers} currentUser={currentUser} isSuperAdmin={isSuperAdmin}
                    ROLE_BADGE={ROLE_BADGE} roleErrors={roleErrors} deleting={deleting}
                    onRoleChange={handleRoleChange} onDelete={handleDelete} />
                </div>
              ))
          )
        ) : (
          <UserTable users={users} currentUser={currentUser} isSuperAdmin={false}
            ROLE_BADGE={ROLE_BADGE} roleErrors={roleErrors} deleting={deleting}
            onRoleChange={handleRoleChange} onDelete={handleDelete} />
        )}
      </div>
    </div>
  )
}

function UserTable({ users, currentUser, isSuperAdmin, ROLE_BADGE, roleErrors, deleting, onRoleChange, onDelete }) {
  if (!users || users.length === 0) {
    return <div className="text-center py-8 text-gray-400 text-sm">No users found</div>
  }
  function rowRoles(u) {
    if (isSuperAdmin) return ['admin', 'editor', 'viewer']
    if (u.role === 'admin' || u.role === 'company_admin') return ['admin', 'editor', 'viewer']
    return ['editor', 'viewer']
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100">
            {['Username','Full Name','Email','Department','Role',''].map(h => (
              <th key={h} className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-6 py-3 whitespace-nowrap bg-white">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {users.map((u, i) => {
            const isSelf = String(u._id) === String(currentUser?._id)
            return (
              <tr key={u._id} className={`border-b border-gray-50 hover:bg-blue-50/20 transition-colors ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}`}>
                <td className="px-6 py-3 whitespace-nowrap">
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center text-xs font-bold text-blue-600 flex-shrink-0">
                      {u.username?.[0]?.toUpperCase() || '?'}
                    </div>
                    <span className="font-medium text-gray-800">{u.username}</span>
                    {isSelf && <span className="text-[10px] bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded font-semibold">You</span>}
                  </div>
                </td>
                <td className="px-6 py-3 text-gray-600">{u.fullName || <span className="text-gray-300">-</span>}</td>
                <td className="px-6 py-3 text-gray-600">{u.email || <span className="text-gray-300">-</span>}</td>
                <td className="px-6 py-3 text-gray-600">{u.department || <span className="text-gray-300">-</span>}</td>
                <td className="px-6 py-3">
                  {isSelf ? (
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${ROLE_BADGE[u.role] || 'bg-gray-100 text-gray-600'}`}>
                      {u.role?.charAt(0).toUpperCase() + u.role?.slice(1)}
                    </span>
                  ) : (
                    <div className="flex flex-col gap-1">
                      <select value={u.role} onChange={e => onRoleChange(u._id, e.target.value)}
                        className="border border-gray-300 rounded-lg px-2.5 py-1.5 text-xs text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer min-w-[100px]">
                        {rowRoles(u).map(r => <option key={r} value={r}>{r.charAt(0).toUpperCase()+r.slice(1)}</option>)}
                      </select>
                      {roleErrors[u._id] && <span className="text-[10px] text-red-500">{roleErrors[u._id]}</span>}
                    </div>
                  )}
                </td>
                <td className="px-6 py-3 text-right whitespace-nowrap">
                  {!isSelf && (
                    <button onClick={() => onDelete(u)} disabled={deleting === u._id}
                      className="text-xs px-3 py-1.5 text-red-600 border border-red-200 hover:bg-red-50 rounded-lg font-medium transition-colors disabled:opacity-40">
                      {deleting === u._id ? '...' : 'Delete'}
                    </button>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}


function AlertConfigPanel() {
  const [cfg, setCfg] = useState({ warrantyDays:30, licenseDays:30, maintenanceDays:3, warrantyEnabled:true, licenseEnabled:true, maintenanceEnabled:true })
  const [msg, setMsg] = useState({ text:'', ok:true })
  const [running, setRunning] = useState(false)

  async function handleRun() {
    setRunning(true); setMsg({ text:'', ok:true })
    try {
      await runAlertChecks({ warrantyDays: cfg.warrantyDays, licenseDays: cfg.licenseDays, maintenanceDays: cfg.maintenanceDays })
      setMsg({ text: 'Alert checks completed.', ok: true })
    } catch (e) {
      setMsg({ text: '' + (e.response?.data?.message || e.message), ok: false })
    } finally { setRunning(false) }
  }

  const rows = [
    { key:'warranty',    icon: <svg className="w-4 h-4 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>, bg:'bg-orange-100', label:'Warranty Expiry',  desc:'Alert when warranty expires within N days', field:'warrantyDays',    enabledField:'warrantyEnabled',    max:365 },
    { key:'license',     icon: <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>, bg:'bg-blue-100',   label:'License Expiry',   desc:'Alert when software license expires within N days', field:'licenseDays',     enabledField:'licenseEnabled',     max:365 },
    { key:'maintenance', icon: <svg className="w-4 h-4 text-yellow-700" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>, bg:'bg-yellow-100', label:'Maintenance Due',  desc:'Alert when scheduled maintenance is within N days', field:'maintenanceDays', enabledField:'maintenanceEnabled', max:30  },
  ]

  return (
    <div className="flex flex-col gap-4">
      <div className="bg-white rounded-md border border-gray-200 p-6">
        <h2 className="text-base font-semibold text-gray-800 mb-1">Alert Configuration</h2>
        <p className="text-xs text-gray-400 mb-5">Set thresholds for automated alerts. Checks run daily at 8:00 AM.</p>
        <div className="flex flex-col gap-4">
          {rows.map(r => (
            <div key={r.key} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-200">
              <div className="flex items-center gap-3">
                <div className={`w-8 h-8 ${r.bg} rounded-lg flex items-center justify-center`}>{r.icon}</div>
                <div>
                  <p className="text-sm font-medium text-gray-700">{r.label}</p>
                  <p className="text-xs text-gray-400">{r.desc}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <input type="number" min="1" max={r.max} value={cfg[r.field]}
                  onChange={e => setCfg({ ...cfg, [r.field]: +e.target.value })}
                  className="w-16 border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-blue-500" />
                <span className="text-xs text-gray-400">days</span>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" checked={cfg[r.enabledField]}
                    onChange={e => setCfg({ ...cfg, [r.enabledField]: e.target.checked })} className="sr-only peer" />
                  <div className="w-9 h-5 bg-gray-200 rounded-full peer peer-checked:bg-blue-500 after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-4" />
                </label>
              </div>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-3 mt-5 pt-4 border-t border-gray-100">
          <button onClick={handleRun} disabled={running}
            className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-5 py-2 rounded-lg transition-colors disabled:opacity-50">
            {running ? 'Running...' : 'Run Checks Now'}
          </button>
          {msg.text && <span className={`text-sm ${msg.ok ? 'text-blue-600' : 'text-red-600'}`}>{msg.text}</span>}
        </div>
      </div>
      <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
        <p className="text-xs text-blue-700 font-medium">Scheduled Checks</p>
        <p className="text-xs text-blue-600 mt-1">Alerts auto-generate daily at 8:00 AM (Asia/Kolkata). Use "Run Checks Now" to trigger immediately.</p>
      </div>
    </div>
  )
}

// --- View Alerts Panel ---
const TYPE_LABELS = { warranty_expiry:'Warranty', license_expiry:'License', maintenance_due:'Maintenance', low_stock:'Low Stock', overdue_asset:'Overdue Asset' }
const SEV_BADGE = { high:'bg-red-100 text-red-700', medium:'bg-yellow-100 text-yellow-700', low:'bg-blue-100 text-blue-700' }

function ViewAlertsPanel() {
  const [alerts, setAlerts] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [sevFilter, setSevFilter] = useState('all')
  const [running, setRunning] = useState(false)
  const [msg, setMsg] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = {}
      if (filter !== 'all') params.status = filter
      if (sevFilter !== 'all') params.severity = sevFilter
      const res = await getAlerts(params)
      setAlerts(Array.isArray(res.data?.data) ? res.data.data : [])
    } catch { setAlerts([]) }
    finally { setLoading(false) }
  }, [filter, sevFilter])

  useEffect(() => { load() }, [load])

  async function handleMarkAll() { await markAllAlertsRead(); setAlerts(prev => prev.map(a => ({ ...a, status:'read' }))) }
  async function handleRead(id) { await markAlertRead(id); setAlerts(prev => prev.map(a => a._id===id ? {...a,status:'read'} : a)) }
  async function handleDelete(id) { await deleteAlert(id); setAlerts(prev => prev.filter(a => a._id!==id)) }
  async function handleRunChecks() {
    setRunning(true); setMsg('')
    try { await runAlertChecks({}); setMsg('Checks completed.'); await load() }
    catch (e) { setMsg('' + (e.response?.data?.message || e.message)) }
    finally { setRunning(false) }
  }

  const unread = alerts.filter(a => a.status === 'unread').length

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-base font-semibold text-gray-800">Alerts</h2>
          {unread > 0 && <p className="text-xs text-gray-400 mt-0.5">{unread} unread</p>}
        </div>
        <div className="flex gap-2">
          <button onClick={handleMarkAll} className="text-xs px-3 py-1.5 border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50">Mark all read</button>
          <button onClick={handleRunChecks} disabled={running} className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50">
            {running ? 'Running...' : 'Run Checks'}
          </button>
        </div>
      </div>
      {msg && <p className="text-sm text-blue-700 bg-blue-50 border border-blue-200 rounded-lg px-4 py-2">{msg}</p>}
      <div className="flex gap-2 flex-wrap">
        {['all','unread','read'].map(f=>(
          <button key={f} onClick={()=>setFilter(f)} className={`text-xs px-3 py-1.5 rounded-lg font-medium capitalize transition-colors ${filter===f?'bg-gray-800 text-white':'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>{f}</button>
        ))}
        <div className="w-px bg-gray-200 mx-1" />
        {['all','high','medium','low'].map(s=>(
          <button key={s} onClick={()=>setSevFilter(s)} className={`text-xs px-3 py-1.5 rounded-lg font-medium capitalize transition-colors ${sevFilter===s?'bg-gray-800 text-white':'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>{s==='all'?'All Severity':s}</button>
        ))}
      </div>
      <div className="flex flex-col gap-2">
        {loading ? <div className="text-center py-10 text-gray-400 text-sm">Loading...</div>
        : alerts.length === 0 ? (
          <div className="text-center py-14 bg-white rounded-md border border-gray-200">
            <svg className="w-10 h-10 text-gray-200 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>
            <p className="text-gray-500 text-sm">No alerts found</p>
            <p className="text-gray-400 text-xs mt-1">Run checks to generate alerts from current data</p>
          </div>
        ) : alerts.map(alert => (
          <div key={alert._id} className={`bg-white rounded-md border px-4 py-3 flex items-start gap-3 ${alert.status==='unread'?'border-l-4 border-l-orange-400 border-gray-200':'border-gray-200 opacity-75'}`}>
            <div className={`mt-1 w-2.5 h-2.5 rounded-full flex-shrink-0 ${alert.severity==='high'?'bg-red-500':alert.severity==='medium'?'bg-yellow-400':'bg-blue-400'}`} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${SEV_BADGE[alert.severity]||'bg-gray-100 text-gray-600'}`}>{alert.severity?.toUpperCase()}</span>
                <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{TYPE_LABELS[alert.type]||alert.type}</span>
                {alert.status==='unread' && <span className="text-xs text-orange-600 font-semibold">NEW</span>}
              </div>
              <p className="text-sm text-gray-700 mt-1">{alert.message}</p>
              <p className="text-xs text-gray-400 mt-0.5">{new Date(alert.createdAt).toLocaleString()}</p>
            </div>
            <div className="flex gap-1 flex-shrink-0">
              {alert.status==='unread' && <button onClick={()=>handleRead(alert._id)} className="text-xs px-2 py-1 text-blue-600 hover:bg-blue-50 rounded">Read</button>}
              <button onClick={()=>handleDelete(alert._id)} className="text-xs px-2 py-1 text-red-500 hover:bg-red-50 rounded"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// --- Assets Export Card ---
function AssetsExportCard() {
  const catNames = useCategoryNames()
  const [filters, setFilters] = useState({ category: '', status: '' })
  const [loading, setLoading] = useState(false)

  async function handleExport(format) {
    setLoading(true)
    try {
      const params = { format }
      if (filters.category) params.category = filters.category
      if (filters.status)   params.status   = filters.status
      const res = await exportAssets(params)
      const ext = format === 'xlsx' ? 'xlsx' : 'csv'
      const url = URL.createObjectURL(new Blob([res.data]))
      const a = document.createElement('a')
      a.href = url; a.download = `assets_export.${ext}`; a.click()
      URL.revokeObjectURL(url)
    } catch (e) { console.error('Export failed', e) }
    finally { setLoading(false) }
  }

  return (
    <div className="bg-white border border-gray-200 rounded-md p-5">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
          <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
        </div>
        <div>
          <h3 className="text-sm font-semibold text-gray-700">Export Assets</h3>
          <p className="text-xs text-gray-400">Download asset records with dynamic custom fields per category</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div>
          <label className="text-xs text-gray-500 mb-1 block">Category</label>
          <select value={filters.category} onChange={e => setFilters({...filters, category: e.target.value})}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">All Categories</option>
            {catNames.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-gray-500 mb-1 block">Status</label>
          <select value={filters.status} onChange={e => setFilters({...filters, status: e.target.value})}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">All Statuses</option>
            {ASSET_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>
      <div className="flex gap-2">
        <button onClick={() => handleExport('csv')} disabled={loading}
          className="text-xs border border-blue-300 text-blue-700 px-4 py-2 rounded-lg hover:bg-blue-50 font-medium disabled:opacity-50">
          Export CSV
        </button>
        <button onClick={() => handleExport('xlsx')} disabled={loading}
          className="text-xs border border-blue-300 text-blue-700 px-4 py-2 rounded-lg hover:bg-blue-50 font-medium disabled:opacity-50">
          Export XLSX
        </button>
      </div>
    </div>
  )
}

// --- Employees Export Card ---
function EmployeesExportCard() {
  const [regions, setRegions] = useState([])
  const [filters, setFilters] = useState({ regionId: '', department: '', status: '' })
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    getRegions().then(r => setRegions(Array.isArray(r.data?.data) ? r.data.data : [])).catch(() => {})
  }, [])

  async function handleExport(format) {
    setLoading(true)
    try {
      const params = { format }
      if (filters.regionId)   params.regionId   = filters.regionId
      if (filters.department) params.department = filters.department
      if (filters.status)     params.status     = filters.status
      const res = await exportEmployees(params)
      const ext = format === 'xlsx' ? 'xlsx' : 'csv'
      const url = URL.createObjectURL(new Blob([res.data]))
      const a = document.createElement('a')
      a.href = url; a.download = `employees_export.${ext}`; a.click()
      URL.revokeObjectURL(url)
    } catch (e) { console.error('Export failed', e) }
    finally { setLoading(false) }
  }

  return (
    <div className="bg-white border border-gray-200 rounded-md p-5">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center flex-shrink-0">
          <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
        </div>
        <div>
          <h3 className="text-sm font-semibold text-gray-700">Export Employees</h3>
          <p className="text-xs text-gray-400">Download employee records with optional filters</p>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div>
          <label className="text-xs text-gray-500 mb-1 block">Region</label>
          <select value={filters.regionId} onChange={e => setFilters({...filters, regionId: e.target.value})} className={inp}>
            <option value="">All Regions</option>
            {regions.map(r => <option key={r._id} value={r._id}>{r.name}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-gray-500 mb-1 block">Department</label>
          <input placeholder="All departments" value={filters.department}
            onChange={e => setFilters({...filters, department: e.target.value})} className={inp} />
        </div>
        <div>
          <label className="text-xs text-gray-500 mb-1 block">Status</label>
          <select value={filters.status} onChange={e => setFilters({...filters, status: e.target.value})} className={inp}>
            <option value="">All Statuses</option>
            <option value="Active">Active</option>
            <option value="Inactive">Inactive</option>
          </select>
        </div>
      </div>
      <div className="flex gap-2">
        <button onClick={() => handleExport('csv')} disabled={loading}
          className="text-xs border border-blue-300 text-blue-700 px-4 py-2 rounded-lg hover:bg-blue-50 font-medium disabled:opacity-50">
          Export CSV
        </button>
        <button onClick={() => handleExport('xlsx')} disabled={loading}
          className="text-xs border border-blue-300 text-blue-700 px-4 py-2 rounded-lg hover:bg-blue-50 font-medium disabled:opacity-50">
          Export XLSX
        </button>
      </div>
    </div>
  )
}

// --- Import/Export Panel ---
function ImportExportPanel() {
  const catNames = useCategoryNames()
  const [panel, setPanel] = useState('import')
  const [step, setStep] = useState(0)
  const [selModule, setSelModule] = useState(null)
  const [selCategory, setSelCategory] = useState('')
  const [overlay, setOverlay] = useState(false)
  const [file, setFile] = useState(null)
  const [previewData, setPreviewData] = useState(null)
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [fieldSchema, setFieldSchema] = useState([])
  const [schemaLoading, setSchemaLoading] = useState(false)
  const navigate = useNavigate()

  function reset() { setStep(0); setSelModule(null); setSelCategory(''); setFile(null); setPreviewData(null); setResult(null); setError(''); setFieldSchema([]) }
  function selectMod(mod, isOverlay=false) { setSelModule(mod); setSelCategory(''); setOverlay(isOverlay); setFile(null); setPreviewData(null); setResult(null); setError(''); setFieldSchema([]); setStep(1) }

  useEffect(() => {
    if (!selModule || step !== 1) return
    if (selModule !== 'assets' && selModule !== 'employees') { setFieldSchema([]); return }
    setSchemaLoading(true)
    const entityType = selModule === 'assets' ? 'asset' : 'employee'
    const cat = selModule === 'assets' ? selCategory : ''
    getFieldSchema(entityType, cat)
      .then(r => setFieldSchema(Array.isArray(r.data?.data) ? r.data.data : []))
      .catch(() => setFieldSchema([]))
      .finally(() => setSchemaLoading(false))
  }, [selModule, selCategory, step])

  async function handlePreview() {
    if (!file) return setError('Please select a file first')
    setLoading(true); setError('')
    try {
      const res = await previewImport(selModule, file, selCategory ? `?category=${encodeURIComponent(selCategory)}` : '')
      setPreviewData(res.data); setStep(2)
    } catch (e) { setError(e.response?.data?.message || e.message) }
    finally { setLoading(false) }
  }

  async function handleCommit() {
    setLoading(true); setError('')
    try {
      const res = await commitImport(selModule, file, overlay, selCategory)
      setResult(res.data); setStep(3)
    } catch (e) { setError(e.response?.data?.message || e.message) }
    finally { setLoading(false) }
  }

  const activeModules = panel === 'overlay'
    ? [{ value:'assets', label:'Asset Overlay', icon:'Overlay', desc:'Bulk update existing assets by Asset Tag' }]
    : IMPORT_MODULES

  const requiredFields = fieldSchema.filter(f => f.required)
  const optionalFields = fieldSchema.filter(f => !f.required)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-base font-semibold text-gray-800">Import / Export</h2>
          <p className="text-xs text-gray-400 mt-0.5">Bulk data operations — import, overlay, and export</p>
        </div>
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          {[['import','Import'],['overlay','Overlay'],['export','Export']].map(([v,l])=>(
            <button key={v} onClick={()=>{setPanel(v);reset()}}
              className={`text-xs px-3 py-1.5 rounded-md font-medium transition-colors ${panel===v?'bg-white text-gray-800 shadow-sm':'text-gray-500 hover:text-gray-700'}`}>{l}</button>
          ))}
        </div>
      </div>

      {panel === 'export' && (
        <div className="flex flex-col gap-4">
          <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4 flex items-start gap-3">
            <svg className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            <div>
              <p className="text-sm font-semibold text-yellow-800">Use the Reports tab for filtered exports</p>
              <p className="text-xs text-yellow-700 mt-0.5">Reports provides search, filters, and column selection. Use templates below for import preparation only.</p>
            </div>
          </div>
          <div className="bg-white border border-gray-200 rounded-md p-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">CSV Templates</h3>
            <div className="flex flex-wrap gap-2">
              {['assets','locations'].map(mod=>(
                <a key={mod} href={downloadTemplate(mod)}
                  className="text-xs border border-blue-300 text-blue-700 px-4 py-2 rounded-lg hover:bg-blue-50 font-medium capitalize">
                  {mod} Template
                </a>
              ))}
            </div>
          </div>
          <AssetsExportCard />
          <EmployeesExportCard />
        </div>
      )}

      {(panel === 'import' || panel === 'overlay') && (
        <div className="bg-white rounded-md border border-gray-200 p-5 flex flex-col gap-4">
          <StepBar step={step} />

          {step === 0 && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {activeModules.map(mod => (
                <div key={mod.value} onClick={() => selectMod(mod.value, panel==='overlay')}
                  className="border border-gray-200 rounded-md p-4 flex flex-col gap-3 hover:border-blue-400 hover:shadow-sm transition-all cursor-pointer">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center flex-shrink-0">
                      <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
                    </div>
                    <div><p className="font-semibold text-gray-800 text-sm">{mod.label}</p><p className="text-xs text-gray-400">{mod.desc}</p></div>
                  </div>
                  <div className="flex gap-2 mt-auto">
                    <a href={downloadTemplate(mod.value)} onClick={e=>e.stopPropagation()} className="text-xs text-blue-700 border border-blue-300 px-3 py-1 rounded-lg hover:bg-blue-50 font-medium">Template</a>
                    <button onClick={()=>selectMod(mod.value,panel==='overlay')} className="text-xs bg-blue-600 text-white px-3 py-1 rounded-lg hover:bg-blue-700 font-medium flex-1">Start</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {step === 1 && (
            <div className="flex flex-col gap-4">
              {selModule === 'assets' && (
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Category (optional — enables dynamic fields in template)</label>
                  <select value={selCategory} onChange={e => setSelCategory(e.target.value)}
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-64">
                    <option value="">All Categories (fixed fields only)</option>
                    {catNames.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                  {selCategory && (
                    <a href={`${downloadTemplate('assets')}?category=${encodeURIComponent(selCategory)}`}
                      className="inline-block mt-2 text-xs text-blue-700 border border-blue-300 px-3 py-1 rounded-lg hover:bg-blue-50 font-medium">
                      Download {selCategory} Template
                    </a>
                  )}
                </div>
              )}

              {(selModule === 'assets' || selModule === 'employees') && (
                <div className="bg-gray-50 border border-gray-200 rounded-md p-4">
                  <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-3">
                     Expected Fields {selModule === 'assets' && selCategory ? `— ${selCategory}` : ''}
                  </p>
                  {schemaLoading ? (
                    <p className="text-xs text-gray-400">Loading field schema...</p>
                  ) : fieldSchema.length === 0 ? (
                    <p className="text-xs text-gray-400">No dynamic fields configured for this module.</p>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {requiredFields.length > 0 && (
                        <div>
                          <p className="text-xs font-medium text-red-600 mb-1.5">Required columns</p>
                          <div className="flex flex-wrap gap-1.5">
                            {requiredFields.map(f => (
                              <span key={f.name} className="inline-flex items-center gap-1 text-xs bg-red-50 border border-red-200 text-red-700 px-2 py-0.5 rounded-full font-medium">
                                <span className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" />
                                {f.label} <span className="font-mono text-red-400">({f.name})</span>
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      {optionalFields.length > 0 && (
                        <div>
                          <p className="text-xs font-medium text-gray-500 mb-1.5">Optional columns</p>
                          <div className="flex flex-wrap gap-1.5">
                            {optionalFields.map(f => (
                              <span key={f.name} className="inline-flex items-center gap-1 text-xs bg-white border border-gray-200 text-gray-600 px-2 py-0.5 rounded-full">
                                {f.label} <span className="font-mono text-gray-400">({f.name})</span>
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              <DropZone file={file} onFile={setFile} />
              {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
              <div className="flex gap-2 justify-end">
                <button onClick={()=>setStep(0)} className="px-4 py-2 text-sm rounded-lg border border-gray-300 hover:bg-gray-50">Back</button>
                <button onClick={handlePreview} disabled={!file||loading} className="px-5 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 font-semibold disabled:opacity-60">
                  {loading?'Parsing...':'Preview'}
                </button>
              </div>
            </div>
          )}

          {step === 2 && previewData && (
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-3 gap-3">
                {[['Total',previewData.total,'blue'],['Valid',previewData.valid,'green'],['Invalid',previewData.invalid,previewData.invalid>0?'red':'gray']].map(([l,v,c])=>(
                  <div key={l} className={`bg-${c}-50 border border-${c}-200 rounded-lg p-3 text-center`}>
                    <p className={`text-2xl font-bold text-${c}-700`}>{v}</p>
                    <p className={`text-xs text-${c}-500 mt-0.5`}>{l}</p>
                  </div>
                ))}
              </div>
              {previewData.errors?.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-md p-4">
                  <p className="text-xs font-semibold text-red-700 mb-2">{previewData.errors.length} row{previewData.errors.length > 1 ? 's' : ''} failed validation</p>
                  <div className="flex flex-col gap-1.5 max-h-36 overflow-y-auto">
                    {previewData.errors.slice(0, 20).map((err, i) => (
                      <div key={i} className="flex items-start gap-2 text-xs">
                        <span className="text-red-400 font-mono shrink-0">Row {err.row}</span>
                        <span className="text-red-700">{Array.isArray(err.errors) ? err.errors.join(', ') : err.errors}</span>
                      </div>
                    ))}
                    {previewData.errors.length > 20 && <p className="text-xs text-red-400">...and {previewData.errors.length - 20} more</p>}
                  </div>
                </div>
              )}
              {previewData.warnings?.length > 0 && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4">
                  <p className="text-xs font-semibold text-yellow-700 mb-2">{previewData.warnings.length} warning{previewData.warnings.length > 1 ? 's' : ''}</p>
                  <div className="flex flex-col gap-1 max-h-24 overflow-y-auto">
                    {previewData.warnings.map((w, i) => (
                      <p key={i} className="text-xs text-yellow-700">{typeof w === 'string' ? w : w.warning}</p>
                    ))}
                  </div>
                </div>
              )}
              {previewData.preview?.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Preview (first {previewData.preview.length} valid rows)</p>
                  <div className="overflow-x-auto rounded-lg border border-gray-200 max-h-52">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50 sticky top-0">
                        <tr>{Object.keys(previewData.preview[0]).filter(k => k !== 'customFields').map(k=><th key={k} className="px-3 py-2 text-left font-semibold text-gray-500 whitespace-nowrap">{k}</th>)}</tr>
                      </thead>
                      <tbody>
                        {previewData.preview.map((row,i)=>(
                          <tr key={i} className="border-t border-gray-100 hover:bg-gray-50">
                            {Object.keys(previewData.preview[0]).filter(k => k !== 'customFields').map(k=><td key={k} className="px-3 py-2 text-gray-700 whitespace-nowrap">{row[k]||'—'}</td>)}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
              <div className="flex gap-2 justify-end">
                <button onClick={()=>setStep(1)} className="px-4 py-2 text-sm rounded-lg border border-gray-300 hover:bg-gray-50">Back</button>
                <button onClick={handleCommit} disabled={previewData.valid===0||loading} className="px-5 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 font-semibold disabled:opacity-60">
                  {loading?'Importing...':`${overlay?'Update':'Import'} ${previewData.valid} Records Start`}
                </button>
              </div>
            </div>
          )}

          {step === 3 && result && (
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-3">
                {result.failed === 0
                  ? <svg className="w-8 h-8 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  : <svg className="w-8 h-8 text-yellow-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                }
                <div><h3 className="font-semibold text-gray-800">Import Complete</h3><p className="text-xs text-gray-400">Operation finished</p></div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                {result.inserted!==undefined && <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-center"><p className="text-2xl font-bold text-blue-700">{result.inserted}</p><p className="text-xs text-blue-500">Inserted</p></div>}
                {result.updated!==undefined && <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-center"><p className="text-2xl font-bold text-blue-700">{result.updated}</p><p className="text-xs text-blue-500">Updated</p></div>}
                <div className={`border rounded-lg p-3 text-center ${result.failed>0?'bg-red-50 border-red-200':'bg-gray-50 border-gray-200'}`}><p className={`text-2xl font-bold ${result.failed>0?'text-red-700':'text-gray-400'}`}>{result.failed}</p><p className={`text-xs ${result.failed>0?'text-red-500':'text-gray-400'}`}>Failed</p></div>
              </div>
              <div className="flex gap-2 justify-end">
                {selModule === 'assets' && (
                  <button onClick={() => navigate('/assets')} className="px-5 py-2 text-sm rounded-lg border border-blue-600 text-blue-700 hover:bg-blue-50 font-semibold">
                    Go to Assets Start
                  </button>
                )}
                <button onClick={reset} className="px-5 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 font-semibold">Import More</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// --- Reports Panel ---
const REPORT_TYPES = [
  { value:'assets', label:'Assets' },
  { value:'assignments', label:'Loans' },
  { value:'maintenance', label:'Maintenance' },
  { value:'licenses', label:'Licenses' },
]

function ReportsPanel() {
  const [reportType, setReportType] = useState('assets')
  const [data, setData] = useState({ assets:[], assignments:[], maintenance:[], licenses:[] })
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([getAssets({ limit: 500 }), getAssignments({ limit: 500 }), getMaintenanceLogs({ limit: 500 }), getLicenses({ limit: 500 })])
      .then(([a, asg, m, l]) => setData({
        assets:      Array.isArray(a.data?.data)   ? a.data.data   : (Array.isArray(a.data)   ? a.data   : []),
        assignments: Array.isArray(asg.data?.data) ? asg.data.data : (Array.isArray(asg.data) ? asg.data : []),
        maintenance: Array.isArray(m.data?.data)   ? m.data.data   : (Array.isArray(m.data)   ? m.data   : []),
        licenses:    Array.isArray(l.data?.data)   ? l.data.data   : (Array.isArray(l.data)   ? l.data   : []),
      }))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const configs = {
    assets: {
      columns: [
        { key:'assetTag', label:'Tag', render:v=><span className="font-mono text-xs font-semibold">{v}</span> },
        { key:'name', label:'Name' }, { key:'category', label:'Category' },
        { key:'status', label:'Status', render:v=><Badge label={v} /> },
        { key:'location', label:'Location', render:v=>v||'—' },
        { key:'warrantyExpiry', label:'Warranty', render:v=>v?new Date(v).toLocaleDateString():'—' },
      ],
      exportFn: rows => downloadCSV(
        ['Asset Tag','Name','Category','Brand','Serial','Status','Location','Cost','Warranty Expiry'],
        rows.map(r=>[r.assetTag,r.name,r.category,r.brand,r.serialno,r.status,r.location,r.purchaseCost,r.warrantyExpiry?new Date(r.warrantyExpiry).toLocaleDateString():'']),
        'Assets_Report.csv'
      )
    },
    assignments: {
      columns: [
        { key:'asset', label:'Asset', sortable:false, render:(_,r)=><span className="font-mono text-xs font-semibold">{r.asset?.assetTag}</span> },
        { key:'_n', label:'Name', sortable:false, render:(_,r)=>r.asset?.name||'—' },
        { key:'assignedTo', label:'User', sortable:false, render:(_,r)=>r.assignedTo?.username||'—' },
        { key:'status', label:'Status', render:v=><Badge label={v} /> },
        { key:'assignedAt', label:'Assigned', render:v=>v?new Date(v).toLocaleDateString():'—' },
      ],
      exportFn: rows => downloadCSV(['Asset Tag','Asset Name','User','Status','Assigned At'], rows.map(r=>[r.asset?.assetTag,r.asset?.name,r.assignedTo?.username,r.status,r.assignedAt?new Date(r.assignedAt).toLocaleDateString():'']), 'Loans_Report.csv')
    },
    maintenance: {
      columns: [
        { key:'asset', label:'Asset', sortable:false, render:(_,r)=><span className="font-mono text-xs">{r.asset?.assetTag}</span> },
        { key:'type', label:'Type' }, { key:'status', label:'Status', render:v=><Badge label={v} /> },
        { key:'cost', label:'Cost', render:v=>v?`₹${Number(v).toLocaleString()}`:'—' },
        { key:'completedDate', label:'Completed', render:v=>v?new Date(v).toLocaleDateString():'—' },
      ],
      exportFn: rows => downloadCSV(['Asset Tag','Type','Description','Status','Cost','Completed'], rows.map(r=>[r.asset?.assetTag,r.type,r.description,r.status,r.cost,r.completedDate?new Date(r.completedDate).toLocaleDateString():'']), 'Maintenance_Report.csv')
    },
    licenses: {
      columns: [
        { key:'softwareName', label:'Software', render:v=><span className="font-semibold">{v}</span> },
        { key:'vendor', label:'Vendor', render:v=>v||'—' }, { key:'licenseType', label:'Type' },
        { key:'seats', label:'Seats', render:(v,r)=>`${r.usedSeats}/${v}` },
        { key:'status', label:'Status', render:v=><Badge label={v} /> },
        { key:'expiryDate', label:'Expiry', render:v=>v?new Date(v).toLocaleDateString():'—' },
      ],
      exportFn: rows => downloadCSV(['Software','Vendor','Type','Seats','Used','Status','Expiry'], rows.map(r=>[r.softwareName,r.vendor,r.licenseType,r.seats,r.usedSeats,r.status,r.expiryDate?new Date(r.expiryDate).toLocaleDateString():'']), 'Licenses_Report.csv')
    },
  }

  const cfg = configs[reportType]
  const filtered = (data[reportType]||[]).filter(row => !search || JSON.stringify(row).toLowerCase().includes(search.toLowerCase()))

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-base font-semibold text-gray-800">Reports</h2>
          <p className="text-xs text-gray-400 mt-0.5">{filtered.length} records</p>
        </div>
        <div className="flex gap-2">
          <input placeholder="Search..." value={search} onChange={e=>setSearch(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-44" />
          <button onClick={()=>cfg.exportFn(filtered)} className="border border-blue-600 text-blue-700 text-sm px-4 py-1.5 rounded-lg hover:bg-blue-50 font-medium">Export CSV</button>
        </div>
      </div>
      <div className="grid grid-cols-4 gap-2">
        {REPORT_TYPES.map(r=>(
          <button key={r.value} onClick={()=>{setReportType(r.value);setSearch('')}}
            className={`text-xs px-3 py-2 rounded-lg font-medium transition-colors ${reportType===r.value?'bg-blue-600 text-white':'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
            {r.label} <span className="opacity-70">({data[r.value]?.length})</span>
          </button>
        ))}
      </div>
      {!loading && filtered.length === 0 ? (
        <div className="text-center py-14 bg-white rounded-md border border-gray-200">
          
          <p className="text-gray-500 text-sm">No {reportType} data found</p>
        </div>
      ) : (
        <DataTable columns={cfg.columns} rows={filtered} loading={loading} emptyText="No data" />
      )}
    </div>
  )
}

// --- Categories Panel ---
function CategoriesPanel() {
  const { isAdmin, isEditor } = useAuth()
  const navigate = useNavigate()

  const [assetCats, setAssetCats]         = useState([])
  const [accessoryCats, setAccessoryCats] = useState([])
  const [loading, setLoading]             = useState(true)
  const [fieldConfigCat, setFieldConfigCat] = useState(null)  // { name, type }

  // modal state — type is auto-set by which button was clicked
  const [modalOpen, setModalOpen] = useState(false)
  const [editCat, setEditCat]     = useState(null)
  const [modalType, setModalType] = useState('asset') // 'asset' | 'accessory'
  const [name, setName]           = useState('')
  const [saving, setSaving]       = useState(false)
  const [msg, setMsg]             = useState({ text: '', ok: true })

  async function load() {
    setLoading(true)
    try {
      const res = await getAssetCategories()
      const all = Array.isArray(res.data?.data) ? res.data.data : []
      setAssetCats(all.filter(c => c.type === 'asset'))
      setAccessoryCats(all.filter(c => c.type === 'accessory'))
    } catch { setAssetCats([]); setAccessoryCats([]) }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  function openAdd(type) {
    setEditCat(null); setModalType(type); setName(''); setMsg({ text: '', ok: true }); setModalOpen(true)
  }

  function openEdit(cat) {
    setEditCat(cat); setModalType(cat.type); setName(cat.name); setMsg({ text: '', ok: true }); setModalOpen(true)
  }

  async function handleSave() {
    if (!name.trim()) return setMsg({ text: 'Category name is required', ok: false })
    setSaving(true); setMsg({ text: '', ok: true })
    try {
      if (editCat) {
        await updateAssetCategory(editCat._id, { name: name.trim() })
      } else {
        await createAssetCategory({ name: name.trim(), type: modalType })
      }
      _catCache = null
      await load()
      setModalOpen(false)
    } catch (e) {
      setMsg({ text: e.response?.data?.message || 'Failed to save', ok: false })
    } finally { setSaving(false) }
  }

  async function handleDelete(cat) {
    if (!window.confirm(`Delete "${cat.name}"? Records using this category must be reassigned first.`)) return
    try {
      await deleteAssetCategory(cat._id)
      _catCache = null
      load()
    } catch (e) {
      alert('' + (e.response?.data?.message || 'Delete failed'))
    }
  }

  const inp = 'w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

  function CategoryTable({ cats, type }) {
    const isAsset = type === 'asset'
    const color   = isAsset ? 'blue' : 'purple'
    const label   = isAsset ? 'Asset Categories' : 'Accessories Categories'
    const viewPath = isAsset ? '/assets' : '/accessories'

    return (
      <div className="bg-white rounded-md border border-gray-200 overflow-hidden">
        <div className={`flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-${color}-50`}>
          <div>
            <h3 className={`text-sm font-semibold text-${color}-800`}>{label}</h3>
            <p className="text-xs text-gray-400 mt-0.5">{cats.length} {type === 'asset' ? 'asset types' : 'accessory types'}</p>
          </div>
          {isEditor && (
            <button onClick={() => openAdd(type)}
              className={`bg-${color}-600 hover:bg-${color}-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors`}>
              + Add {isAsset ? 'Asset' : 'Accessory'} Category
            </button>
          )}
        </div>
        {loading ? (
          <div className="py-8 text-center text-gray-400 text-sm">Loading...</div>
        ) : cats.length === 0 ? (
          <div className="py-10 text-center text-gray-400 text-sm">No {type} categories yet</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-2.5">Name</th>
                <th className="text-right text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-2.5">Actions</th>
              </tr>
            </thead>
            <tbody>
              {cats.map(cat => (
                <tr key={cat._id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-2.5 font-medium text-gray-800">{cat.name}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex gap-2 justify-end flex-wrap">
                      <button onClick={() => navigate(`${viewPath}?category=${encodeURIComponent(cat.name)}`)}
                        className="text-xs text-blue-600 border border-blue-200 hover:bg-blue-50 px-2.5 py-1 rounded-lg font-medium">
                        View
                      </button>
                      {(isAsset || type === 'accessory') && (
                        <button onClick={() => setFieldConfigCat({ name: cat.name, type: cat.type })}
                          className="text-xs text-gray-600 border border-gray-300 hover:bg-gray-50 px-2.5 py-1 rounded-lg font-medium">
                          Fields
                        </button>
                      )}
                      {isEditor && (
                        <button onClick={() => openEdit(cat)}
                          className="text-xs text-yellow-700 border border-yellow-200 hover:bg-yellow-50 px-2.5 py-1 rounded-lg font-medium">
                          Edit
                        </button>
                      )}
                      {isAdmin && (
                        <button onClick={() => handleDelete(cat)}
                          className="text-xs text-red-600 border border-red-200 hover:bg-red-50 px-2.5 py-1 rounded-lg font-medium">
                          Delete
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-base font-semibold text-gray-800">Categories</h2>
        <p className="text-xs text-gray-400 mt-0.5">Manage asset and accessory categories separately</p>
      </div>

      <CategoryTable cats={assetCats}     type="asset" />
      <CategoryTable cats={accessoryCats} type="accessory" />

      {/* Asset Statuses */}
      <div className="bg-white rounded-md border border-gray-200 p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Asset Statuses</h3>
        <div className="flex flex-wrap gap-2">
          {ASSET_STATUSES.map(s => <span key={s} className="bg-blue-50 text-blue-700 text-xs px-3 py-1 rounded-full font-medium">{s}</span>)}
        </div>
      </div>

      {/* Add/Edit Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={e => e.target === e.currentTarget && setModalOpen(false)}>
          <div className="bg-white rounded-md shadow-2xl w-full max-w-sm mx-4 p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-base font-semibold text-gray-800">
                  {editCat ? 'Edit Category' : `Add ${modalType === 'asset' ? 'Asset' : 'Accessory'} Category`}
                </h3>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium mt-1 inline-block ${modalType === 'asset' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>
                  {modalType}
                </span>
              </div>
              <button onClick={() => setModalOpen(false)} className="text-gray-400 hover:text-gray-600 text-lg leading-none"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
            </div>
            <div className="flex flex-col gap-3">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Category Name *</label>
                <input
                  autoFocus
                  placeholder={modalType === 'asset' ? 'e.g. Laptop, MacBook' : 'e.g. Mouse, Monitor'}
                  value={name}
                  onChange={e => setName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !saving && handleSave()}
                  className={inp}
                />
              </div>
              {msg.text && (
                <p className={`text-xs px-3 py-2 rounded-lg ${msg.ok ? 'bg-blue-50 text-blue-700 border border-blue-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
                  {msg.ok ? '' : ''}{msg.text}
                </p>
              )}
            </div>
            <div className="flex gap-2 justify-end mt-5">
              <button onClick={() => setModalOpen(false)} disabled={saving}
                className="px-4 py-2 text-sm rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-50">
                Cancel
              </button>
              <button onClick={handleSave} disabled={saving || !name.trim()}
                className={`px-5 py-2 text-sm rounded-lg text-white font-semibold disabled:opacity-50 transition-colors ${modalType === 'asset' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-purple-600 hover:bg-purple-700'}`}>
                {saving ? 'Saving...' : editCat ? 'Update' : 'Create Category'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Field Config Modal */}
      {fieldConfigCat && (
        <AssetFieldConfig
          category={fieldConfigCat.name}
          entityType={fieldConfigCat.type}
          onClose={() => setFieldConfigCat(null)}
        />
      )}
    </div>
  )
}

// --- Migration Panel ---
function MigrationPanel() {
  const navigate = useNavigate()
  const [running, setRunning]         = useState(false)
  const [result, setResult]           = useState(null)
  const [error, setError]             = useState('')
  const [reclassifying, setReclassifying] = useState(false)
  const [reclassifyResult, setReclassifyResult] = useState(null)
  const [reclassifyError, setReclassifyError]   = useState('')

  async function handleMigrate() {
    if (!window.confirm('This will copy Inventory records into Assets and update existing records with correct type/category. Continue?')) return
    setRunning(true); setError(''); setResult(null)
    try {
      const res = await migrateFromInventory()
      setResult(res.data)
    } catch (e) {
      setError(e.response?.data?.message || e.message)
    } finally { setRunning(false) }
  }

  async function handleReclassify() {
    if (!window.confirm(
      'This will fix ALL existing records:\n\n' +
      '- Laptop → type=asset\n' +
      '- Mouse, Keyboard, Monitor, Headset, Docking Station → type=accessory\n\n' +
      'No data is deleted. Continue?'
    )) return
    setReclassifying(true); setReclassifyError(''); setReclassifyResult(null)
    try {
      const res = await reclassifyAssets()
      setReclassifyResult(res.data)
    } catch (e) {
      setReclassifyError(e.response?.data?.message || e.message)
    } finally { setReclassifying(false) }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Fix Asset Types — data correction */}
      <div className="bg-white rounded-md border border-gray-200 p-6">
        <div className="flex items-start gap-3 mb-4">
          
          <div>
            <h2 className="text-base font-semibold text-gray-800">Fix Asset Types</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Corrects the <code className="bg-gray-100 px-1 rounded">type</code> field on every record based on its category.
              Run this if Assets or Accessories pages show wrong data.
            </p>
          </div>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-md p-4 mb-5 flex items-start gap-3">
          
          <div className="text-xs text-blue-700 space-y-0.5">
            <p><strong>Laptop</strong> Start type = <code className="bg-blue-100 px-1 rounded">asset</code></p>
            <p><strong>Mouse, Keyboard, Monitor, Headset, Docking Station</strong> Start type = <code className="bg-blue-100 px-1 rounded">accessory</code></p>
            <p className="mt-1 text-blue-600">Safe to run multiple times. No records are deleted.</p>
          </div>
        </div>
        <button onClick={handleReclassify} disabled={reclassifying}
          className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-5 py-2 rounded-lg transition-colors disabled:opacity-50">
          {reclassifying ? 'Fixing...' : 'Fix Asset Types'}
        </button>
        {reclassifyError && (
          <p className="mt-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{reclassifyError}</p>
        )}
        {reclassifyResult && (
          <div className="mt-4 bg-blue-50 border border-blue-200 rounded-md p-4">
            <p className="text-sm font-semibold text-blue-800 mb-3">{reclassifyResult.message}</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white border border-blue-200 rounded-lg p-3 text-center">
                <p className="text-xl font-bold text-blue-700">{reclassifyResult.breakdown?.assets ?? '—'}</p>
                <p className="text-xs text-blue-600">Assets (Laptops)</p>
              </div>
              <div className="bg-white border border-purple-200 rounded-lg p-3 text-center">
                <p className="text-xl font-bold text-purple-700">{reclassifyResult.breakdown?.accessories ?? '—'}</p>
                <p className="text-xs text-purple-600">Accessories</p>
              </div>
            </div>
            <div className="flex gap-2 mt-3">
              <button onClick={() => navigate('/assets')}
                className="text-xs border border-blue-600 text-blue-700 px-3 py-1.5 rounded-lg hover:bg-blue-50 font-medium">
                View Assets Start
              </button>
              <button onClick={() => navigate('/accessories')}
                className="text-xs border border-purple-400 text-purple-700 px-3 py-1.5 rounded-lg hover:bg-purple-50 font-medium">
                View Accessories Start
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Inventory Migration */}
      <div className="bg-white rounded-md border border-gray-200 p-6">
        <h2 className="text-base font-semibold text-gray-800 mb-1">Inventory Migration</h2>
        <p className="text-xs text-gray-400 mb-5">Copy legacy Inventory records into Assets. Existing records are updated with correct type/category instead of skipped.</p>
        <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4 mb-5 flex items-start gap-3">
          
          <div>
            <p className="text-sm font-semibold text-yellow-800">Before you migrate</p>
            <ul className="text-xs text-yellow-700 mt-1 list-disc list-inside space-y-0.5">
              <li>Each unique serial number becomes one Asset/Accessory record</li>
              <li>Item names are mapped to categories automatically</li>
              <li>Existing records are updated (type + category corrected)</li>
              <li>Original Inventory data is not deleted</li>
            </ul>
          </div>
        </div>
        <button onClick={handleMigrate} disabled={running}
          className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-5 py-2 rounded-lg transition-colors disabled:opacity-50">
          {running ? 'Migrating...' : 'Run Migration'}
        </button>
        {error && <p className="mt-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
      </div>

      {result && (
        <div className="bg-white rounded-md border border-gray-200 p-6">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Migration Result</h3>
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-blue-700">{result.migrated}</p>
              <p className="text-xs text-blue-500">New Records</p>
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-blue-700">{result.updated ?? 0}</p>
              <p className="text-xs text-blue-500">Updated</p>
            </div>
            <div className={`border rounded-lg p-3 text-center ${result.errors?.length ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-200'}`}>
              <p className={`text-2xl font-bold ${result.errors?.length ? 'text-red-700' : 'text-gray-400'}`}>{result.errors?.length || 0}</p>
              <p className={`text-xs ${result.errors?.length ? 'text-red-500' : 'text-gray-400'}`}>Errors</p>
            </div>
          </div>
          <p className="text-sm text-gray-600 mb-4">{result.message}</p>
          {result.errors?.length > 0 && (
            <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3">
              <p className="text-xs font-semibold text-red-700 mb-1">Errors:</p>
              {result.errors.map((e, i) => <p key={i} className="text-xs text-red-600">{e.serial}: {e.error}</p>)}
            </div>
          )}
          <button onClick={() => navigate('/assets')}
            className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-5 py-2 rounded-lg transition-colors">
            Go to Assets Start
          </button>
        </div>
      )}
    </div>
  )
}

// --- System Panel ---
function SystemPanel({ user }) {
  const [currentPw, setCurrentPw]   = useState('')
  const [newPw, setNewPw]           = useState('')
  const [confirmPw, setConfirmPw]   = useState('')
  const [pwMsg, setPwMsg]           = useState({ text: '', ok: true })
  const [pwLoading, setPwLoading]   = useState(false)
  const [email, setEmail]           = useState('—')
  const [isGoogleUser, setIsGoogleUser] = useState(false)
  const isSuperAdmin = user?.role === 'super_admin'
  const skipCurrentPw = isSuperAdmin || isGoogleUser

  useEffect(() => {
    import('../services/api').then(({ getMe }) => {
      getMe().then(r => {
        setEmail(r.data?.email || '—')
        setIsGoogleUser(r.data?.isGoogleUser || false)
      }).catch(() => {})
    })
  }, [])

  // Get login time from sessionStorage
  const loginTime = (() => {
    try {
      const s = JSON.parse(sessionStorage.getItem('session') || '{}')
      return s.loginTime ? new Date(s.loginTime).toLocaleString() : '—'
    } catch { return '—' }
  })()

  async function handlePasswordReset(e) {
    e.preventDefault()
    if (newPw !== confirmPw) { setPwMsg({ text: 'Passwords do not match', ok: false }); return }
    if (newPw.length < 8)    { setPwMsg({ text: 'Password must be at least 8 characters', ok: false }); return }
    setPwLoading(true); setPwMsg({ text: '', ok: true })
    try {
      await changePassword(currentPw, newPw)
      setPwMsg({ text: '✅ Password changed successfully', ok: true })
      setCurrentPw(''); setNewPw(''); setConfirmPw('')
    } catch (err) {
      setPwMsg({ text: '❌ ' + (err.response?.data?.message || 'Failed to change password'), ok: false })
    } finally { setPwLoading(false) }
  }

  return (
    <div className="flex flex-col gap-5">
      {/* User Info Card */}
      <div className="bg-white rounded-md border border-gray-200 p-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">Account Information</h2>
        <dl className="grid grid-cols-2 gap-x-8 gap-y-4 text-sm">
          {[
            ['Username',   user?.username || '—'],
            ['Role',       user?.role?.replace(/_/g,' ').replace(/\b\w/g, c => c.toUpperCase()) || '—'],
            ['Email',      email],
            ['Login Time', loginTime],
          ].map(([k, v]) => (
            <div key={k} className="flex flex-col">
              <dt className="text-xs text-gray-400 uppercase tracking-wide">{k}</dt>
              <dd className="font-medium text-gray-700 mt-0.5">{v}</dd>
            </div>
          ))}
        </dl>
      </div>

      {/* Reset Password Card */}
      <div className="bg-white rounded-md border border-gray-200 p-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">Reset Password</h2>
        <form onSubmit={handlePasswordReset} className="flex flex-col gap-3 max-w-sm">
          {!skipCurrentPw && (
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Current Password</label>
              <input type="password" value={currentPw} onChange={e => setCurrentPw(e.target.value)}
                required className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
            </div>
          )}
          <div>
            <label className="text-xs text-gray-500 mb-1 block">New Password</label>
            <input type="password" value={newPw} onChange={e => setNewPw(e.target.value)}
              required className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Confirm New Password</label>
            <input type="password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)}
              required className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
          </div>
          {pwMsg.text && (
            <p className={`text-xs ${pwMsg.ok ? 'text-green-600' : 'text-red-500'}`}>{pwMsg.text}</p>
          )}
          <button type="submit" disabled={pwLoading}
            className="bg-green-600 hover:bg-green-700 text-white text-sm font-semibold py-2 rounded-lg disabled:opacity-60 w-fit px-6">
            {pwLoading ? 'Saving...' : 'Change Password'}
          </button>
        </form>
      </div>
    </div>
  )
}

// --- Auth Logs Panel ---
const ACTION_COLORS = {
  LOGIN_SUCCESS:        'bg-green-100 text-green-700',
  LOGIN_FAILURE:        'bg-red-100 text-red-700',
  LOGIN_LOCKED:         'bg-orange-100 text-orange-700',
  TOKEN_REFRESH:        'bg-blue-100 text-blue-700',
  TOKEN_REUSE_DETECTED: 'bg-red-200 text-red-800',
  LOGOUT:               'bg-gray-100 text-gray-600',
  LOGOUT_ALL:           'bg-gray-200 text-gray-700',
  PASSWORD_CHANGE:      'bg-purple-100 text-purple-700',
  ACCOUNT_LOCKED:       'bg-orange-200 text-orange-800',
  ACCOUNT_UNLOCKED:     'bg-green-100 text-green-700',
  ROLE_CHANGED:         'bg-yellow-100 text-yellow-700',
}

function AuthLogsPanel() {
  const [logs, setLogs]         = useState([])
  const [loading, setLoading]   = useState(true)
  const [actions, setActions]   = useState([])
  const [total, setTotal]       = useState(0)
  const [page, setPage]         = useState(1)
  const [filters, setFilters]   = useState({ username: '', action: '', success: '', from: '', to: '' })
  const LIMIT = 50

  useEffect(() => {
    getAuthAuditActions().then(r => setActions(Array.isArray(r.data?.data) ? r.data.data : [])).catch(() => {})
  }, [])

  const load = useCallback(async (p = 1) => {
    setLoading(true)
    try {
      const params = { page: p, limit: LIMIT }
      if (filters.username) params.username = filters.username
      if (filters.action)   params.action   = filters.action
      if (filters.success !== '') params.success = filters.success
      if (filters.from)     params.from     = filters.from
      if (filters.to)       params.to       = filters.to
      const res = await getAuthAuditLogs(params)
      setLogs(Array.isArray(res.data?.data) ? res.data.data : [])
      setTotal(res.data?.total || 0)
      setPage(p)
    } catch { setLogs([]) }
    finally { setLoading(false) }
  }, [filters])

  useEffect(() => { load(1) }, [load])

  const pages = Math.ceil(total / LIMIT)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-gray-800">Auth Audit Logs</h2>
          <p className="text-xs text-gray-400 mt-0.5">{total.toLocaleString()} events recorded</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white border border-gray-200 rounded-md p-4 grid grid-cols-2 md:grid-cols-3 gap-3">
        <div>
          <label className="text-xs text-gray-500 mb-1 block">Username</label>
          <input placeholder="Filter by username" value={filters.username}
            onChange={e => setFilters(f => ({ ...f, username: e.target.value }))}
            className={inp} />
        </div>
        <div>
          <label className="text-xs text-gray-500 mb-1 block">Action</label>
          <select value={filters.action} onChange={e => setFilters(f => ({ ...f, action: e.target.value }))} className={inp}>
            <option value="">All Actions</option>
            {actions.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-gray-500 mb-1 block">Result</label>
          <select value={filters.success} onChange={e => setFilters(f => ({ ...f, success: e.target.value }))} className={inp}>
            <option value="">All</option>
            <option value="true">Success</option>
            <option value="false">Failure</option>
          </select>
        </div>
        <div>
          <label className="text-xs text-gray-500 mb-1 block">From</label>
          <input type="date" value={filters.from} onChange={e => setFilters(f => ({ ...f, from: e.target.value }))} className={inp} />
        </div>
        <div>
          <label className="text-xs text-gray-500 mb-1 block">To</label>
          <input type="date" value={filters.to} onChange={e => setFilters(f => ({ ...f, to: e.target.value }))} className={inp} />
        </div>
        <div className="flex items-end">
          <button onClick={() => { setFilters({ username:'', action:'', success:'', from:'', to:'' }) }}
            className="text-xs px-3 py-2 border border-gray-300 rounded text-gray-600 hover:bg-gray-50 w-full">
            Clear Filters
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-md overflow-hidden">
        {loading ? (
          <div className="text-center py-12 text-gray-400 text-sm">Loading...</div>
        ) : logs.length === 0 ? (
          <div className="text-center py-12 text-gray-400 text-sm">No auth events found</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {['Time', 'User', 'Action', 'Result', 'IP', 'Device', 'Detail'].map(h => (
                    <th key={h} className="text-left px-3 py-2.5 text-gray-500 font-semibold uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {logs.map((log, i) => (
                  <tr key={log._id} className={`border-b border-gray-100 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>
                    <td className="px-3 py-2 text-gray-500 whitespace-nowrap">
                      {new Date(log.createdAt).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'medium' })}
                    </td>
                    <td className="px-3 py-2 font-medium text-gray-700">{log.username || '—'}</td>
                    <td className="px-3 py-2">
                      <span className={`px-2 py-0.5 rounded-full font-semibold text-[10px] ${ACTION_COLORS[log.action] || 'bg-gray-100 text-gray-600'}`}>
                        {log.action}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${log.success ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                        {log.success ? 'OK' : 'FAIL'}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-gray-500 font-mono">{log.metadata?.ip || '—'}</td>
                    <td className="px-3 py-2 text-gray-400 max-w-[120px] truncate" title={log.metadata?.userAgent}>
                      {log.metadata?.userAgent ? log.metadata.userAgent.split(' ')[0] : '—'}
                    </td>
                    <td className="px-3 py-2 text-gray-500">{log.metadata?.detail || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {pages > 1 && (
        <div className="flex items-center justify-between text-xs text-gray-500">
          <span>Page {page} of {pages} ({total.toLocaleString()} total)</span>
          <div className="flex gap-1">
            <button disabled={page <= 1} onClick={() => load(page - 1)}
              className="px-3 py-1.5 border border-gray-300 rounded disabled:opacity-40 hover:bg-gray-50">Prev</button>
            <button disabled={page >= pages} onClick={() => load(page + 1)}
              className="px-3 py-1.5 border border-gray-300 rounded disabled:opacity-40 hover:bg-gray-50">Next Start</button>
          </div>
        </div>
      )}
    </div>
  )
}

// Audit Logs Panel ---------------------------------------------------------
// Displays the general AuditLog collection (asset/employee/system actions).
// Admin-only. Mirrors the Auth Logs panel structure.
//
// Backend filter support (GET /audit):
//   ?entity=  — filter by entity type (Asset, Employee, etc.)
//   ?page=    — pagination
//   ?limit=   — page size
//
// Client-side filters (performedBy, from/to) are applied after fetch
// because the backend does not yet support those query params.
// 

const ENTITY_COLORS = {
  Asset:       'bg-blue-100 text-blue-700',
  Employee:    'bg-green-100 text-green-700',
  Inventory:   'bg-yellow-100 text-yellow-700',
  Location:    'bg-purple-100 text-purple-700',
  Region:      'bg-indigo-100 text-indigo-700',
  License:     'bg-orange-100 text-orange-700',
  Maintenance: 'bg-red-100 text-red-700',
  Assignment:  'bg-teal-100 text-teal-700',
  User:        'bg-pink-100 text-pink-700',
}

const ACTION_BADGE_COLORS = {
  CREATE:  'bg-green-100 text-green-700',
  UPDATE:  'bg-blue-100 text-blue-700',
  DELETE:  'bg-red-100 text-red-700',
  IMPORT:  'bg-yellow-100 text-yellow-700',
  EXPORT:  'bg-purple-100 text-purple-700',
  MIGRATE: 'bg-orange-100 text-orange-700',
}

function actionBadgeColor(action = '') {
  const key = Object.keys(ACTION_BADGE_COLORS).find(k => action.toUpperCase().includes(k))
  return key ? ACTION_BADGE_COLORS[key] : 'bg-gray-100 text-gray-600'
}

function AuditLogsPanel() {
  const [logs, setLogs]       = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')
  const [total, setTotal]     = useState(0)
  const [page, setPage]       = useState(1)
  const LIMIT = 50

  // Filters
  const [entityFilter, setEntityFilter]   = useState('')
  const [userFilter, setUserFilter]       = useState('')
  const [fromFilter, setFromFilter]       = useState('')
  const [toFilter, setToFilter]           = useState('')

  const load = useCallback(async (p = 1) => {
    setLoading(true)
    setError('')
    try {
      const params = { page: p, limit: LIMIT }
      if (entityFilter) params.entity = entityFilter
      const res = await getAuditLogs(params)
      setLogs(Array.isArray(res.data?.data) ? res.data.data : [])
      setTotal(res.data?.total || 0)
      setPage(p)
    } catch (e) {
      setError(e.response?.data?.message || 'Failed to load audit logs')
      setLogs([])
    } finally {
      setLoading(false)
    }
  }, [entityFilter])

  useEffect(() => { load(1) }, [load])

  // Client-side filters for fields not supported by backend query params
  const filtered = logs.filter(log => {
    if (userFilter && !(log.performedBy || '').toLowerCase().includes(userFilter.toLowerCase())) return false
    if (fromFilter && new Date(log.createdAt) < new Date(fromFilter)) return false
    if (toFilter   && new Date(log.createdAt) > new Date(toFilter + 'T23:59:59')) return false
    return true
  })

  const pages = Math.ceil(total / LIMIT)

  function clearFilters() {
    setEntityFilter('')
    setUserFilter('')
    setFromFilter('')
    setToFilter('')
  }

  // Render details object as a compact key: value string
  function renderDetails(details) {
    if (!details || typeof details !== 'object') return details ? String(details) : '—'
    const entries = Object.entries(details).slice(0, 3)
    if (!entries.length) return '—'
    return entries.map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`).join(' · ')
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-gray-800">Audit Logs</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            {total.toLocaleString()} total records — asset, employee, and system changes
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white border border-gray-200 rounded-md p-4 grid grid-cols-2 md:grid-cols-4 gap-3">
        <div>
          <label className="text-xs text-gray-500 mb-1 block">Entity Type</label>
          <select value={entityFilter} onChange={e => setEntityFilter(e.target.value)} className={inp}>
            <option value="">All Entities</option>
            {['Asset','Employee','Inventory','Location','Region','License','Maintenance','Assignment','User'].map(e => (
              <option key={e} value={e}>{e}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-gray-500 mb-1 block">Performed By</label>
          <input
            placeholder="Filter by username"
            value={userFilter}
            onChange={e => setUserFilter(e.target.value)}
            className={inp}
          />
        </div>
        <div>
          <label className="text-xs text-gray-500 mb-1 block">From</label>
          <input type="date" value={fromFilter} onChange={e => setFromFilter(e.target.value)} className={inp} />
        </div>
        <div>
          <label className="text-xs text-gray-500 mb-1 block">To</label>
          <input type="date" value={toFilter} onChange={e => setToFilter(e.target.value)} className={inp} />
        </div>
        <div className="md:col-span-4 flex justify-end">
          <button
            onClick={clearFilters}
            className="text-xs px-3 py-1.5 border border-gray-300 rounded text-gray-600 hover:bg-gray-50"
          >
            Clear Filters
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-md overflow-hidden">
        {loading ? (
          <div className="text-center py-14 text-gray-400 text-sm">
            <svg className="w-8 h-8 text-gray-200 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            Loading audit logs...
          </div>
        ) : error ? (
          <div className="text-center py-14">
            <svg className="w-8 h-8 text-red-300 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
            <p className="text-red-600 text-sm font-medium">{error}</p>
            <button
              onClick={() => load(page)}
              className="mt-3 text-xs px-4 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Retry
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-14 text-gray-400">
            <svg className="w-10 h-10 text-gray-200 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
            <p className="text-sm font-medium text-gray-500">No audit logs found</p>
            <p className="text-xs mt-1">
              {userFilter || fromFilter || toFilter
                ? 'Try adjusting your filters'
                : 'Actions on assets, employees, and system data will appear here'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {['Time', 'Performed By', 'Action', 'Entity', 'Entity ID', 'Details', 'IP'].map(h => (
                    <th
                      key={h}
                      className="text-left px-3 py-2.5 text-gray-500 font-semibold uppercase tracking-wide whitespace-nowrap"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((log, i) => (
                  <tr
                    key={log._id}
                    className={`border-b border-gray-100 hover:bg-gray-50 transition-colors ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}
                  >
                    {/* Time */}
                    <td className="px-3 py-2 text-gray-500 whitespace-nowrap">
                      {new Date(log.createdAt).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'medium' })}
                    </td>

                    {/* Performed By */}
                    <td className="px-3 py-2 font-medium text-gray-700">
                      {log.performedBy || '—'}
                    </td>

                    {/* Action */}
                    <td className="px-3 py-2">
                      <span className={`px-2 py-0.5 rounded-full font-semibold text-[10px] ${actionBadgeColor(log.action)}`}>
                        {log.action || '—'}
                      </span>
                    </td>

                    {/* Entity */}
                    <td className="px-3 py-2">
                      {log.entity ? (
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${ENTITY_COLORS[log.entity] || 'bg-gray-100 text-gray-600'}`}>
                          {log.entity}
                        </span>
                      ) : '—'}
                    </td>

                    {/* Entity ID */}
                    <td className="px-3 py-2 text-gray-400 font-mono text-[10px]">
                      {log.entityId ? log.entityId.slice(-8) : '—'}
                    </td>

                    {/* Details */}
                    <td className="px-3 py-2 text-gray-500 max-w-[200px] truncate" title={JSON.stringify(log.details)}>
                      {renderDetails(log.details)}
                    </td>

                    {/* IP */}
                    <td className="px-3 py-2 text-gray-400 font-mono">
                      {log.ip || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {pages > 1 && (
        <div className="flex items-center justify-between text-xs text-gray-500">
          <span>
            Page {page} of {pages} ({total.toLocaleString()} total)
            {(userFilter || fromFilter || toFilter) && filtered.length !== logs.length && (
              <span className="ml-2 text-blue-600">· {filtered.length} shown after client filters</span>
            )}
          </span>
          <div className="flex gap-1">
            <button
              disabled={page <= 1}
              onClick={() => load(page - 1)}
              className="px-3 py-1.5 border border-gray-300 rounded disabled:opacity-40 hover:bg-gray-50"
            >
              Prev
            </button>
            <button
              disabled={page >= pages}
              onClick={() => load(page + 1)}
              className="px-3 py-1.5 border border-gray-300 rounded disabled:opacity-40 hover:bg-gray-50"
            >
              Next Start
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// Google Users Panel -------------------------------------------------------
function GoogleUsersPanel() {
  const [users, setUsers]     = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')

  useEffect(() => {
    setLoading(true)
    getGoogleUsers()
      .then(r => setUsers(Array.isArray(r.data?.data) ? r.data.data : []))
      .catch(e => setError(e.response?.data?.message || 'Failed to load Google users'))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-base font-semibold text-gray-800">Google Users</h2>
        <p className="text-xs text-gray-400 mt-0.5">Users who signed in via Google OAuth</p>
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-4 py-2">{error}</p>}

      <div className="bg-white border border-gray-200 rounded-md overflow-hidden">
        {loading ? (
          <div className="text-center py-12 text-gray-400 text-sm">Loading...</div>
        ) : users.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            
            <p className="text-sm font-medium text-gray-500">No Google users found</p>
            <p className="text-xs mt-1">Users who sign in with Google will appear here</p>
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {['Username', 'Full Name', 'Email', 'Role', 'Google ID', 'Joined'].map(h => (
                  <th key={h} className="text-left px-3 py-2.5 text-gray-500 font-semibold uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.map((u, i) => (
                <tr key={u._id} className={`border-b border-gray-100 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}>
                  <td className="px-3 py-2 font-medium text-gray-700">{u.username}</td>
                  <td className="px-3 py-2 text-gray-600">{u.fullName || '—'}</td>
                  <td className="px-3 py-2 text-gray-600">{u.email || '—'}</td>
                  <td className="px-3 py-2">
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-100 text-blue-700">
                      {u.role}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-gray-400 font-mono text-[10px]">{u.googleId?.slice(-12) || '—'}</td>
                  <td className="px-3 py-2 text-gray-400">
                    {new Date(u.createdAt).toLocaleDateString('en-IN', { dateStyle: 'short' })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

// MFA Panel ----------------------------------------------------------------
function MfaPanel() {
  const [status, setStatus]     = useState(null)   // null = loading
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState('')

  // Setup flow
  const [qrDataUrl, setQrDataUrl] = useState('')
  const [secret, setSecret]       = useState('')
  const [setupOtp, setSetupOtp]   = useState('')
  const [setupMsg, setSetupMsg]   = useState({ text: '', ok: true })
  const [setupBusy, setSetupBusy] = useState(false)
  const [showSetup, setShowSetup] = useState(false)

  // Disable flow
  const [disableOtp, setDisableOtp]   = useState('')
  const [disableMsg, setDisableMsg]   = useState({ text: '', ok: true })
  const [disableBusy, setDisableBusy] = useState(false)
  const [showDisable, setShowDisable] = useState(false)

  useEffect(() => { loadStatus() }, [])

  async function loadStatus() {
    setLoading(true); setError('')
    try {
      const r = await mfaStatus()
      setStatus(r.data.mfaEnabled)
    } catch (e) {
      setError(e.response?.data?.message || 'Failed to load MFA status')
    } finally { setLoading(false) }
  }

  async function handleSetupStart() {
    setSetupMsg({ text: '', ok: true }); setSetupBusy(true)
    try {
      const r = await mfaSetup()
      setQrDataUrl(r.data.qrDataUrl)
      setSecret(r.data.secret)
      setShowSetup(true)
    } catch (e) {
      setSetupMsg({ text: e.response?.data?.message || 'Setup failed', ok: false })
    } finally { setSetupBusy(false) }
  }

  async function handleSetupVerify(e) {
    e.preventDefault()
    setSetupMsg({ text: '', ok: true }); setSetupBusy(true)
    try {
      await mfaVerify(setupOtp)
      setSetupMsg({ text: 'MFA enabled. Future logins will require an OTP.', ok: true })
      setShowSetup(false); setQrDataUrl(''); setSecret(''); setSetupOtp('')
      setStatus(true)
    } catch (e) {
      setSetupMsg({ text: e.response?.data?.message || 'Invalid OTP', ok: false })
    } finally { setSetupBusy(false) }
  }

  async function handleDisable(e) {
    e.preventDefault()
    setDisableMsg({ text: '', ok: true }); setDisableBusy(true)
    try {
      await mfaDisable(disableOtp)
      setDisableMsg({ text: 'MFA disabled.', ok: true })
      setShowDisable(false); setDisableOtp('')
      setStatus(false)
    } catch (e) {
      setDisableMsg({ text: e.response?.data?.message || 'Invalid OTP', ok: false })
    } finally { setDisableBusy(false) }
  }

  if (loading) return <div className="text-sm text-gray-400 py-8 text-center">Loading...</div>
  if (error)   return <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-4 py-3">{error}</div>

  return (
    <div className="flex flex-col gap-5 max-w-lg">
      {/* Status card */}
      <div className="bg-white border border-gray-200 rounded-md p-6">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-base font-semibold text-gray-800">Two-Factor Authentication</h2>
          <span className={`flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full ${status ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
            {status
              ? <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
              : <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" /></svg>
            }
            {status ? 'Enabled' : 'Disabled'}
          </span>
        </div>
        <p className="text-xs text-gray-400 mb-5">
          Protect your account with a time-based one-time password (TOTP) from Google Authenticator or any compatible app.
        </p>

        {!status && !showSetup && (
          <div className="flex flex-col gap-3">
            <button
              onClick={handleSetupStart}
              disabled={setupBusy}
              className="w-fit bg-green-600 hover:bg-green-700 text-white text-sm font-semibold px-5 py-2 rounded-lg transition-colors disabled:opacity-60"
            >
              {setupBusy ? 'Generating...' : 'Enable Two-Factor Auth'}
            </button>
            {setupMsg.text && (
              <p className={`text-xs px-3 py-2 rounded-lg ${setupMsg.ok ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
                {setupMsg.text}
              </p>
            )}
          </div>
        )}

        {/* QR setup flow */}
        {showSetup && (
          <div className="flex flex-col gap-4">
            <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 text-xs text-blue-700">
              <p className="font-semibold mb-1">Step 1 — Scan this QR code</p>
              <p>Open Google Authenticator (or Authy) and scan the code below.</p>
            </div>

            <div className="flex flex-col items-center gap-3 py-2">
              <img src={qrDataUrl} alt="MFA QR Code" className="w-48 h-48 border border-gray-200 rounded-lg" />
              <div className="text-center">
                <p className="text-xs text-gray-400 mb-1">Can't scan? Enter this key manually:</p>
                <code className="text-xs bg-gray-100 px-3 py-1.5 rounded font-mono tracking-widest select-all">{secret}</code>
              </div>
            </div>

            <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 text-xs text-blue-700">
              <p className="font-semibold mb-1">Step 2 — Verify your setup</p>
              <p>Enter the 6-digit code from your authenticator app to confirm.</p>
            </div>

            <form onSubmit={handleSetupVerify} className="flex flex-col gap-3">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">One-Time Password</label>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  placeholder="000000"
                  value={setupOtp}
                  onChange={e => setSetupOtp(e.target.value.replace(/\D/g, ''))}
                  className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm text-center tracking-widest font-mono focus:outline-none focus:ring-2 focus:ring-green-500"
                  autoFocus
                  required
                />
              </div>
              {setupMsg.text && (
                <p className={`text-xs px-3 py-2 rounded-lg ${setupMsg.ok ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
                  {setupMsg.text}
                </p>
              )}
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={setupBusy || setupOtp.length !== 6}
                  className="bg-green-600 hover:bg-green-700 text-white text-sm font-semibold px-5 py-2 rounded-lg transition-colors disabled:opacity-60"
                >
                  {setupBusy ? 'Verifying...' : 'Confirm & Enable'}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowSetup(false); setQrDataUrl(''); setSecret(''); setSetupOtp(''); setSetupMsg({ text: '', ok: true }) }}
                  className="text-sm px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-600"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Disable flow */}
        {status && !showDisable && (
          <div className="flex flex-col gap-3">
            <div className="bg-green-50 border border-green-100 rounded-lg px-4 py-3 text-xs text-green-700">
              Your account is protected with two-factor authentication. Every login requires an OTP from your authenticator app.
            </div>
            <button
              onClick={() => { setShowDisable(true); setDisableMsg({ text: '', ok: true }) }}
              className="w-fit text-sm px-4 py-2 border border-red-200 text-red-600 hover:bg-red-50 rounded-lg font-medium transition-colors"
            >
              Disable Two-Factor Auth
            </button>
          </div>
        )}

        {showDisable && (
          <form onSubmit={handleDisable} className="flex flex-col gap-3 mt-2">
            <div className="bg-red-50 border border-red-100 rounded-lg px-4 py-3 text-xs text-red-700">
              Enter your current OTP to confirm. This will revoke all active sessions.
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Current OTP</label>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                placeholder="000000"
                value={disableOtp}
                onChange={e => setDisableOtp(e.target.value.replace(/\D/g, ''))}
                className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm text-center tracking-widest font-mono focus:outline-none focus:ring-2 focus:ring-red-400"
                autoFocus
                required
              />
            </div>
            {disableMsg.text && (
              <p className={`text-xs px-3 py-2 rounded-lg ${disableMsg.ok ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
                {disableMsg.text}
              </p>
            )}
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={disableBusy || disableOtp.length !== 6}
                className="bg-red-600 hover:bg-red-700 text-white text-sm font-semibold px-5 py-2 rounded-lg transition-colors disabled:opacity-60"
              >
                {disableBusy ? 'Disabling...' : 'Disable MFA'}
              </button>
              <button
                type="button"
                onClick={() => { setShowDisable(false); setDisableOtp(''); setDisableMsg({ text: '', ok: true }) }}
                className="text-sm px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-600"
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Info card */}
      <div className="bg-white border border-gray-200 rounded-md p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Compatible Apps</h3>
        <div className="grid grid-cols-2 gap-2 text-xs text-gray-500">
          {['Google Authenticator', 'Authy', 'Microsoft Authenticator', '1Password', 'Bitwarden', 'Any TOTP app'].map(app => (
            <div key={app} className="flex items-center gap-1.5">
              <svg class="w-3.5 h-3.5 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg> {app}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

