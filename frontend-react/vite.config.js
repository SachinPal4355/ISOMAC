import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const BACKEND = 'http://localhost:5000'

// Only proxy when the request is an API/XHR call (Accept: application/json or XMLHttpRequest).
// Browser page navigations (Accept: text/html) must NOT be proxied — they should serve index.html.
function apiOnly(req, _res, _options) {
  const accept = req.headers['accept'] || ''
  const isXHR  = req.headers['x-requested-with'] === 'XMLHttpRequest'
  if (accept.includes('text/html') && !isXHR && !accept.includes('application/json')) {
    return req.url  // return the URL to serve it locally (SPA fallback)
  }
  // return undefined → proxy proceeds normally
}

// Routes that are BOTH React pages AND API endpoints — need bypass logic
const sharedRoutes = {
  '/assets':       { target: BACKEND, changeOrigin: true, bypass: apiOnly },
  '/accessories':  { target: BACKEND, changeOrigin: true, bypass: apiOnly },
  '/assignments':  { target: BACKEND, changeOrigin: true, bypass: apiOnly },
  '/maintenance':  { target: BACKEND, changeOrigin: true, bypass: apiOnly },
  '/licenses':     { target: BACKEND, changeOrigin: true, bypass: apiOnly },
  '/locations':    { target: BACKEND, changeOrigin: true, bypass: apiOnly },
  '/employees':    { target: BACKEND, changeOrigin: true, bypass: apiOnly },
  '/inventory':    { target: BACKEND, changeOrigin: true, bypass: apiOnly },
}

// Routes that are API-only (no matching React page) — no bypass needed
const apiOnlyRoutes = {
  '/login':            { target: BACKEND, changeOrigin: true },
  '/logout':           { target: BACKEND, changeOrigin: true },
  '/register':         { target: BACKEND, changeOrigin: true },
  '/me':               { target: BACKEND, changeOrigin: true },
  '/users':            { target: BACKEND, changeOrigin: true },
  '/audit':            { target: BACKEND, changeOrigin: true },
  '/import':           { target: BACKEND, changeOrigin: true },
  '/alerts':           { target: BACKEND, changeOrigin: true },
  '/files':            { target: BACKEND, changeOrigin: true },
  '/upload':           { target: BACKEND, changeOrigin: true },
  '/health':           { target: BACKEND, changeOrigin: true },
  '/regions':          { target: BACKEND, changeOrigin: true },
  '/dynamic-fields':   { target: BACKEND, changeOrigin: true },
  '/asset-categories': { target: BACKEND, changeOrigin: true },
  '/tenants':          { target: BACKEND, changeOrigin: true },
  '/organizations':    { target: BACKEND, changeOrigin: true },
  '/requests':         { target: BACKEND, changeOrigin: true },
  // Auth API routes — specific paths only, NOT /auth/callback (that's a React page)
  '/auth/mfa':         { target: BACKEND, changeOrigin: true },
  '/auth/refresh':     { target: BACKEND, changeOrigin: true },
  '/auth/logout-all':  { target: BACKEND, changeOrigin: true },
  '/auth/sessions':    { target: BACKEND, changeOrigin: true },
  '/auth/audit-logs':  { target: BACKEND, changeOrigin: true },
  '/auth/google':      { target: BACKEND, changeOrigin: true },
}

export default defineConfig({
  base: '/',
  plugins: [react(), tailwindcss()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: { ...sharedRoutes, ...apiOnlyRoutes },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom') || id.includes('node_modules/react-router-dom')) {
            return 'vendor-react'
          }
          if (id.includes('node_modules/chart.js')) {
            return 'vendor-chart'
          }
          if (id.includes('node_modules/axios')) {
            return 'vendor-axios'
          }
        },
      },
    },
    chunkSizeWarningLimit: 600,
  },
})
