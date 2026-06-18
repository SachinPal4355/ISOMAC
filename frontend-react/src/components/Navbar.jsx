import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useState, useEffect, useRef } from 'react'
import { getAlerts, markAlertRead, markAllAlertsRead } from '../services/api'
import IsomacLogo from './IsomacLogo'

const NAV = [
  { to: '/dashboard',   label: 'Dashboard' },
  { to: '/assets',      label: 'Assets' },
  { to: '/accessories', label: 'Accessories' },
  { to: '/assignments', label: 'Loans' },
  { to: '/maintenance', label: 'Maintenance' },
  { to: '/licenses',    label: 'Software' },
  { to: '/locations',   label: 'Locations' },
  { to: '/employees',   label: 'Employees' },
  { to: '/invoice',     label: 'Invoices' },
]

const SEV_DOT = { high: 'bg-red-500', medium: 'bg-yellow-400', low: 'bg-blue-400' }

export default function Navbar() {
  const { user, signOut, isAdmin, isEmployee } = useAuth()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const isGoogleUser = user?.isGoogleUser || false

  const [alerts, setAlerts] = useState([])
  const [bellOpen, setBellOpen] = useState(false)
  const bellRef = useRef(null)

  useEffect(() => {
    let mounted = true
    async function fetchAlerts() {
      try {
        const res = await getAlerts({ status: 'unread' })
        if (mounted) setAlerts(Array.isArray(res.data?.data) ? res.data.data.slice(0, 10) : [])
      } catch { /* silent */ }
    }
    fetchAlerts()
    const interval = setInterval(fetchAlerts, 60000)
    return () => { mounted = false; clearInterval(interval) }
  }, [])

  useEffect(() => {
    function handler(e) {
      if (bellRef.current && !bellRef.current.contains(e.target)) setBellOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  async function handleMarkRead(id) {
    await markAlertRead(id)
    setAlerts(prev => prev.filter(a => a._id !== id))
  }

  async function handleMarkAll() {
    await markAllAlertsRead()
    setAlerts([])
  }

  async function handleLogout() {
    await signOut()
    navigate('/')
  }

  const unread = alerts.length

  return (
    <header style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)', boxShadow: '0 2px 8px rgba(0,0,0,0.25)' }}
      className="text-white flex-shrink-0 z-50">
      <div className="flex items-center h-14 px-5 gap-5">

        {/* Brand */}
        <div className="flex items-center flex-shrink-0 mr-2">
          <IsomacLogo size={34} showText={true} textSize="sm" />
        </div>

        {/* Divider */}
        <div className="w-px h-6 bg-gray-700 flex-shrink-0" />

        {/* Nav links — hidden for employees */}
        <nav className="flex items-center gap-0.5 flex-1 overflow-x-auto scrollbar-none">
          {!isEmployee && NAV.map(({ to, label }) => {
            const active = pathname === to || (to !== '/dashboard' && pathname.startsWith(to))
            return (
              <Link key={to} to={to}
                className={`px-3 py-1.5 rounded-md text-sm font-medium whitespace-nowrap transition-all duration-150
                  ${active
                    ? 'bg-green-600 text-white shadow-sm'
                    : 'text-gray-400 hover:text-white hover:bg-white/10'
                  }`}>
                {label}
              </Link>
            )
          })}
          {/* Employee-only: Requests link */}
          {isEmployee && (
            <Link to="/requests"
              className={`px-3 py-1.5 rounded-md text-sm font-medium whitespace-nowrap transition-all duration-150
                ${pathname === '/requests' ? 'bg-green-600 text-white shadow-sm' : 'text-gray-400 hover:text-white hover:bg-white/10'}`}>
              My Requests
            </Link>
          )}
        </nav>

        {/* Right section */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Settings — hidden for employees and Google users */}
          {!isEmployee && !isGoogleUser && (
            <Link to="/settings"
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium whitespace-nowrap transition-all duration-150
                ${pathname.startsWith('/settings') ? 'bg-green-600 text-white' : 'text-gray-400 hover:text-white hover:bg-white/10'}`}>
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
              Settings
            </Link>
          )}
          {/* Bell — hidden for employees and Google users */}
          {!isEmployee && !isGoogleUser && (
          <div className="relative" ref={bellRef}>
            <button onClick={() => setBellOpen(o => !o)}
              className="relative p-2 rounded-md hover:bg-white/10 transition-colors text-gray-400 hover:text-white">
              <svg className="w-4.5 h-4.5" style={{width:'18px',height:'18px'}} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
              {unread > 0 && (
                <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                  {unread > 9 ? '9+' : unread}
                </span>
              )}
            </button>

            {bellOpen && (
              <div className="absolute right-0 top-9 w-80 bg-white rounded-xl shadow-2xl border border-gray-200 z-50 overflow-hidden">
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100 bg-gray-50">
                  <span className="text-xs font-semibold text-gray-700">
                    Alerts {unread > 0 && <span className="text-red-500">({unread} unread)</span>}
                  </span>
                  <div className="flex gap-3">
                    {unread > 0 && (
                      <button onClick={handleMarkAll} className="text-xs text-blue-600 hover:underline">Mark all read</button>
                    )}
                    <Link to="/settings?tab=view-alerts" onClick={() => setBellOpen(false)}
                      className="text-xs text-green-600 hover:underline">View all</Link>
                  </div>
                </div>
                <div className="max-h-72 overflow-y-auto">
                  {alerts.length === 0 ? (
                    <div className="text-center py-8 text-gray-400 text-xs">No unread alerts</div>
                  ) : alerts.map(alert => (
                    <div key={alert._id}
                      className="flex items-start gap-2.5 px-4 py-3 hover:bg-gray-50 border-b border-gray-50 last:border-0">
                      <div className={`mt-1 w-2 h-2 rounded-full flex-shrink-0 ${SEV_DOT[alert.severity] || 'bg-gray-400'}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-gray-700 leading-snug">{alert.message}</p>
                        <p className="text-[10px] text-gray-400 mt-0.5">{new Date(alert.createdAt).toLocaleString()}</p>
                      </div>
                      <button onClick={() => handleMarkRead(alert._id)}
                        className="text-[10px] text-blue-500 hover:text-blue-700 flex-shrink-0 mt-0.5">✓</button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          )} {/* end bell conditional */}

          {/* Divider */}
          <div className="w-px h-5 bg-gray-700" />

          {/* User */}
          <div className="hidden sm:flex flex-col items-end leading-tight">
            <span className="text-xs text-white font-medium">{user?.username}</span>
            <span className="text-[10px] text-green-400 capitalize">{user?.role?.replace('_', ' ')}</span>
          </div>

          <button onClick={handleLogout}
            className="bg-red-600 hover:bg-red-700 text-white text-xs font-semibold px-3 py-1.5 rounded-md transition-colors">
            Logout
          </button>
        </div>
      </div>
    </header>
  )
}
