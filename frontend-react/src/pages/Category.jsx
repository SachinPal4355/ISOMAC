import { useSearchParams, Navigate } from 'react-router-dom'

// Category page is superseded by Assets page with category filtering.
// Redirect /category?type=X → /assets?category=X
export default function Category() {
  const [params] = useSearchParams()
  const type = params.get('type') || ''
  return <Navigate to={type ? `/assets?category=${encodeURIComponent(type)}` : '/assets'} replace />
}
