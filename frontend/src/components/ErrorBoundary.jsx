// frontend/src/components/ErrorBoundary.jsx
import React from 'react';

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Error caught:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-screen items-center justify-center bg-slate-950">
          <div className="glass-panel p-8 rounded-lg border-t-4 border-t-rose-500 max-w-md text-center">
            <svg className="w-16 h-16 mx-auto mb-4 text-rose-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
            </svg>
            <h2 className="text-2xl font-bold text-slate-100 mb-2">System Error</h2>
            <p className="text-slate-400 mb-4 text-sm">{this.state.error?.message}</p>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-cyan-600 text-white rounded hover:bg-cyan-700"
            >
              Reload
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}