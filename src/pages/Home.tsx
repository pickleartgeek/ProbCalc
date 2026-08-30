import { Link } from 'react-router-dom';
import { RaceTicker } from '../components/RaceTicker';
import { CardMosaic } from '../components/CardMosaic';
import { GALLERY_COUNTRIES } from '../lib/seedData';

export function Home() {
  return (
    <div>
      <RaceTicker />

      <section className="max-w-6xl mx-auto px-4 sm:px-6 pt-16 pb-20">
        <div className="flex items-center gap-2 mb-4">
          <span className="w-1.5 h-1.5 rounded-full bg-red-call pulse-live" />
          <span className="font-data text-xs tracking-widest text-red-call uppercase">On the desk now</span>
        </div>
        <h1 className="font-display font-900 text-5xl sm:text-7xl leading-[0.95] tracking-tight max-w-3xl">
          Every poll, weighted.
          <br />
          <span className="text-gold">Every outcome,</span> simulated.
        </h1>
        <p className="mt-6 text-ink-muted text-lg max-w-xl">
          Paste a Wikipedia polling table, set your parties and voting system, and ProbCalc turns
          it into a weighted aggregate, a Monte Carlo win-probability model, and a scenario
          browser — no spreadsheet required.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            to="/build"
            className="px-5 py-3 bg-gold text-void font-display font-800 text-lg rounded hover:brightness-110 transition"
          >
            Build a race →
          </Link>
          <Link
            to="/gallery"
            className="px-5 py-3 border border-hairline-bright text-ink font-display font-700 text-lg rounded hover:bg-panel transition"
          >
            Browse examples
          </Link>
          <Link
            to="/world"
            className="px-5 py-3 border border-hairline-bright text-ink font-display font-700 text-lg rounded hover:bg-panel transition"
          >
            🌐 World map
          </Link>
        </div>
      </section>

      <section className="border-t border-hairline bg-panel/40">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-14">
          <div className="flex items-baseline justify-between mb-6">
            <h2 className="font-display font-800 text-2xl tracking-tight">Pre-built races</h2>
            <Link to="/gallery" className="text-sm text-cyan hover:underline">
              See all
            </Link>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
            {GALLERY_COUNTRIES.map((c) => (
              <Link
                key={c.id}
                to="/gallery"
                className="relative bg-panel border border-hairline rounded-lg p-4 hover:border-hairline-bright transition overflow-hidden"
              >
                <CardMosaic colors={c.colors} seedKey={c.id} />
                <div className="relative">
                  <div className="text-3xl mb-2">{c.flagEmoji}</div>
                  <div className="font-display font-700 text-base">{c.name}</div>
                  <div className="text-ink-dim text-xs font-data mt-1">
                    {c.races} race{c.races !== 1 ? 's' : ''} · {c.system}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-14">
        <h2 className="font-display font-800 text-2xl tracking-tight mb-6">How it works</h2>
        <div className="grid sm:grid-cols-3 gap-4">
          {[
            { n: '01', t: 'Paste your polling', d: 'Copy a Wikipedia opinion-polling table — plain or wikitext, either works.' },
            { n: '02', t: 'BaseCalc weights it', d: 'Recent, larger-sample polls pull more weight. Get a clean aggregate instantly.' },
            { n: '03', t: 'ProbCalc simulates it', d: 'Thousands of gamma-distributed draws turn the aggregate into win probabilities.' },
          ].map((s) => (
            <div key={s.n} className="border border-hairline rounded-lg p-5 bg-panel">
              <div className="font-data text-gold-dim text-sm mb-2">{s.n}</div>
              <div className="font-display font-700 text-lg mb-1">{s.t}</div>
              <div className="text-ink-muted text-sm">{s.d}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
