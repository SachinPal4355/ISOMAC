/**
 * api.js — Axios instance with enterprise-grade token management
 *
 * TOKEN STORAGE STRATEGY (Phase 8)
 * ─────────────────────────────────────────────────────────────
 * Access token  → in-memory only (module-level variable)
 *                 Never written to localStorage or sessionStorage.
 *                 Lost on page refresh — /me call re-establishes session.
 *
 * Refresh token → in-memory only.
 *                 Sent to POST /auth/refresh when access token expires.
 *
 * INTERCEPTOR BEHAVIOUR
 * ─────────────────────────────────────────────────────────────
 * On 401 with code TOKEN_EXPIRED:
 *   1. Attempt one token refresh via POST /auth/refresh
 *   2. If refresh succeeds → retry original request with new token
 *   3. If refresh fails    → clear tokens, force logout
 *   4. Concurrent 401s are queued and resolved after the single refresh
 *
 * Session-path (browser cookie) requests are unaffected — the interceptor
 * only activates when an Authorization header was present on the request.
 */

import axios from 'axios'

// ─── In-memory token store ────────────────────────────────────────────────────
let _accessToken  = null;
let _refreshToken = null;

export function setTokens(accessToken, refreshToken) {
  _accessToken  = accessToken  || null;
  _refreshToken = refreshToken || null;
}

export function clearTokens() {
  _accessToken  = null;
  _refreshToken = null;
}

export function getAccessToken() { return _accessToken; }

// ─── Axios instance ───────────────────────────────────────────────────────────
// In dev: baseURL is '' (proxied by Vite to localhost:5000)
// In production: VITE_API_URL points to the deployed backend (e.g. Render)
const api = axios.create({
  baseURL:         import.meta.env.VITE_API_URL || '',
  withCredentials: true, // always send session cookie
})

// ─── Request interceptor — attach access token if available ──────────────────
api.interceptors.request.use(config => {
  if (_accessToken) {
    config.headers['Authorization'] = `Bearer ${_accessToken}`;
  }
  return config;
});

// ─── Response interceptor — handle token expiry ──────────────────────────────
let _isRefreshing  = false;
let _refreshQueue  = []; // { resolve, reject }

function processQueue(error, token = null) {
  _refreshQueue.forEach(({ resolve, reject }) => {
    if (error) reject(error);
    else       resolve(token);
  });
  _refreshQueue = [];
}

api.interceptors.response.use(
  response => response,
  async error => {
    const original = error.config;

    // Only intercept 401s that came from a JWT-authenticated request
    // (i.e. we sent an Authorization header) and haven't been retried yet.
    const isTokenExpired = error.response?.status === 401 &&
      (error.response?.data?.code === 'TOKEN_EXPIRED' ||
       error.response?.data?.message === 'Token expired') &&
      !original._retried &&
      original.headers?.['Authorization'];

    if (!isTokenExpired) return Promise.reject(error);

    // If a refresh is already in progress, queue this request
    if (_isRefreshing) {
      return new Promise((resolve, reject) => {
        _refreshQueue.push({ resolve, reject });
      }).then(newToken => {
        original.headers['Authorization'] = `Bearer ${newToken}`;
        return api(original);
      });
    }

    original._retried = true;
    _isRefreshing     = true;

    try {
      if (!_refreshToken) throw new Error('No refresh token available');

      const { data } = await axios.post('/auth/refresh',
        { refreshToken: _refreshToken },
        { withCredentials: true }
      );

      const newAccess  = data.accessToken || data.token;
      const newRefresh = data.refreshToken;

      setTokens(newAccess, newRefresh);
      processQueue(null, newAccess);

      original.headers['Authorization'] = `Bearer ${newAccess}`;
      return api(original);
    } catch (refreshErr) {
      processQueue(refreshErr, null);
      clearTokens();
      // Dispatch a custom event so AuthContext can react (force logout)
      window.dispatchEvent(new CustomEvent('auth:session-expired'));
      return Promise.reject(refreshErr);
    } finally {
      _isRefreshing = false;
    }
  }
);

// ─── Auth ─────────────────────────────────────────────────────────────────────
export const login    = (username, password) => api.post('/login', { username, password })
export const logout   = (refreshToken)       => api.post('/logout', { refreshToken })
export const logoutAll = ()                  => api.post('/auth/logout-all')
export const refreshTokens = (refreshToken)  => api.post('/auth/refresh', { refreshToken })
export const register = (username, password, role, fullName = '', email = '', department = '') =>
  api.post('/register', { username, password, role, fullName, email, department })
export const getMe    = () => api.get('/me', { headers: { 'Cache-Control': 'no-cache' } })
export const getUsers = () => api.get('/users')
export const updateUserRole  = (id, role) => api.put(`/users/${id}/role`, { role })
export const deleteUser      = (id)       => api.delete(`/users/${id}`)
export const changePassword  = (currentPassword, newPassword) =>
  api.post('/users/me/password', { currentPassword, newPassword })
