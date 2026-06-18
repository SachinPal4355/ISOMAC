import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import ErrorBoundary from './components/ErrorBoundary'

// Eagerly load Login (always needed first)
import Login from './pages/Login'
import AuthCallback from './pages/AuthCallback'

// Lazy-load all protected pages — reduces initial bundle size
const Dashboard      = lazy(() => import('./pages/Dashboard'))
const Assets         = lazy(() => import('./pages/Assets'))
const Accessories    = lazy(() => import('./pages/Accessories'))
const Assignments    = lazy(() => import('./pages/Assignments'))
const Maintenance    = lazy(() => import('./pages/Maintenance'))
const Licenses       = lazy(() => import('./pages/Licenses'))
const Locations      = lazy(() => import('./pages/Locations'))
const EmployeesLayout = lazy(() => import('./pages/employees/EmployeesLayout'))
const Invoice        = lazy(() => import('./pages/Invoice'))
const Category       = lazy(() => import('./pages/Category'))
const Settings       = lazy(() => import('./pages/Settings'))
const Requests       = lazy(() => import('./pages/Requests'))

const PageLoader = () => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: '#6b7280', fontSize: 14 }}>
    Loading...
  </div>
)

const P = ({ children }) => <ProtectedRoute>{children}</ProtectedRoute>

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <BrowserRouter>
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path="/"             element={<Login />} />
              <Route path="/auth/callback" element={<AuthCallback />} />
              <Route path="/dashboard"   element={<P><Dashboard /></P>} />
              <Route path="/assets"      element={<P><Assets /></P>} />
              <Route path="/accessories" element={<P><Accessories /></P>} />
              <Route path="/assignments" element={<P><Assignments /></P>} />
              <Route path="/maintenance" element={<P><Maintenance /></P>} />
              <Route path="/licenses"    element={<P><Licenses /></P>} />
              <Route path="/locations"   element={<P><Locations /></P>} />
              <Route path="/employees/*" element={<P><EmployeesLayout /></P>} />
              <Route path="/invoice"     element={<P><Invoice /></P>} />
              <Route path="/category"    element={<P><Category /></P>} />
              <Route path="/settings"    element={<P><Settings /></P>} />
              <Route path="/requests"    element={<P><Requests /></P>} />

              <Route path="/inventory"     element={<Navigate to="/assets" replace />} />
              <Route path="/reports"       element={<Navigate to="/settings?tab=reports" replace />} />
              <Route path="/import-export" element={<Navigate to="/settings?tab=import-export" replace />} />
              <Route path="/alerts"        element={<Navigate to="/settings?tab=view-alerts" replace />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </AuthProvider>
    </ErrorBoundary>
  )
}
