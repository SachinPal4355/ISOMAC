import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { login, mfaChallenge } from '../services/api'
import { useAuth } from '../context/AuthContext'
import IsomacLogo from '../components/IsomacLogo'

const GOOGLE_LOGIN_URL = import.meta.env.DEV
  ? 'http://localhost:5000/auth/google'
  : `${import.meta.env.VITE_API_URL}/auth/google`

const SAML_LOGIN_URL = import.meta.env.DEV
  ? 'http://localhost:5000/auth/saml/login'
  : `${import.meta.env.VITE_API_URL}/auth/saml/login`

export default function Login() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)

  // MFA step state
  const [mfaRequired, setMfaRequired]         = useState(false)
  const [challengeToken, setChallengeToken]   = useState('')
  const [otp, setOtp]                         = useState('')

  const { signIn } = useAuth()
  const navigate   = useNavigate()
  const location   = useLocation()

  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const oauthError = params.get('error')
    if (oauthError) setError(decodeURIComponent(oauthError))
  }, [location.search])

  async function handleLogin(e) {
    e.preventDefault()
    setError(''); setLoading(true)
    try {
      const res = await login(username, password)
      if (res.data.mfaRequired) {
        setChallengeToken(res.data.challengeToken)
        setMfaRequired(true)
      } else {
        await signIn(res.data.username, res.data.accessToken || res.data.token, res.data.refreshToken)
        navigate('/dashboard')
      }
    } catch (err) {
      setError(err.response?.data?.message || err.response?.data?.error || 'Login failed')
    } finally { setLoading(false) }
  }

  async function handleMfaSubmit(e) {
    e.preventDefault()
    setError(''); setLoading(true)
    try {
      const res = await mfaChallenge(challengeToken, otp)
      await signIn(res.data.username, res.data.accessToken || res.data.token, res.data.refreshToken)
      navigate('/dashboard')
    } catch (err) {
      setError(err.response?.data?.message || 'Invalid OTP')
    } finally { setLoading(false) }
  }

  function handleGoogleLogin() {
    window.location.href = GOOGLE_LOGIN_URL
  }

  function handleSamlLogin() {
    window.location.href = SAML_LOGIN_URL
  }

  if (mfaRequired) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="bg-white rounded-xl shadow-2xl p-8 w-full max-w-sm">
          <div className="flex flex-col items-center gap-2 mb-6">
            <div className="w-12 h-12 bg-green-600 rounded-xl flex items-center justify-center">
              <span className="text-white text-xl">🔐</span>
            </div>
            <h1 className="text-lg font-bold text-gray-800">Two-Factor Authentication</h1>
            <p className="text-xs text-gray-400 text-center">Enter the 6-digit code from your authenticator app</p>
          </div>
          <form onSubmit={handleMfaSubmit} className="flex flex-col gap-3">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">One-Time Password</label>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                placeholder="000000"
                value={otp}
                onChange={e => setOtp(e.target.value.replace(/\D/g, ''))}
                className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm text-center tracking-widest text-lg font-mono focus:outline-none focus:ring-2 focus:ring-green-500"
                autoFocus
                required
              />
            </div>
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-600 text-xs rounded-lg px-3 py-2">
                {error}
              </div>
            )}
            <button
              type="submit"
              disabled={loading || otp.length !== 6}
              className="bg-green-600 hover:bg-green-700 text-white font-semibold py-2.5 rounded-lg transition-colors disabled:opacity-60 mt-1"
            >
              {loading ? 'Verifying...' : 'Verify'}
            </button>
            <button
              type="button"
              onClick={() => { setMfaRequired(false); setChallengeToken(''); setOtp(''); setError('') }}
              className="text-xs text-gray-400 hover:text-gray-600 text-center"
            >
              ← Back to login
            </button>
          </form>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center">
      <div className="bg-white rounded-xl shadow-2xl p-8 w-full max-w-sm">
        {/* Brand */}
        <div className="flex flex-col items-center gap-3 mb-6">
          <IsomacLogo size={52} showText={false} />
          <div className="text-center">
            <h1 className="text-lg font-bold text-[#1a2340]">ISOMAC</h1>
            <p className="text-xs text-gray-400">Sign in to your account</p>
          </div>
        </div>

        {/* Google Sign-In */}
        <button
          type="button"
          onClick={handleGoogleLogin}
          className="w-full flex items-center justify-center gap-3 border border-gray-300 rounded-lg px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors mb-2"
        >
          <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
            <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"/>
            <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"/>
            <path fill="#FBBC05" d="M3.964 10.707A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.707V4.961H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.039l3.007-2.332z"/>
            <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.961L3.964 7.293C4.672 5.163 6.656 3.58 9 3.58z"/>
          </svg>
          Sign in with Google
        </button>

        {/* SSO / SAML Sign-In */}
        <button
          type="button"
          onClick={handleSamlLogin}
          className="w-full flex items-center justify-center gap-3 border border-blue-300 rounded-lg px-4 py-2.5 text-sm font-medium text-blue-700 hover:bg-blue-50 transition-colors mb-4"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Login with SSO
        </button>

        {/* Divider */}
        <div className="flex items-center gap-3 mb-4">
          <div className="flex-1 h-px bg-gray-200" />
          <span className="text-xs text-gray-400">or sign in with credentials</span>
          <div className="flex-1 h-px bg-gray-200" />
        </div>

        {/* Username / Password form */}
        <form onSubmit={handleLogin} className="flex flex-col gap-3">
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Username or Email</label>
            <input
              type="text"
              placeholder="Enter username or email"
              value={username}
              onChange={e => setUsername(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              required
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Password</label>
            <input
              type="password"
              placeholder="Enter password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              required
            />
          </div>
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 text-xs rounded-lg px-3 py-2">
              {error}
            </div>
          )}
          <button
            type="submit"
            disabled={loading}
            className="bg-green-600 hover:bg-green-700 text-white font-semibold py-2.5 rounded-lg transition-colors disabled:opacity-60 mt-1"
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  )
}
