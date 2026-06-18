import Navbar from './Navbar'

export default function Layout({ children, sidebar }) {
  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#f1f5f9' }}>
      <Navbar />
      <div className="flex flex-1 overflow-hidden">
        {sidebar && (
          <aside className="w-56 flex-shrink-0 bg-white border-r border-gray-200 overflow-y-auto"
            style={{ boxShadow: '2px 0 8px rgba(0,0,0,0.04)' }}>
            {sidebar}
          </aside>
        )}
        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
