import { lazy } from 'react';
import { HashRouter, Routes, Route } from 'react-router-dom';
import { EngineProvider } from './state/store';
import { NavBar } from './components/NavBar';
import { RouteBoundary, RouteEffects } from './components/shell/RouteShell';
import { Home } from './pages/Home';
import { NotFound } from './pages/NotFound';

// Every page except Home is its own chunk, so the heavy ones (maps, charts, precinct canvas) load on demand.
const Build = lazy(() => import('./pages/Build').then((m) => ({ default: m.Build })));
const Results = lazy(() => import('./pages/Results').then((m) => ({ default: m.Results })));
const Scenarios = lazy(() => import('./pages/Scenarios').then((m) => ({ default: m.Scenarios })));
const Infobox = lazy(() => import('./pages/Infobox').then((m) => ({ default: m.Infobox })));
const Gallery = lazy(() => import('./pages/Gallery').then((m) => ({ default: m.Gallery })));
const ElectionNight = lazy(() => import('./pages/ElectionNight').then((m) => ({ default: m.ElectionNight })));
const Tracker = lazy(() => import('./pages/Tracker').then((m) => ({ default: m.Tracker })));
const WorldMap = lazy(() => import('./pages/WorldMap').then((m) => ({ default: m.WorldMap })));
const SplitTicket = lazy(() => import('./pages/SplitTicket').then((m) => ({ default: m.SplitTicket })));
const SharedRace = lazy(() => import('./pages/SharedRace').then((m) => ({ default: m.SharedRace })));
const PrecinctLab = lazy(() => import('./pages/PrecinctLab').then((m) => ({ default: m.PrecinctLab })));

export default function App() {
  return (
    <EngineProvider>
      <HashRouter>
        <RouteEffects />
        <a href="#main" onClick={(e) => { e.preventDefault(); document.getElementById('main')?.focus(); }}
          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:px-3 focus:py-2 focus:rounded focus:bg-gold focus:text-void focus:text-sm focus:font-semibold">
          Skip to content
        </a>
        <NavBar />
        <main id="main" tabIndex={-1} className="outline-none">
          <RouteBoundary>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/build" element={<Build />} />
              <Route path="/results" element={<Results />} />
              <Route path="/scenarios" element={<Scenarios />} />
              <Route path="/infobox" element={<Infobox />} />
              <Route path="/gallery" element={<Gallery />} />
              <Route path="/night" element={<ElectionNight />} />
              <Route path="/tracker" element={<Tracker />} />
              <Route path="/world" element={<WorldMap />} />
              <Route path="/midterms" element={<SplitTicket />} />
              <Route path="/precinct-lab" element={<PrecinctLab />} />
              <Route path="/r/:payload" element={<SharedRace />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </RouteBoundary>
        </main>
      </HashRouter>
    </EngineProvider>
  );
}
