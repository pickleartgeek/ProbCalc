import { useState } from 'react';
import { encodeRace, shareUrl } from '../lib/share';
import type { ElectionConfig, ParsedPollData } from '../lib/types';

/** Copies a link that restores this exact race (config + polls) in anyone's browser. */
export function ShareLinkButton({ config, pollData }: { config: ElectionConfig; pollData: ParsedPollData }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [note, setNote] = useState('');

  async function copy() {
    try {
      const url = shareUrl(await encodeRace(config, pollData));
      setNote(url.length > 8000 ? `Long link (${Math.round(url.length / 1000)}k characters) — some chat apps may truncate it.` : '');
      try {
        await navigator.clipboard.writeText(url);
      } catch {
        // clipboard blocked (permissions / insecure context): fall back to selecting the URL in a prompt
        window.prompt('Copy this link:', url);
      }
      setState('copied');
    } catch {
      setState('failed');
    }
    setTimeout(() => setState('idle'), 2200);
  }

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button onClick={copy} className="px-3 py-1.5 rounded border border-hairline-bright text-xs font-data text-ink-muted hover:text-ink hover:bg-panel" aria-live="polite">
        {state === 'copied' ? '✓ Link copied' : state === 'failed' ? 'Could not build link' : '🔗 Copy share link'}
      </button>
      {note && state === 'copied' && <span className="text-[10px] font-data text-gold max-w-[16rem] text-right">{note}</span>}
    </span>
  );
}
