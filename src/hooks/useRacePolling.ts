import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { loadRace, hasUsablePolls, type RaceLoad } from '../lib/races/loader';
import { configForRace, type RaceDef } from '../lib/races/registry';
import { computeBaseCalcBundle, type BaseCalcBundle } from '../state/store';

/**
 * Loads one pre-built race's polling (live → cache → bundled fallback) and derives its day-by-day BaseCalc.
 * Loading is lazy: it starts when the card scrolls into view, so opening Split Ticket with 71 races does not
 * fire 140 Wikipedia requests at once (the loader also caps live requests at 3 in flight).
 */
export function useRacePolling(def: RaceDef) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [load, setLoad] = useState<RaceLoad | null>(null);
  const [loading, setLoading] = useState(false);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') { setVisible(true); return; }
    const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && (setVisible(true), io.disconnect()), { rootMargin: '200px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const run = useCallback((force: boolean) => {
    setLoading(true);
    loadRace(def, { force }).then((r) => { if (alive.current) { setLoad(r); setLoading(false); } });
  }, [def]);

  useEffect(() => { if (visible) run(false); }, [visible, run]);

  const bundle: BaseCalcBundle | null = useMemo(() => {
    if (!load || !hasUsablePolls(load.parsed, def.cutoffDate)) return null;
    return computeBaseCalcBundle(configForRace(def, load.parsed), load.parsed);
  }, [load, def]);

  return { ref, load, loading, bundle, retry: () => run(true) };
}
