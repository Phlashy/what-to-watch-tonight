import { Component } from 'react';

/**
 * Catches uncaught render/runtime errors anywhere below it and shows a friendly
 * full-screen fallback instead of a blank white page. Reloading re-mounts the app.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('Unhandled UI error:', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center px-6 text-center">
          <div className="text-4xl mb-3">😵</div>
          <h1 className="text-xl font-bold">Something broke</h1>
          <p className="text-sm text-slate-400 mt-1 max-w-xs">
            An unexpected error crashed this screen. Reloading usually fixes it.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="mt-5 bg-amber-500 hover:bg-amber-400 text-black font-semibold rounded-xl px-5 py-2.5 text-sm transition-colors"
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
