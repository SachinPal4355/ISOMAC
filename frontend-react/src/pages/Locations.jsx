import { useEffect, useState } from 'react'
import { getLocations, createLocation, updateLocation, deleteLocation, getAssets } from '../services/api'
import Layout from '../components/Layout'
import DataTable from '../components/DataTable'
import Modal from '../components/Modal'
import StatCard from '../components/StatCard'
import { useAuth } from '../context/AuthContext'

const EF = { name:'', parent:'', description:'', address:'' }

export default function Locations() {
  const { isEditor, isAdmin } = useAuth()
  const [locations, setLocations] = useState([])
  const [assets, setAssets]       = useState([])
  const [form, setForm]           = useState(EF)
  const [editId, setEditId]       = useState(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [selectedLoc, setSelectedLoc] = useState(null)
  const [search, setSearch]       = useState('')
  const [loading, setLoading]     = useState(true)

  useEffect(() => { load() }, [])

  async function load() {
    try {
      const [lRes, aRes] = await Promise.all([getLocations(), getAssets()])
      setLocations(Array.isArray(lRes.data) ? lRes.data : [])
      setAssets(Array.isArray(aRes.data) ? aRes.data : [])
    } catch (e) {
      console.error('Locations load error:', e)
      setLocations([])
      setAssets([])
    }
    finally { setLoading(false) }
  }

  function openAdd() { setForm(EF); setEditId(null); setModalOpen(true) }
  function openEdit(l) {
    setEditId(l._id)
    setForm({ name:l.name||'', parent:l.parent?._id||'', description:l.description||'', address:l.address||'' })
    setModalOpen(true)
  }

  async function handleSubmit() {
    if (!form.name) return alert('Location name required')
    try {
      const payload = { ...form, parent: form.parent || null }
      if (editId) await updateLocation(editId, payload)
      else await createLocation(payload)
      setModalOpen(false); load()
    } catch (e) { alert('❌ '+(e.response?.data?.message||e.message)) }
  }

  async function handleDelete(id) {
    if (!window.confirm('Delete this location?')) return
    try { await deleteLocation(id); if (selectedLoc?._id===id) setSelectedLoc(null); load() }
    catch (e) { alert('❌ '+(e.response?.data?.message||e.message)) }
  }

  // Build location tree
  const roots = locations.filter(l => !l.parent)
  const getChildren = (parentId) => locations.filter(l => {
    const pid = l.parent?._id || l.parent
    return pid && String(pid) === String(parentId)
  })

  // Assets at selected location
  const locAssets = selectedLoc
    ? assets.filter(a => a.location === selectedLoc.name)
    : []

  const filteredLocs = locations.filter(l =>
    !search || l.name.toLowerCase().includes(search.toLowerCase()) ||
    (l.description||'').toLowerCase().includes(search.toLowerCase())
  )

  const locColumns = [
    { key:'name',        label:'Location Name', render:(v,r) => (
      <button onClick={() => setSelectedLoc(r)} className="text-green-700 hover:underline font-semibold text-left">{v}</button>
    )},
    { key:'parent',      label:'Parent', render:(_,r) => r.parent?.name||<span className="text-gray-400 text-xs">Root</span> },
    { key:'description', label:'Description', render: v => v||'—' },
    { key:'address',     label:'Address', render: v => v||'—' },
    { key:'_id',         label:'Actions', sortable:false, render:(_,r) => (
      isEditor && <div className="flex gap-1">
        <button onClick={() => openEdit(r)} className="text-xs bg-yellow-100 text-yellow-700 hover:bg-yellow-200 px-2 py-1 rounded font-medium">Edit</button>
        {isAdmin && <button onClick={() => handleDelete(r._id)} className="text-xs bg-red-100 text-red-700 hover:bg-red-200 px-2 py-1 rounded font-medium">Del</button>}
      </div>
    )}
  ]

  const assetColumns = [
    { key:'assetTag', label:'Tag', render: v => <span className="font-mono text-xs font-semibold">{v}</span> },
    { key:'name',     label:'Name' },
    { key:'category', label:'Category' },
    { key:'status',   label:'Status' },
  ]

  const inp = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400'

  return (
    <Layout>
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-bold text-gray-800">Locations</h1>
            <p className="text-xs text-gray-400 mt-0.5">{locations.length} locations</p>
          </div>
          <div className="flex gap-2">
            <input placeholder="Search locations..." value={search} onChange={e=>setSearch(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400 w-44" />
            {isEditor && (
              <button onClick={openAdd}
                className="bg-green-600 hover:bg-green-700 text-white text-sm font-semibold px-4 py-1.5 rounded-lg">
                + Add Location
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <StatCard label="Total Locations" value={locations.length} color="blue" />
          <StatCard label="Root Locations" value={roots.length} color="green" />
          <StatCard label="Sub-locations" value={locations.length - roots.length} color="gray" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Location tree */}
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">Location Tree</h2>
            {roots.length === 0 && <p className="text-xs text-gray-400">No locations yet</p>}
            <ul className="space-y-1">
              {roots.map(root => (
                <li key={root._id}>
                  <button onClick={() => setSelectedLoc(root)}
                    className={`w-full text-left px-2 py-1.5 rounded text-sm font-medium transition-colors
                      ${selectedLoc?._id===root._id ? 'bg-green-600 text-white' : 'hover:bg-gray-100 text-gray-700'}`}>
                    📍 {root.name}
                  </button>
                  {getChildren(root._id).map(child => (
                    <button key={child._id} onClick={() => setSelectedLoc(child)}
                      className={`w-full text-left pl-6 pr-2 py-1.5 rounded text-sm transition-colors
                        ${selectedLoc?._id===child._id ? 'bg-green-600 text-white' : 'hover:bg-gray-100 text-gray-600'}`}>
                      └ {child.name}
                    </button>
                  ))}
                </li>
              ))}
            </ul>
          </div>

          {/* Selected location detail */}
          <div className="md:col-span-2 flex flex-col gap-3">
            {selectedLoc ? (
              <>
                <div className="bg-white rounded-lg border border-gray-200 p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <h2 className="font-semibold text-gray-800">{selectedLoc.name}</h2>
                      {selectedLoc.parent && <p className="text-xs text-gray-400 mt-0.5">Sub-location of: {selectedLoc.parent?.name}</p>}
                      {selectedLoc.address && <p className="text-xs text-gray-500 mt-1">📍 {selectedLoc.address}</p>}
                      {selectedLoc.description && <p className="text-sm text-gray-600 mt-1">{selectedLoc.description}</p>}
                    </div>
                    <button onClick={() => setSelectedLoc(null)} className="text-gray-400 hover:text-gray-600 text-lg">&times;</button>
                  </div>
                </div>
                <div className="bg-white rounded-lg border border-gray-200 p-4">
                  <h3 className="text-sm font-semibold text-gray-700 mb-3">Assets at this location ({locAssets.length})</h3>
                  <DataTable columns={assetColumns} rows={locAssets} emptyText="No assets at this location" />
                </div>
              </>
            ) : (
              <div className="bg-white rounded-lg border border-gray-200 p-4">
                <h2 className="text-sm font-semibold text-gray-700 mb-3">All Locations</h2>
                <DataTable columns={locColumns} rows={filteredLocs} loading={loading} emptyText="No locations found" />
              </div>
            )}
          </div>
        </div>
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editId ? 'Edit Location' : 'Add Location'}>
        <div className="flex flex-col gap-3">
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Location Name *</label>
            <input placeholder="e.g. Head Office, Server Room" value={form.name} onChange={e=>setForm({...form,name:e.target.value})} className={inp} />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Parent Location (optional)</label>
            <select value={form.parent} onChange={e=>setForm({...form,parent:e.target.value})} className={inp}>
              <option value="">None (Root location)</option>
              {locations.filter(l=>l._id!==editId).map(l=><option key={l._id} value={l._id}>{l.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Address</label>
            <input placeholder="Physical address" value={form.address} onChange={e=>setForm({...form,address:e.target.value})} className={inp} />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Description</label>
            <input placeholder="Description" value={form.description} onChange={e=>setForm({...form,description:e.target.value})} className={inp} />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={() => setModalOpen(false)} className="px-4 py-2 text-sm rounded-lg border border-gray-300 hover:bg-gray-50">Cancel</button>
          <button onClick={handleSubmit} className="px-4 py-2 text-sm rounded-lg bg-green-600 text-white hover:bg-green-700 font-semibold">
            {editId ? 'Update' : 'Create'}
          </button>
        </div>
      </Modal>
    </Layout>
  )
}