export const getSessions     = ()         => api.get('/auth/sessions')
export const unlockUser      = (id)       => api.post(`/users/${id}/unlock`)

// ─── MFA ──────────────────────────────────────────────────────────────────────
export const mfaSetup     = ()          => api.post('/auth/mfa/setup')
export const mfaVerify    = (otp)       => api.post('/auth/mfa/verify', { otp })
export const mfaDisable   = (otp)       => api.post('/auth/mfa/disable', { otp })
export const mfaChallenge = (challengeToken, otp) => api.post('/auth/mfa/challenge', { challengeToken, otp })
export const mfaStatus    = ()          => api.get('/auth/mfa/status')

// ─── Inventory ────────────────────────────────────────────────────────────────
export const getInventory    = ()               => api.get('/inventory')
export const addInventory    = (data)           => api.post('/inventory', data)
export const updateInventory = (serialno, data) => api.put(`/inventory/${serialno}`, data)

// ─── Assets ───────────────────────────────────────────────────────────────────
export const getAssets    = (params)     => api.get('/assets', { params })
export const getAsset     = (id)         => api.get(`/assets/${id}`)
export const createAsset  = (data)       => api.post('/assets', data)
export const updateAsset  = (id, data)   => api.put(`/assets/${id}`, data)
export const deleteAsset  = (id)         => api.delete(`/assets/${id}`)

// ─── Accessories ──────────────────────────────────────────────────────────────
export const getAccessories    = (params)   => api.get('/accessories', { params })
export const createAccessory   = (data)     => api.post('/accessories', data)
export const updateAccessory   = (id, data) => api.put(`/accessories/${id}`, data)
export const deleteAccessory   = (id)       => api.delete(`/accessories/${id}`)
export const exportAccessories = (params)   => api.get('/accessories/export', { params, responseType: 'blob' })

// ─── Assignments ──────────────────────────────────────────────────────────────
export const getAssignments    = (params) => api.get('/assignments', { params })
export const createAssignment  = (data)   => api.post('/assignments', data)
export const returnAssignment  = (id)     => api.put(`/assignments/${id}/return`)

// ─── Maintenance ──────────────────────────────────────────────────────────────
export const getMaintenanceLogs    = (params)   => api.get('/maintenance', { params })
export const createMaintenanceLog  = (data)     => api.post('/maintenance', data)
export const updateMaintenanceLog  = (id, data) => api.put(`/maintenance/${id}`, data)

// ─── Licenses ─────────────────────────────────────────────────────────────────
export const getLicenses    = (params)   => api.get('/licenses', { params })
export const createLicense  = (data)     => api.post('/licenses', data)
export const updateLicense  = (id, data) => api.put(`/licenses/${id}`, data)
export const deleteLicense  = (id)       => api.delete(`/licenses/${id}`)

// ─── Locations ────────────────────────────────────────────────────────────────
export const getLocations    = ()           => api.get('/locations')
export const createLocation  = (data)       => api.post('/locations', data)
export const updateLocation  = (id, data)   => api.put(`/locations/${id}`, data)
export const deleteLocation  = (id)         => api.delete(`/locations/${id}`)

// ─── Reports ──────────────────────────────────────────────────────────────────
export const getReportAssets    = (params) => api.get('/assets', { params })
export const getReportInventory = (params) => api.get('/inventory', { params })

// ─── Audit ────────────────────────────────────────────────────────────────────
export const getAuditLogs     = (params) => api.get('/audit', { params })
export const getAuthAuditLogs = (params) => api.get('/auth/audit-logs', { params })
export const getAuthAuditActions = ()    => api.get('/auth/audit-logs/actions')

// ─── Organizations ────────────────────────────────────────────────────────────
export const getOrganizations    = ()         => api.get('/organizations')
export const createOrganization  = (data)     => api.post('/organizations', data)
export const assignOrgAdmin      = (orgId, userId) => api.post(`/organizations/${orgId}/assign-admin`, { userId })
export const getOrgUsers         = (orgId)    => api.get(`/organizations/${orgId}/users`)

// ─── Requests ─────────────────────────────────────────────────────────────────
export const getRequests    = (params)   => api.get('/requests', { params })
export const createRequest  = (data)     => api.post('/requests', data)
export const updateRequest  = (id, data) => api.patch(`/requests/${id}`, data)
export const getRequest     = (id)       => api.get(`/requests/${id}`)

// ─── Google Users ─────────────────────────────────────────────────────────────
export const getGoogleUsers = () => api.get('/users/google')

