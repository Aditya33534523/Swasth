import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Catches render-time errors anywhere below it in the tree (a malformed
 * LLM response, a Leaflet quirk, etc.) so the whole app doesn't go blank.
 * Shows a recoverable screen instead of a white page.
 */
export class ErrorBoundary extends React.Component<
  React.PropsWithChildren<{}>,
  ErrorBoundaryState
> {
  constructor(props: React.PropsWithChildren<{}>) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error('SwasthSetu crashed:', error, info.componentStack);
  }

  handleReset = () => {
    this.setState({ error: null });
  };

  render() {
    if (this.state.error) {
      return (
        <div
          className="fixed inset-0 flex items-center justify-center p-6"
          style={{ background: 'var(--bg-gradient, #0e1116)' }}
        >
          <div
            className="glass-strong max-w-sm w-full p-6 text-center"
            style={{ borderRadius: 24 }}
          >
            <div
              className="mx-auto mb-4 flex items-center justify-center rounded-full"
              style={{ width: 48, height: 48, background: 'rgba(255,59,48,0.12)' }}
            >
              <AlertTriangle size={22} color="#ff3b30" strokeWidth={2} />
            </div>
            <h2
              className="text-lg font-semibold mb-2"
              style={{ color: 'var(--text-primary)' }}
            >
              Something went wrong
            </h2>
            <p
              className="text-sm mb-5"
              style={{ color: 'var(--text-secondary)' }}
            >
              SwasthSetu hit an unexpected error. Your chat history and
              login are safe — try reloading.
            </p>
            <button
              onClick={this.handleReset}
              className="flex items-center justify-center gap-2 w-full py-3 rounded-2xl text-white font-medium text-sm cursor-pointer"
              style={{ background: 'var(--accent, #007aff)', border: 'none' }}
            >
              <RotateCcw size={16} strokeWidth={2} />
              Try Again
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}