import { useEffect, useState, useRef, useMemo } from 'react'
import { deleteEmployee, getDynamicFields } from '../../services/api'
import { useAuth } from '../../context/AuthContext'
import DataTable from '../../components/DataTable'
import Badge from '../../components/Badge'
import EmployeeForm from './EmployeeForm'
import EmployeeDetailPanel from './EmployeeDetailPanel'

function getEmpColKey(userId) {
  return `emp_col_prefs_${userId}`
}

export default function EmployeeList({ employees, regions, loading, onRefresh }) {
  const { isAdmin, isEditor, user } = useAuth()

  // Field config state
  const [fieldConfig, setFieldConfig] = useState([])

  // Column visibility (localStorage per user)
  const [hiddenCols, setHiddenCols] = useState({})
  const [colPickerOpen, setColPickerOpen] = useState(false)
  const colPickerRef = useRef(null)

  // Sidebar state
  const [expandedRegions, setExpandedRegions] = useState({})
  const [selectedRegionId, setSelectedRegionId] = useState(null)
  const [selectedDept, setSelectedDept] = useState(null)

  // Search
  const [search, setSearch] = useState('')

  // Detail panel state
  const [detailEmployee, setDetailEmployee] = useState(null)

  // Modal state
  const [formOpen, setFormOpen] = useState(false)
  const [selectedEmployee, setSelectedEmployee] = useState(null)

  // Toggle region expansion
  function toggleRegion(regionId) {
    setExpandedRegions(prev => ({ ...prev, [regionId]: !prev[regionId] }))
  }

  // Fetch field config on mount
  useEffect(() => {
    getDynamicFields('employee', '')
      .then(r => setFieldConfig(Array.isArray(r.data?.data) ? r.data.data.filter(f => f.visible).sort((a, b) => a.order - b.order) : []))
      .catch(() => {})
  }, [])

  // Load column prefs from localStorage
  useEffect(() => {
    const key = getEmpColKey(user?._id)
    try { setHiddenCols(JSON.parse(localStorage.getItem(key) || '{}')) } catch { setHiddenCols({}) }
  }, [user?._id])

  // Close col picker on outside click
  useEffect(() => {
    function handler(e) { if (colPickerRef.current && !colPickerRef.current.contains(e.target)) setColPickerOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  function saveHiddenCols(next) {
    setHiddenCols(next)
    localStorage.setItem(getEmpColKey(user?._id), JSON.stringify(next))
  }

  function toggleColVisibility(colKey) {
    saveHiddenCols({ ...hiddenCols, [colKey]: !hiddenCols[colKey] })
  }

  // Sidebar selection handlers
  function selectRegion(regionId) {
    if (selectedRegionId === regionId && selectedDept === null) {
      // Deselect
      setSelectedRegionId(null)
      setSelectedDept(null)
    } else {
      setSelectedRegionId(regionId)
      setSelectedDept(null)
    }
  }

  function selectDept(regionId, dept) {
    if (selectedRegionId === regionId && selectedDept === dept) {
      // Deselect
      setSelectedRegionId(null)
      setSelectedDept(null)
    } else {
      setSelectedRegionId(regionId)
      setSelectedDept(dept)
    }
  }

  // Filter logic — memoized to avoid recalculation on every render
  const filtered = useMemo(() => employees.filter(emp => {
    if (selectedRegionId) {
      const empRegionId = emp.regionId?._id || emp.regionId
      if (String(empRegionId) !== String(selectedRegionId)) return false
      if (selectedDept && emp.department !== selectedDept) return false
    }
    if (search) {
      const q = search.toLowerCase()
      const name = (emp.name || '').toLowerCase()
      const email = (emp.email || '').toLowerCase()
      const dept = (emp.department || '').toLowerCase()
      if (!name.includes(q) && !email.includes(q) && !dept.includes(q)) return false
    }
    return true
  }), [employees, selectedRegionId, selectedDept, search])

  // Delete handler
  async function handleDelete(emp) {
    if (!window.confirm(`Delete employee "${emp.name}"?`)) return
    try {
      await deleteEmployee(emp._id)
      onRefresh()
    } catch (e) {
      alert('❌ ' + (e.response?.data?.message || e.message))
    }
  }

  // Open add modal
  function openAdd() {
    setSelectedEmployee(null)
    setFormOpen(true)
  }

  // Open edit modal
  function openEdit(emp) {
    setSelectedEmployee(emp)
    setFormOpen(true)
  }

  function handleFormSaved() {
    setFormOpen(false)
    onRefresh()
  }

  const builtInRender = {
    name: (v, row) => (
      <button onClick={() => setDetailEmployee(row)} className="text-green-700 hover:underline font-medium text-left">
        {v || '—'}
      </button>
    ),
    email: (v) => <span className="text-gray-600">{v || '—'}</span>,
    department: (v) => v || '—',
    region: (_, row) => row.regionId?.name || '—',
    assignedAssets: (_, row) => <span className="font-semibold text-gray-700">{row.assets?.length ?? 0}</span>,
    status: (v) => <Badge label={v || 'Active'} />,
    phone: (v) => v || '—',
  }

  const allColDefs = fieldConfig.length > 0
    ? fieldConfig.map(field => ({
        key: field.name === 'region' ? 'regionId' : field.name,
        label: field.label,
        sortable: field.name !== 'region' && field.name !== 'assignedAssets',
        render: builtInRender[field.name]
          ? builtInRender[field.name]
          : (v, row) => row.customFields?.[field.name] ?? v ?? '—',
      }))
    : [
        { key: 'name', label: 'Name', render: (v, row) => <button onClick={() => setDetailEmployee(row)} className="text-green-700 hover:underline font-medium text-left">{v || '—'}</button> },
        { key: 'email', label: 'Email', render: v => <span className="text-gray-600">{v || '—'}</span> },
        { key: 'department', label: 'Department', render: v => v || '—' },
        { key: 'regionId', label: 'Region', sortable: false, render: v => v?.name || '—' },
        { key: '_id', label: 'Assigned Assets', sortable: false, render: (_, row) => <span className="font-semibold text-gray-700">{row.assets?.length ?? 0}</span> },
        { key: 'status', label: 'Status', render: v => <Badge label={v || 'Active'} /> },
      ]

  const columns = [
    ...allColDefs.filter(c => !hiddenCols[c.key]),
    {
      key: '__actions',
      label: 'Actions',
      sortable: false,
      render: (_, row) => (
        (isEditor || isAdmin) ? (
          <div className="flex gap-1">
            {isEditor && (
              <button onClick={() => openEdit(row)} className="text-xs bg-yellow-100 text-yellow-700 hover:bg-yellow-200 px-2 py-1 rounded font-medium">Edit</button>
            )}
            {isAdmin && (
              <button onClick={() => handleDelete(row)} className="text-xs bg-red-100 text-red-700 hover:bg-red-200 px-2 py-1 rounded font-medium">Del</button>
            )}
          </div>
        ) : null
      ),
    },
  ]

  const allPickerCols = allColDefs.map(c => ({ key: c.key, label: c.label }))

  return (
    <div className="flex gap-4">
      {/* Region Sidebar */}
      <div className="w-56 shrink-0 bg-white rounded-lg border border-gray-200 p-3 self-start">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Regions</h2>

        {/* All employees option */}
        <button
          onClick={() => { setSelectedRegionId(null); setSelectedDept(null) }}
          className={`w-full text-left px-2 py-1.5 rounded text-sm font-medium mb-1 transition-colors
            ${!selectedRegionId && !selectedDept
              ? 'bg-green-600 text-white'
              : 'hover:bg-gray-100 text-gray-700'}`}
        >
          All Employees
        </button>

        {regions.length === 0 && (
          <p className="text-xs text-gray-400 px-2">No regions yet</p>
        )}

        {regions.map(region => {
          const isExpanded = expandedRegions[region._id]
          const isRegionSelected = selectedRegionId === region._id && !selectedDept

          return (
            <div key={region._id} className="mb-0.5">
              {/* Region row */}
              <div className="flex items-center gap-1">
                <button
                  onClick={() => toggleRegion(region._id)}
                  className="text-gray-400 hover:text-gray-600 w-4 text-xs shrink-0"
                >
                  {isExpanded ? '▾' : '▸'}
                </button>
                <button
                  onClick={() => selectRegion(region._id)}
                  className={`flex-1 text-left px-2 py-1.5 rounded text-sm font-medium transition-colors
                    ${isRegionSelected
                      ? 'bg-green-600 text-white'
                      : 'hover:bg-gray-100 text-gray-700'}`}
                >
                  {region.name}
                </button>
              </div>

              {/* Departments */}
              {isExpanded && (region.departments || []).map(dept => {
                const isDeptSelected = selectedRegionId === region._id && selectedDept === dept
                return (
                  <button
                    key={dept}
                    onClick={() => selectDept(region._id, dept)}
                    className={`w-full text-left pl-7 pr-2 py-1.5 rounded text-sm transition-colors
                      ${isDeptSelected
                        ? 'bg-green-600 text-white'
                        : 'hover:bg-gray-100 text-gray-600'}`}
                  >
                    └ {dept}
                  </button>
                )
              })}

              {isExpanded && (!region.departments || region.departments.length === 0) && (
                <p className="pl-7 text-xs text-gray-400 py-1">No departments</p>
              )}
            </div>
          )
        })}
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col gap-3">
        {/* Toolbar */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <input
            placeholder="Search by name, email, or department..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400 w-72"
          />
          <div className="flex gap-2 items-center">
            {/* Column picker */}
            <div className="relative" ref={colPickerRef}>
              <button onClick={() => setColPickerOpen(v => !v)}
                className="border border-gray-300 text-gray-600 text-sm px-3 py-1.5 rounded-lg hover:bg-gray-50 flex items-center gap-1">
                <span>⚙️</span> Columns
              </button>
              {colPickerOpen && (
                <div className="absolute right-0 top-9 z-30 bg-white border border-gray-200 rounded-xl shadow-lg p-3 w-48 flex flex-col gap-1">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Show / Hide</p>
                  {allPickerCols.map(c => (
                    <label key={c.key} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer hover:bg-gray-50 px-1 py-0.5 rounded">
                      <input type="checkbox" checked={!hiddenCols[c.key]} onChange={() => toggleColVisibility(c.key)} className="accent-green-600" />
                      {c.label}
                    </label>
                  ))}
                </div>
              )}
            </div>
            {isEditor && (
              <button
                onClick={openAdd}
                className="bg-green-600 hover:bg-green-700 text-white text-sm font-semibold px-4 py-1.5 rounded-lg"
              >
                + Add Employee
              </button>
            )}
          </div>
        </div>

        {/* Table */}
        {!loading && employees.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-xl border border-gray-200">
            <div className="text-5xl mb-3">👥</div>
            <p className="text-gray-700 font-semibold text-base mb-1">No employees found</p>
            <p className="text-gray-400 text-sm mb-5">Add employees manually or import from a CSV file.</p>
            <div className="flex gap-3 justify-center">
              {isEditor && (
                <button onClick={openAdd}
                  className="bg-green-600 hover:bg-green-700 text-white text-sm font-semibold px-5 py-2 rounded-lg transition-colors">
                  + Add Employee
                </button>
              )}
            </div>
          </div>
        ) : (
          <DataTable
            columns={columns}
            rows={filtered}
            loading={loading}
            emptyText="No employees found"
          />
        )}
      </div>

      {/* Employee Form Modal */}
      {formOpen && (
        <EmployeeForm
          employee={selectedEmployee}
          regions={regions}
          onClose={() => setFormOpen(false)}
          onSaved={handleFormSaved}
        />
      )}

      {/* Employee Detail Panel */}
      {detailEmployee && (
        <EmployeeDetailPanel
          employee={detailEmployee}
          onClose={() => setDetailEmployee(null)}
        />
      )}
    </div>
  )
}
