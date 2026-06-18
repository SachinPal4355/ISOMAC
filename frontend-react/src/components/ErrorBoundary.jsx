import { Component } from 'react'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen bg-gray-100 flex items-center justify-center p-6">
          <div className="bg-white rounded-xl border border-red-200 shadow p-8 max-w-lg w-full">
            <h2 className="text-lg font-bold text-red-600 mb-2">Something went wrong</h2>
            <p className="text-sm text-gray-600 mb-4">{this.state.error?.message}</p>
            <button
              onClick={() => { this.setState({ error: null }); window.location.href = '/dashboard' }}
              className="bg-green-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-green-700">
              Go to Dashboard
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
