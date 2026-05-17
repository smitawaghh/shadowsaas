// frontend/src/components/LoadingSpinner.jsx
export const LoadingSpinner = () => (
  <div className="flex items-center justify-center h-full">
    <div className="text-center">
      <div className="w-12 h-12 rounded-full border-4 border-slate-700 border-t-cyan-500 animate-spin mx-auto mb-4"></div>
      <p className="text-slate-400 font-mono text-sm animate-pulse">Loading...</p>
    </div>
  </div>
);