import React from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import { Link } from 'react-router-dom';

interface Props {
  children: React.ReactNode;
  // Optional callback fired when an error is caught — wire up to your logging
  // service (Sentry, etc.) in production.
  onError?: (error: Error, info: React.ErrorInfo) => void;
  // Optional custom fallback. If omitted, a friendly default screen is shown.
  fallback?: (error: Error, reset: () => void) => React.ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Catches unhandled React render/lifecycle errors and shows a friendly fallback
 * UI instead of a blank screen. Wrap risky areas (3D canvas, async data) in
 * their own boundaries so failures stay localized.
 */
export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary] caught:', error, info);
    this.props.onError?.(error, info);
  }

  reset = () => {
    this.setState({ error: null });
  };

  render() {
    if (this.state.error) {
      if (this.props.fallback) {
        return this.props.fallback(this.state.error, this.reset);
      }
      return (
        <div className="min-h-[400px] flex items-center justify-center p-8 bg-gradient-to-br from-rose-50 to-orange-50 rounded-2xl">
          <div className="max-w-md text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-rose-100 flex items-center justify-center">
              <AlertTriangle className="w-8 h-8 text-rose-600" />
            </div>
            <h2 className="text-xl font-bold text-slate-900 mb-2">
              Something went wrong
            </h2>
            <p className="text-sm text-slate-600 mb-6">
              We hit an unexpected error. Try reloading — if it keeps happening,
              please let us know.
            </p>
            {import.meta.env.DEV && (
              <pre className="text-[10px] text-left bg-white/70 rounded-lg p-3 mb-4 overflow-auto max-h-32 font-mono text-rose-700 border border-rose-200">
                {this.state.error.message}
              </pre>
            )}
            <div className="flex items-center justify-center gap-2">
              <button
                onClick={this.reset}
                className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-full transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Try again
              </button>
              <Link
                to="/"
                className="flex items-center gap-1.5 px-4 py-2 bg-white hover:bg-slate-50 text-slate-700 text-sm font-bold rounded-full border border-slate-200 transition-colors"
              >
                <Home className="w-3.5 h-3.5" />
                Home
              </Link>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
