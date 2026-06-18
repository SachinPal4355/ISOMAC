import { useRef, useState } from 'react'
import Layout from '../components/Layout'
import SidebarSection from '../components/SidebarSection'
import { downloadTemplate, previewImport, commitImport } from '../services/api'
import { useAuth } from '../context/AuthContext'

// ─── Constants ───────────────────────────────────────────────────────────────
const MODULES = [
  { value: 'assets',    label: 'Assets',    desc: 'Import IT assets with tag, category, serial, location' },
  { value: 'inventory', label: 'Inventory', desc: 'Bulk add inventory entries with serial and status' },
  { value: 'locations', label: 'Locations', desc: 'Import location hierarchy (name, address, description)' },
]

const OVERLAY_MODULES = [
  { value: 'assets', label: 'Asset Overlay', desc: 'Bulk update existing assets by Asset Tag' },
]

// SVG icons per module
const MOD_ICONS = {
  assets:    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>,
  inventory: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>,
  locations: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>,
}

const STEPS = ['Select Module', 'Upload File', 'Preview & Validate', 'Import Result']

// ─── Step indicator ──────────────────────────────────────────────────────────
function StepBar({ step }) {
  return (
    <div className="flex items-center gap-0 mb-6">
      {STEPS.map((s, i) => (
        <div key={s} className="flex items-center flex-1 last:flex-none">
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors
            ${i < step ? 'text-green-700' : i === step ? 'bg-green-600 text-white' : 'text-gray-400'}`}>
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0
              ${i < step ? 'bg-green-100 text-green-700' : i === step ? 'bg-white text-green-700' : 'bg-gray-100 text-gray-400'}`}>
              {i < step ? '✓' : i + 1}
            </span>
            {s}
          </div>
          {i < STEPS.length - 1 && (
            <div className={`flex-1 h-0.5 mx-1 ${i < step ? 'bg-green-400' : 'bg-gray-200'}`} />
          )}
        </div>
      ))}
    </div>
  )
}

