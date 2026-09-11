import { HashRouter, Routes, Route } from 'react-router-dom';
import { EngineProvider } from './state/store';
import { NavBar } from './components/NavBar';
import { Home } from './pages/Home';
import { Build } from './pages/Build';
import { Results } from './pages/Results';
import { Scenarios } from './pages/Scenarios';
import { Infobox } from './pages/Infobox';
import { Gallery } from './pages/Gallery';
import { ElectionNight } from './pages/ElectionNight';
import { Tracker } from './pages/Tracker';
import { WorldMap } from './pages/WorldMap';
import { SplitTicket } from './pages/SplitTicket';
import { PrecinctLab } from './pages/PrecinctLab';

export default function App() {
  return (
    <EngineProvider>
      <HashRouter>
        <NavBar />
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
        </Routes>
      </HashRouter>
    </EngineProvider>
  );
}
