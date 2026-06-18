/**
 * AuthCallback.jsx — Google OAuth callback handler
 * Reads tokens from query params or postMessage from Railway OAuth page.
 */
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { setTokens } from '../services/api'
import { useAuth } from '../context/AuthContext'

export default function AuthCallback() {
  const navigate = useNavigate()
  const { signIn } = useAuth()
  const [status, setStatus] = useState('Processing...')

  useEffect(() => {
    async function handleTokens(token, refresh) {
      try {
        setStatus('Signing you in...')
        setTokens(token, refresh)
        await signIn('', token, refresh)
        navigate('/dashboard', { replace: true })
      } catch {
        navigate('/login?error=' + encodeURIComponent('Failed to complete sign-in'))
      }
    }

    async function handleCallback() {
      const searchParams = new URLSearchParams(window.location.search)
      const token   = searchParams.get('token')
      const refresh = searchParams.get('refresh')
      const error   = searchParams.get('error')

      window.history.replaceState({}, document.title, window.location.pathname)

      if (error) {
        const messages = {
          google_disabled:  'Google login is not enabled on this server.',
          google_failed:    'Google authentication failed. Please try again.',
          account_disabled: 'Your account has been disabled.',
          server_error:     'A server error occurred. Please try again.',
          tenant_invalid:   'Your account has no tenant assigned. Contact your administrator.',
        }
        navigate(`/login?error=${encodeURIComponent(messages[error] || error)}`)
        return
      }

      if (token) {
        await handleTokens(token, refresh)
        return
      }

      // No token in URL — wait for postMessage from Railway OAuth page
      setStatus('Waiting for Google...')
    }

    handleCallback()

    // Listen for postMessage from Railway OAuth intermediate page
    function onMessage(event) {
      const apiBase = import.meta.env.VITE_API_URL || ''
      const allowedOrigin = apiBase || 'https://isomac-production-5b81.up.railway.app'
      if (event.origin !== allowedOrigin) return
      if (event.data?.type === 'oauth_tokens') {
        handleTokens(event.data.token, event.data.refresh)
      }
    }

    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [navigate, signIn])

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center',
      justifyContent: 'center', background: '#111827',
      flexDirection: 'column', gap: '12px',
    }}>
      <div style={{
        width: 40, height: 40, border: '3px solid #16a34a',
        borderTopColor: 'transparent', borderRadius: '50%',
        animation: 'spin 0.8s linear infinite',
      }} />
      <p style={{ color: '#9ca3af', fontSize: 14 }}>{status}</p>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
