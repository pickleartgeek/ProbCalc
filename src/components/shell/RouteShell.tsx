import { Component, Suspense, useEffect, type ErrorInfo, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';

const TITLES: Record<string, string> = {
  '/': 'Election Desk',
  '/build': 'Build a race',
  '/results': 'Results',
  '/scenarios': 'Scenarios',
  '/infobox': 'Infobox',
  '/gallery': 'Gallery',
  '/night': 'Election Night',
  '/tracker': 'Tracker',
  '/world': 'World map',
  '/midterms': 'Split Ticket',
  '/precinct-lab': 'Precinct Lab',
};

/** Resets scroll on navigation (HashRouter doesn't) and keeps the tab title in step with the page. */
export function RouteEffects() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
    const page = pathname.startsWith('/r/') ? 'Shared race' : TITLES[pathname] ?? 'Page not found';
    document.title = pathname === '/' ? 'ProbCalc — Election Desk' : `${page} · ProbCalc`;
  }, [pathname]);
  return null;
}

export function PageFallback() {
  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10" role="status" aria-live="polite">
      <div className="h-8 w-56 rounded bg-panel-raised animate-pulse mb-4" />
      <div className="h-4 w-full max-w-xl rounded bg-panel animate-pulse mb-2" />
      <div className="h-4 w-2/3 max-w-md rounded bg-panel animate-pulse mb-8" />
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {[0, 1, 2].map((i) => <div key={i} className="h-40 rounded-lg border border-hairline bg-panel animate-pulse" />)}
      </div>
      <span className="sr-only">Loading…</span>
    </div>
  );
}

interface BoundaryState { error: Error | null }

/** Catches render errors per route so one broken page doesn't blank the whole app. Resets when the route changes. */
class Boundary extends Component<{ children: ReactNode; resetKey: string }, BoundaryState> {
  state: BoundaryState = { error: null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error('Route crashed', error, info.componentStack); }
  componentDidUpdate(prev: { resetKey: string }) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null });
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="max-w-xl mx-auto px-4 py-20 text-center">
        <div className="font-data text-xs tracking-widest text-red-call uppercase mb-3">Something broke</div>
        <h1 className="font-display font-800 text-3xl mb-2">This page hit an error</h1>
        <p className="text-ink-muted text-sm mb-6 font-data break-words">{this.state.error.message}</p>
        <div className="flex justify-center gap-3">
          <button onClick={() => this.setState({ error: null })} className="px-4 py-2 rounded border border-hairline-bright text-sm hover:bg-panel">Try again</button>
          <Link to="/" className="px-4 py-2 rounded bg-gold text-void text-sm font-semibold">Back to Home</Link>
        </div>
      </div>
    );
  }
}

export function RouteBoundary({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  return (
    <Boundary resetKey={pathname}>
      <Suspense fallback={<PageFallback />}>{children}</Suspense>
    </Boundary>
  );
}
