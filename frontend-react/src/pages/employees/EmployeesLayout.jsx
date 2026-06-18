import { useEffect, useState } from 'react'
import { getEmployees, getRegions } from '../../services/api'
import Layout from '../../components/Layout'
import EmployeeList from './EmployeeList'
import Regions from './Regions'

export default function EmployeesLayout() {
  const [employees, setEmployees] = useState([])
  const [regions, setRegions]     = useState([])
  const [view, setView]           = useState('employees') // 'employees' | 'regions'
  const [loading, setLoading]     = useState(true)

  useEffect(() => { load() }, [])

  async function load() {
    try {
      const [eRes, rRes] = await Promise.all([getEmployees(), getRegions()])
      // Handle both paginated { data: [...] } and legacy flat array responses
      const empList = Array.isArray(eRes.data?.data) ? eRes.data.data : (Array.isArray(eRes.data) ? eRes.data : [])
      setEmployees(empList)
      setRegions(Array.isArray(rRes.data) ? rRes.data : [])
    } catch (e) {
      console.error('EmployeesLayout load error:', e)
      setEmployees([])
      setRegions([])
    } finally {
      setLoading(false)
    }
  }

  return (
    <Layout>
      <div className="flex flex-col gap-4">
        {/* Header + view tabs */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-bold text-gray-800">Employees</h1>
            <p className="text-xs text-gray-400 mt-0.5">{employees.length} employees</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setView('employees')}
              className={`text-sm font-semibold px-4 py-1.5 rounded-lg transition-colors ${
                view === 'employees'
                  ? 'bg-green-600 text-white'
                  : 'bg-white border border-gray-300 text-gray-600 hover:bg-gray-50'
              }`}
            >
              Employees
            </button>
            <button
              onClick={() => setView('regions')}
              className={`text-sm font-semibold px-4 py-1.5 rounded-lg transition-colors ${
                view === 'regions'
                  ? 'bg-green-600 text-white'
                  : 'bg-white border border-gray-300 text-gray-600 hover:bg-gray-50'
              }`}
            >
              Regions
            </button>
          </div>
        </div>

        {/* Main content */}
        {view === 'employees' ? (
          <EmployeeList
            employees={employees}
            regions={regions}
            loading={loading}
            onRefresh={load}
          />
        ) : (
          <Regions
            regions={regions}
            onRefresh={load}
          />
        )}
      </div>
    </Layout>
  )
}
