import { useEffect, useRef, useState } from 'react'
import { getFiles, uploadFile, getFileUrl, deleteFile, getAssetCategories } from '../services/api'
import Layout from '../components/Layout'

export default function Invoice() {
  const [files, setFiles]               = useState([])
  const [status, setStatus]             = useState('')
  const [statusColor, setStatusColor]   = useState('text-green-600')
  const [search, setSearch]             = useState('')
  const [monthFilter, setMonthFilter]   = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [showMonthPicker, setShowMonthPicker] = useState(false)
  const [selected, setSelected]         = useState(new Set())
  const [deleting, setDeleting]         = useState(false)
  const [uploadCategory, setUploadCategory] = useState('')
  const [categories, setCategories]     = useState([])
  const fileInputRef = useRef(null)

  useEffect(() => {
    loadFiles()
    getAssetCategories()
      .then(res => {
        const cats = Array.isArray(res.data?.data) ? res.data.data : []
        setCategories(cats.map(c => c.name))
      })
      .catch(() => setCategories(['Laptop', 'MacBook', 'Mac Mini', 'iMac', 'Monitor', 'Mouse', 'Keyboard', 'Headset', 'Docking Station', 'Other']))
  }, [])

  async function loadFiles() {
    try { const res = await getFiles(); setFiles(res.data) }
    catch { setStatus('❌ Failed to load files'); setStatusColor('text-red-500') }
  }

  async function handleUpload() {
    const file = fileInputRef.current?.files[0]
    if (!file) { setStatus('❌ Please select a PDF file'); setStatusColor('text-red-500'); return }
    if (file.type !== 'application/pdf') { setStatus('❌ Only PDF files allowed'); setStatusColor('text-red-500'); return }
    const formData = new FormData()
    // Prepend category to filename if selected
    const finalName = uploadCategory
      ? `[${uploadCategory}] ${file.name}`
      : file.name
    const renamedFile = new File([file], finalName, { type: file.type })
    formData.append('pdf', renamedFile)
    try {
      await uploadFile(formData)
      setStatus(`✅ Uploaded: ${finalName}`); setStatusColor('text-green-600')
      fileInputRef.current.value = ''
      setUploadCategory('')
      await loadFiles()
    } catch (err) {
      setStatus('❌ Upload failed: ' + (err.response?.data?.error || err.message)); setStatusColor('text-red-500')
    }
  }

  async function handleDownload(file) {
    try {
      const res = await fetch(getFileUrl(file._id), { credentials: 'include' })
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = file.filename
      document.body.appendChild(a); a.click(); a.remove()
      URL.revokeObjectURL(url)
    } catch { alert('❌ Failed to download file.') }
  }

  async function handleDeleteSelected() {
    if (!selected.size) return
    if (!window.confirm(`Delete ${selected.size} file(s)?`)) return
    setDeleting(true)
    try {
      await Promise.all([...selected].map(id => deleteFile(id)))
      setSelected(new Set())
      await loadFiles()
    } catch (err) {
      alert('❌ Delete failed: ' + (err.response?.data?.message || err.message))
    } finally { setDeleting(false) }
  }

  function toggleSelect(id) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleAll() {
    if (selected.size === displayed.length) setSelected(new Set())
    else setSelected(new Set(displayed.map(f => f._id)))
  }

  const displayed = files.filter(f => {
    const nameMatch = f.filename.toLowerCase().includes(search.toLowerCase())
    const dateStr = f.uploadDate ? new Date(f.uploadDate).toISOString().slice(0, 7) : ''
    const catMatch = !categoryFilter || f.filename.includes(`[${categoryFilter}]`)
    return nameMatch && (!monthFilter || dateStr.startsWith(monthFilter)) && catMatch
  })

  // Extract category tag from filename e.g. "[Laptop] invoice.pdf" → "Laptop"
  function getFileCategory(filename) {
    const match = filename.match(/^\[([^\]]+)\]/)
    return match ? match[1] : null
  }

  return (
    <Layout>
      <div className="max-w-5xl mx-auto flex flex-col gap-4">
        <h1 className="text-xl font-bold text-gray-800">Invoices</h1>

        <div className="bg-white rounded-lg border border-gray-200 flex overflow-hidden">
          {/* Upload panel */}
          <div className="w-64 flex-shrink-0 p-6 bg-gray-50 border-r border-gray-200 flex flex-col gap-3">
            <h2 className="text-sm font-semibold text-gray-700">Upload Invoice</h2>
            <p className="text-xs text-gray-400">Naming pattern:<br /><span className="font-mono">Vendor_yy_mmm_dd_InvNo</span></p>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Category</label>
              <select
                value={uploadCategory}
                onChange={e => setUploadCategory(e.target.value)}
                className="w-full border rounded-lg p-2 text-xs focus:outline-none focus:ring-2 focus:ring-green-400"
              >
                <option value="">-- Select category --</option>
                {categories.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>
            <input ref={fileInputRef} type="file" accept="application/pdf" className="border rounded-lg p-2 text-xs" />
            <button onClick={handleUpload}
              className="bg-green-600 text-white py-2 rounded-lg hover:bg-green-700 text-sm font-semibold">
              Upload PDF
            </button>
            {status && <p className={`text-xs ${statusColor}`}>{status}</p>}
          </div>

          {/* Files panel */}
          <div className="flex-1 p-6">
            {/* Toolbar row */}
            <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
              <h2 className="text-sm font-semibold text-gray-700">Uploaded Invoices ({displayed.length})</h2>
              <div className="flex items-center gap-2">
                <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}
                  className="border rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-green-400">
                  <option value="">All Categories</option>
                  {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                </select>
                <input type="text" placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)}
                  className="border rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-green-400 w-40" />
                <button onClick={() => setShowMonthPicker(v => !v)} title="Filter by month"
                  className="text-gray-500 hover:text-gray-700 text-base">📅</button>
                {showMonthPicker && (
                  <input type="month" value={monthFilter} onChange={e => setMonthFilter(e.target.value)}
                    className="border rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-green-400" />
                )}
                {monthFilter && (
                  <button onClick={() => setMonthFilter('')} className="text-xs text-red-500 hover:underline">Clear</button>
                )}
              </div>
            </div>

            {/* Bulk action bar — appears when any item is selected */}
            {selected.size > 0 && (
              <div className="flex items-center gap-3 mb-3 px-3 py-2 bg-red-50 border border-red-200 rounded-lg">
                <span className="text-xs text-red-700 font-medium">{selected.size} selected</span>
                <button onClick={handleDeleteSelected} disabled={deleting}
                  className="flex items-center gap-1 text-xs bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded-lg font-semibold disabled:opacity-50">
                  🗑️ Delete Selected
                </button>
                <button onClick={() => setSelected(new Set())}
                  className="text-xs text-gray-500 hover:text-gray-700 ml-auto">✕ Clear</button>
              </div>
            )}

            {displayed.length === 0
              ? <p className="text-sm text-gray-400 text-center py-10">No invoices found</p>
              : (
                <>
                  {/* Select all toggle */}
                  <div className="flex items-center gap-2 mb-2">
                    <input type="checkbox"
                      checked={displayed.length > 0 && selected.size === displayed.length}
                      onChange={toggleAll}
                      className="accent-red-600 w-3.5 h-3.5 cursor-pointer" />
                    <span className="text-xs text-gray-400">Select all</span>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                    {displayed.map(file => {
                      const isSelected = selected.has(file._id)
                      return (
                        <div key={file._id}
                          className={`relative border rounded-lg p-3 flex flex-col items-center gap-2 transition
                            ${isSelected ? 'border-red-400 bg-red-50 shadow-sm' : 'border-gray-200 hover:border-green-300 hover:shadow-sm'}`}>
                          {/* Selection checkbox — top-left corner */}
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelect(file._id)}
                            className="absolute top-2 left-2 accent-red-600 w-3.5 h-3.5 cursor-pointer"
                          />
                          <img src="https://cdn-icons-png.flaticon.com/512/337/337946.png" alt="PDF" className="w-8 mt-1" />
                          {getFileCategory(file.filename) && (
                            <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">
                              {getFileCategory(file.filename)}
                            </span>
                          )}
                          <p className="text-xs text-center text-gray-600 break-all leading-tight">
                            {file.filename.replace(/^\[[^\]]+\]\s*/, '')}
                          </p>
                          <p className="text-xs text-gray-400">{file.uploadDate ? new Date(file.uploadDate).toLocaleDateString() : ''}</p>
                          <button onClick={() => window.open(getFileUrl(file._id), '_blank')}
                            className="bg-green-600 text-white text-xs px-3 py-1 rounded hover:bg-green-700 w-full">View</button>
                          <button onClick={() => handleDownload(file)}
                            className="border border-gray-300 text-gray-600 text-xs px-3 py-1 rounded hover:bg-gray-50 w-full">Download</button>
                        </div>
                      )
                    })}
                  </div>
                </>
              )
            }
          </div>
        </div>
      </div>
    </Layout>
  )
}