// ─── Files ────────────────────────────────────────────────────────────────────
export const getFiles    = ()         => api.get('/files')
export const uploadFile  = (formData) => api.post('/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } })
export const getFileUrl  = (id)       => `/files/${id}`
export const deleteFile  = (id)       => api.delete(`/files/${id}`)
export const deleteFiles = (ids)      => api.delete('/files', { data: { ids } })

// ─── Import / Export ──────────────────────────────────────────────────────────
export const downloadTemplate = (mod) => `/import/${mod}/template`

export const previewImport = (mod, file, queryStr = '') => {
  const fd = new FormData(); fd.append('file', file)
  return api.post(`/import/${mod}/preview${queryStr}`, fd, { headers: { 'Content-Type': 'multipart/form-data' } })
}

export const commitImport = (mod, file, overlay = false, category = '') => {
  const fd = new FormData(); fd.append('file', file)
  const qs = new URLSearchParams({ overlay: String(overlay) })
  if (category) qs.set('category', category)
  return api.post(`/import/${mod}/commit?${qs.toString()}`, fd, { headers: { 'Content-Type': 'multipart/form-data' } })
}

export default api

// ─── Alerts ───────────────────────────────────────────────────────────────────
export const getAlerts        = (params) => api.get('/alerts', { params })
export const getUnreadCount   = ()       => api.get('/alerts/unread-count')
export const markAlertRead    = (id)     => api.put(`/alerts/${id}/read`)
export const markAllAlertsRead = ()      => api.put('/alerts/read-all')
export const deleteAlert      = (id)     => api.delete(`/alerts/${id}`)
export const runAlertChecks   = (config) => api.post('/alerts/run-checks', config)

// ─── Employees ────────────────────────────────────────────────────────────────
export const getEmployees    = (params)   => api.get('/employees', { params })
export const createEmployee  = (data)     => api.post('/employees', data)
export const updateEmployee  = (id, data) => api.put(`/employees/${id}`, data)
export const deleteEmployee  = (id)       => api.delete(`/employees/${id}`)
export const exportEmployees = (params)   => api.get('/employees/export', { params, responseType: 'blob' })

// ─── Regions ──────────────────────────────────────────────────────────────────
export const getRegions    = ()     => api.get('/regions')
export const createRegion  = (data) => api.post('/regions', data)

// ─── Employee Asset History ───────────────────────────────────────────────────
export const getEmployeeAssetHistory = (id) => api.get(`/employees/${id}/asset-history`)

// ─── Dynamic Fields ───────────────────────────────────────────────────────────
export const getEmployeeFields       = ()       => api.get('/dynamic-fields', { params: { entityType: 'employee' } })
export const createEmployeeField     = (data)   => api.post('/dynamic-fields', { ...data, entityType: 'employee', category: '' })
export const updateEmployeeField     = (id, data) => api.put(`/dynamic-fields/${id}`, data)
export const getAssetCategoryFields  = (category) => api.get('/dynamic-fields', { params: { entityType: 'asset', category } })
export const createAssetCategoryField = (data)  => api.post('/dynamic-fields', { ...data, entityType: 'asset' })
export const updateAssetCategoryField = (id, data) => api.put(`/dynamic-fields/${id}`, data)
export const deleteAssetCategoryField = (id)    => api.delete(`/dynamic-fields/${id}`)
export const getDynamicFields        = (entityType, category) =>
  api.get('/dynamic-fields', { params: { entityType, ...(category !== undefined ? { category } : {}) } })
export const getFieldSchema          = (entityType, category) =>
  api.get('/dynamic-fields/schema', { params: { entityType, ...(category !== undefined ? { category } : {}) } })
export const getFieldUsage           = (id)     => api.get(`/dynamic-fields/${id}/usage`)
export const createDynamicField      = (data)   => api.post('/dynamic-fields', data)
export const updateDynamicField      = (id, data) => api.put(`/dynamic-fields/${id}`, data)
export const deleteDynamicField      = (id, force = false) =>
  api.delete(`/dynamic-fields/${id}`, { params: force ? { force: 'true' } : {} })

// ─── Assets / Export ──────────────────────────────────────────────────────────
export const exportAssets         = (params) => api.get('/assets/export', { params, responseType: 'blob' })
export const migrateFromInventory = ()       => api.post('/assets/migrate-from-inventory')
export const reclassifyAssets     = ()       => api.post('/assets/reclassify')
export const getAssetQR           = (id, format = 'dataurl') => api.get(`/assets/${id}/qr`, { params: { format } })
export const getBulkQR            = (ids)    => api.post('/assets/qr/bulk', { ids })

// ─── Asset Categories ─────────────────────────────────────────────────────────
export const getAssetCategories    = ()         => api.get('/asset-categories')
export const createAssetCategory   = (data)     => api.post('/asset-categories', data)
export const updateAssetCategory   = (id, data) => api.put(`/asset-categories/${id}`, data)
export const deleteAssetCategory   = (id)       => api.delete(`/asset-categories/${id}`)

// ─── Tenants ──────────────────────────────────────────────────────────────────
export const getTenants = () => api.get('/tenants')