// ─── Preview table ───────────────────────────────────────────────────────────
function PreviewTable({ rows }) {
  if (!rows?.length) return <p className="text-sm text-gray-400">No preview data</p>
  const keys = Object.keys(rows[0]).filter(k => rows[0][k] !== '')
  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 max-h-64">
      <table className="w-full text-xs">
        <thead className="bg-gray-50 sticky top-0">
          <tr>{keys.map(k => <th key={k} className="px-3 py-2 text-left font-semibold text-gray-500 whitespace-nowrap">{k}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-t border-gray-100 hover:bg-gray-50">
              {keys.map(k => <td key={k} className="px-3 py-2 text-gray-700 whitespace-nowrap">{row[k] || '—'}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─── Error list ──────────────────────────────────────────────────────────────
function ErrorList({ errors }) {
  if (!errors?.length) return null
  return (
    <div className="bg-red-50 border border-red-200 rounded-lg p-3 max-h-48 overflow-y-auto">
      <p className="text-xs font-semibold text-red-700 mb-2">{errors.length} row(s) with errors (will be skipped):</p>
      <ul className="space-y-1">
        {errors.map((e, i) => (
          <li key={i} className="text-xs text-red-600">
            Row {e.row}: {Array.isArray(e.errors) ? e.errors.join(', ') : e.errors}
          </li>
        ))}
      </ul>
    </div>
  )
}

// ─── Drop zone ───────────────────────────────────────────────────────────────
function DropZone({ onFile, file }) {
  const ref = useRef()
  const [drag, setDrag] = useState(false)

  function handleDrop(e) {
    e.preventDefault(); setDrag(false)
    const f = e.dataTransfer.files[0]
    if (f) onFile(f)
  }

  return (
    <div
      onDragOver={e => { e.preventDefault(); setDrag(true) }}
      onDragLeave={() => setDrag(false)}
      onDrop={handleDrop}
      onClick={() => ref.current.click()}
      className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors
        ${drag ? 'border-green-500 bg-green-50' : file ? 'border-green-400 bg-green-50' : 'border-gray-300 hover:border-green-400 hover:bg-gray-50'}`}
    >
      <input ref={ref} type="file" accept=".csv,.xlsx,.xls" className="hidden"
        onChange={e => e.target.files[0] && onFile(e.target.files[0])} />
      {file ? (
        <div className="flex flex-col items-center gap-2">
          <svg className="w-8 h-8 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          <p className="text-sm font-semibold text-green-700">{file.name}</p>
          <p className="text-xs text-gray-400">{(file.size / 1024).toFixed(1)} KB — click to change</p>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2">
          <svg className="w-8 h-8 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
          <p className="text-sm font-semibold text-gray-600">Drag & drop your file here</p>
          <p className="text-xs text-gray-400">or click to browse — CSV or XLSX, max 10 MB</p>
        </div>
      )}
    </div>
  )
}

// ─── Main component ──────────────────────────────────────────────────────────
export default function ImportExport() {
  const { isEditor } = useAuth()

  // Panel: 'import' | 'overlay' | 'export'
  const [panel, setPanel] = useState('import')

  // Import wizard state
  const [step, setStep]         = useState(0)
  const [selModule, setSelModule] = useState(null)
  const [overlay, setOverlay]   = useState(false)
  const [file, setFile]         = useState(null)
  const [previewData, setPreviewData] = useState(null)
  const [result, setResult]     = useState(null)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')

  function reset() {
    setStep(0); setSelModule(null); setFile(null)
    setPreviewData(null); setResult(null); setError('')
  }

  // Step 0 → 1: select module
  function selectModule(mod, isOverlay = false) {
    setSelModule(mod); setOverlay(isOverlay)
    setFile(null); setPreviewData(null); setResult(null); setError('')
    setStep(1)
  }

  // Step 1 → 2: upload + preview
  async function handlePreview() {
    if (!file) return setError('Please select a file first')
    setLoading(true); setError('')
    try {
      const res = await previewImport(selModule, file)
      setPreviewData(res.data)
      setStep(2)
    } catch (e) {
      setError(e.response?.data?.message || e.message)
    } finally { setLoading(false) }
  }

  // Step 2 → 3: commit
  async function handleCommit() {
    setLoading(true); setError('')
    try {
      const res = await commitImport(selModule, file, overlay)
      setResult(res.data)
      setStep(3)
    } catch (e) {
      setError(e.response?.data?.message || e.message)
    } finally { setLoading(false) }
  }

  const activeModules = panel === 'overlay' ? OVERLAY_MODULES : MODULES

  const sidebar = (
    <div>
      <SidebarSection title="Import / Export"
        items={[
          { label: 'Import Data',   value: 'import',  count: null },
          { label: 'Asset Overlay', value: 'overlay', count: null },
          { label: 'Export Data',   value: 'export',  count: null },
        ]}
        selected={panel}
        onSelect={v => { setPanel(v); reset() }}
      />
    </div>
  )

  return (
    <Layout sidebar={sidebar}>
      <div className="max-w-4xl mx-auto flex flex-col gap-6">

        {/* ── EXPORT PANEL ─────────────────────────────────────────────── */}
        {panel === 'export' && <ExportPanel />}

        {/* ── IMPORT / OVERLAY PANEL ───────────────────────────────────── */}
        {(panel === 'import' || panel === 'overlay') && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-xl font-bold text-gray-800">
                  {panel === 'overlay' ? 'Asset Overlay (Bulk Update)' : 'Import Data'}
                </h1>
                <p className="text-xs text-gray-400 mt-0.5">
                  {panel === 'overlay'
                    ? 'Update existing records in bulk using a CSV/XLSX file'
                    : 'Bulk import records from CSV or XLSX files into the system'}
                </p>
              </div>
              {step > 0 && (
                <button onClick={reset} className="text-xs text-gray-500 hover:text-gray-700 border border-gray-300 px-3 py-1.5 rounded-lg">
                  ← Start Over
                </button>
              )}
            </div>

            <StepBar step={step} />

            {/* ── STEP 0: Module selection ─────────────────────────────── */}
            {step === 0 && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {activeModules.map(mod => (
                  <div key={mod.value}
                    className="bg-white border border-gray-200 rounded-xl p-5 flex flex-col gap-3 hover:border-green-400 hover:shadow-sm transition-all cursor-pointer"
                    onClick={() => selectModule(mod.value, panel === 'overlay')}>
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 bg-green-50 rounded-lg flex items-center justify-center text-green-600 flex-shrink-0">
                        {MOD_ICONS[mod.value] || MOD_ICONS.assets}
                      </div>
                      <div>
                        <p className="font-semibold text-gray-800 text-sm">{mod.label}</p>
                        <p className="text-xs text-gray-400 mt-0.5">{mod.desc}</p>
                      </div>
                    </div>
                    <div className="flex gap-2 mt-auto">
                      <a
                        href={downloadTemplate(mod.value)}
                        onClick={e => e.stopPropagation()}
                        className="text-xs text-green-700 border border-green-300 px-3 py-1 rounded-lg hover:bg-green-50 font-medium"
                      >
                        Template
                      </a>
                      <button
                        onClick={() => selectModule(mod.value, panel === 'overlay')}
                        className="text-xs bg-green-600 text-white px-3 py-1 rounded-lg hover:bg-green-700 font-medium flex-1">
                        Start Import
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* ── STEP 1: Upload ───────────────────────────────────────── */}
            {step === 1 && (
              <div className="bg-white rounded-xl border border-gray-200 p-6 flex flex-col gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 bg-green-50 rounded-lg flex items-center justify-center text-green-600 flex-shrink-0">
                    {MOD_ICONS[selModule] || MOD_ICONS.assets}
                  </div>
                  <div>
                    <h2 className="font-semibold text-gray-800">
                      Upload {activeModules.find(m=>m.value===selModule)?.label} File
                    </h2>
                    <p className="text-xs text-gray-400">
                      Download the template above to see the required column format
                    </p>
                  </div>
                  <a href={downloadTemplate(selModule)}
                    className="ml-auto text-xs text-green-700 border border-green-300 px-3 py-1.5 rounded-lg hover:bg-green-50 font-medium whitespace-nowrap">
                    Download Template
                  </a>
                </div>

                <DropZone file={file} onFile={setFile} />

                {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

                <div className="flex gap-2 justify-end">
                  <button onClick={() => setStep(0)} className="px-4 py-2 text-sm rounded-lg border border-gray-300 hover:bg-gray-50">Back</button>
                  <button onClick={handlePreview} disabled={!file || loading}
                    className="px-5 py-2 text-sm rounded-lg bg-green-600 text-white hover:bg-green-700 font-semibold disabled:opacity-60">
                    {loading ? 'Parsing...' : 'Preview Data →'}
                  </button>
                </div>
              </div>
            )}

            {/* ── STEP 2: Preview & Validate ───────────────────────────── */}
            {step === 2 && previewData && (
              <div className="bg-white rounded-xl border border-gray-200 p-6 flex flex-col gap-4">
                {/* Summary bar */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-center">
                    <p className="text-2xl font-bold text-blue-700">{previewData.total}</p>
                    <p className="text-xs text-blue-500 mt-0.5">Total Rows</p>
                  </div>
                  <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-center">
                    <p className="text-2xl font-bold text-green-700">{previewData.valid}</p>
                    <p className="text-xs text-green-500 mt-0.5">Valid Rows</p>
                  </div>
                  <div className={`border rounded-lg p-3 text-center ${previewData.invalid > 0 ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-200'}`}>
                    <p className={`text-2xl font-bold ${previewData.invalid > 0 ? 'text-red-700' : 'text-gray-400'}`}>{previewData.invalid}</p>
                    <p className={`text-xs mt-0.5 ${previewData.invalid > 0 ? 'text-red-500' : 'text-gray-400'}`}>Invalid (skipped)</p>
                  </div>
                </div>

                {/* Preview table */}
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                    Preview (first {previewData.preview?.length} rows)
                  </p>
                  <PreviewTable rows={previewData.preview} />
                </div>

                {/* Errors */}
                <ErrorList errors={previewData.errors} />

                {previewData.valid === 0 && (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm text-yellow-700 flex items-center gap-2">
                    <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                    No valid rows to import. Fix the errors and re-upload.
                  </div>
                )}

                {overlay && (
                  <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 text-xs text-orange-700 flex items-center gap-2">
                    <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" /></svg>
                    <span><strong>Overlay mode:</strong> Existing records will be updated by matching Asset Tag. New records will NOT be created.</span>
                  </div>
                )}

                {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

                <div className="flex gap-2 justify-end">
                  <button onClick={() => setStep(1)} className="px-4 py-2 text-sm rounded-lg border border-gray-300 hover:bg-gray-50">Back</button>
                  <button onClick={handleCommit} disabled={previewData.valid === 0 || loading}
                    className="px-5 py-2 text-sm rounded-lg bg-green-600 text-white hover:bg-green-700 font-semibold disabled:opacity-60">
                    {loading ? 'Importing...' : `${overlay ? 'Update' : 'Import'} ${previewData.valid} Records →`}
                  </button>
                </div>
              </div>
            )}

            {/* ── STEP 3: Result ───────────────────────────────────────── */}
            {step === 3 && result && (
              <div className="bg-white rounded-xl border border-gray-200 p-6 flex flex-col gap-4">
                <div className="flex items-center gap-3">
                  {result.failed === 0
                    ? <svg className="w-8 h-8 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    : <svg className="w-8 h-8 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                  }
                  <div>
                    <h2 className="font-semibold text-gray-800">Import Complete</h2>
                    <p className="text-xs text-gray-400">The operation has finished</p>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  {result.inserted !== undefined && (
                    <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-center">
                      <p className="text-2xl font-bold text-green-700">{result.inserted}</p>
                      <p className="text-xs text-green-500 mt-0.5">Inserted</p>
                    </div>
                  )}
                  {result.updated !== undefined && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-center">
                      <p className="text-2xl font-bold text-blue-700">{result.updated}</p>
                      <p className="text-xs text-blue-500 mt-0.5">Updated</p>
                    </div>
                  )}
                  <div className={`border rounded-lg p-3 text-center ${result.failed > 0 ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-200'}`}>
                    <p className={`text-2xl font-bold ${result.failed > 0 ? 'text-red-700' : 'text-gray-400'}`}>{result.failed}</p>
                    <p className={`text-xs mt-0.5 ${result.failed > 0 ? 'text-red-500' : 'text-gray-400'}`}>Failed</p>
                  </div>
                </div>

                <ErrorList errors={result.errors} />

                <div className="flex gap-2 justify-end">
                  <button onClick={reset}
                    className="px-5 py-2 text-sm rounded-lg bg-green-600 text-white hover:bg-green-700 font-semibold">
                    Import More
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </Layout>
  )
}

// ─── Export Panel ─────────────────────────────────────────────────────────────
function ExportPanel() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-bold text-gray-800">Export Data</h1>
        <p className="text-xs text-gray-400 mt-0.5">Download your data as CSV files</p>
      </div>

      <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 flex items-start gap-3">
        <svg className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
        <div>
          <p className="text-sm font-semibold text-yellow-800">Recommended: Use the Reports module</p>
          <p className="text-xs text-yellow-700 mt-0.5">
            The <a href="/reports" className="underline font-medium">Reports page</a> provides filtered, real-time exports with search and column selection for all modules.
            Use the quick exports below for full raw data dumps only.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { mod:'assets',    label:'Assets',    icon:'assets',    desc:'All asset records with status, location, warranty' },
          { mod:'inventory', label:'Inventory', icon:'inventory', desc:'Full inventory log including history entries' },
          { mod:'locations', label:'Locations', icon:'locations', desc:'All locations and sub-locations' },
        ].map(({ mod, label, icon, desc }) => (
          <div key={mod} className="bg-white border border-gray-200 rounded-xl p-5 flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-green-50 rounded-lg flex items-center justify-center text-green-600 flex-shrink-0">
                {MOD_ICONS[icon]}
              </div>
              <div>
                <p className="font-semibold text-gray-800 text-sm">{label}</p>
                <p className="text-xs text-gray-400 mt-0.5">{desc}</p>
              </div>
            </div>
            <a href="/reports"
              className="text-xs bg-green-600 text-white px-3 py-2 rounded-lg hover:bg-green-700 font-medium text-center">
              Export via Reports
            </a>
          </div>
        ))}
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">CSV Templates</h2>
        <p className="text-xs text-gray-400 mb-3">Download blank templates to prepare your import files</p>
        <div className="flex flex-wrap gap-2">
          {['assets','inventory','locations'].map(mod => (
            <a key={mod} href={`http://localhost:5000/import/${mod}/template`}
              className="text-xs border border-green-300 text-green-700 px-4 py-2 rounded-lg hover:bg-green-50 font-medium capitalize">
              {mod.charAt(0).toUpperCase()+mod.slice(1)} Template
            </a>
          ))}
        </div>
      </div>
    </div>
  )
}
