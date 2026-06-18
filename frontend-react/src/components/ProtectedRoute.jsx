import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function ProtectedRoute({ children }) {
  const { user, sessionExpired, loading } = useAuth()
  const location = useLocation()

  // While /me is in-flight, show nothing — prevents flash of login page
  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center',
      justifyContent: 'center', background: '#f1f5f9', color: '#64748b', fontSize: 14 }}>
      Loading...
    </div>
  )

  if (user) return children

  return (
    <div style={styles.wrapper}>
      <div style={styles.card}>
        {sessionExpired ? (
          <>
            <div style={styles.icon}>⏱️</div>
            <h2 style={styles.title}>Session Expired</h2>
            <p style={styles.message}>
              Your session has expired after 2 hours of inactivity. Please log in again to continue.
            </p>
          </>
        ) : (
          <>
            <div style={styles.icon}>🔒</div>
            <h2 style={styles.title}>Please Login First</h2>
            <p style={styles.message}>
              You need to be logged in to access this page.
            </p>
          </>
        )}
        <Link
          to="/"
          state={{ from: location.pathname }}
          style={styles.button}
        >
          Go to Login
        </Link>
      </div>
    </div>
  )
}

const styles = {
  wrapper: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#f1f5f9',
    fontFamily: 'sans-serif',
  },
  card: {
    background: '#fff',
    borderRadius: '12px',
    padding: '48px 40px',
    textAlign: 'center',
    boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
    maxWidth: '380px',
    width: '100%',
  },
  icon: {
    fontSize: '48px',
    marginBottom: '16px',
  },
  title: {
    margin: '0 0 12px',
    fontSize: '22px',
    color: '#1e293b',
  },
  message: {
    color: '#64748b',
    fontSize: '15px',
    marginBottom: '28px',
    lineHeight: '1.5',
  },
  button: {
    display: 'inline-block',
    background: '#3b82f6',
    color: '#fff',
    padding: '10px 28px',
    borderRadius: '8px',
    textDecoration: 'none',
    fontWeight: '600',
    fontSize: '15px',
  },
}
