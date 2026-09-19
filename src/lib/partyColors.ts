// A broadcast-desk-friendly fallback palette, cycled when we can't infer a party's real color.
const FALLBACK_PALETTE = [
  '#E14B4B', '#3E7CB1', '#4FA86B', '#F2B705', '#8A6FD6',
  '#E0864F', '#3FB8AF', '#C24E85', '#7C8A9E', '#B5C24E',
];

// Best-effort known-party colors so common real-world parties render correctly out of the box.
const KNOWN_COLORS: Record<string, string> = {
  spd: '#E3000F', union: '#000000', cdu: '#000000', csu: '#008AC5',
  grune: '#1AA037', grüne: '#1AA037', fdp: '#FFED00', afd: '#009EE0',
  linke: '#BE3075', fw: '#F5A300', bsw: '#7D3F98',
  gerbsds: '#0033A0', 'gerb-sds': '#0033A0', ppdb: '#F7941D', 'pp-db': '#F7941D',
  vaz: '#5B2C6F', dps: '#009B77', bspol: '#D2001C', 'bsp-ol': '#D2001C',
  aps: '#663399', itn: '#00AEEF', mech: '#0B2340', veli: '#8B0000',
  sb: '#1E88E5', pb: '#004225', siy: '#00A99D',
  democrat: '#0044CC', democratic: '#0044CC', republican: '#CC0000',
};

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '')
    .trim();
}

export function assignColor(index: number, name: string): string {
  const key = slugify(name);
  if (KNOWN_COLORS[key]) return KNOWN_COLORS[key];
  return FALLBACK_PALETTE[index % FALLBACK_PALETTE.length];
}

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const bigint = parseInt(clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean, 16);
  return [(bigint >> 16) & 255, (bigint >> 8) & 255, bigint & 255];
}

function relativeLuminance(r: number, g: number, b: number): number {
  const [rs, gs, bs] = [r, g, b].map((c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

function adjustLightness(hex: string, deltaPct: number): string {
  const [r, g, b] = hexToRgb(hex);
  const max = Math.max(r, g, b) / 255;
  const min = Math.min(r, g, b) / 255;
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  const d = max - min;
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    const rn = r / 255, gn = g / 255, bn = b / 255;
    if (max === rn) h = ((gn - bn) / d) % 6;
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  const newL = Math.min(1, Math.max(0, l + deltaPct));
  const c = (1 - Math.abs(2 * newL - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = newL - c / 2;
  let [r1, g1, b1] = [0, 0, 0];
  if (h < 60) [r1, g1, b1] = [c, x, 0];
  else if (h < 120) [r1, g1, b1] = [x, c, 0];
  else if (h < 180) [r1, g1, b1] = [0, c, x];
  else if (h < 240) [r1, g1, b1] = [0, x, c];
  else if (h < 300) [r1, g1, b1] = [x, 0, c];
  else [r1, g1, b1] = [c, 0, x];
  const toHex = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, '0');
  return `#${toHex(r1)}${toHex(g1)}${toHex(b1)}`;
}

/**
 * Returns a version of `hex` guaranteed to be legible as text on the given background —
 * lightening colors that are too dark for a dark background, darkening colors too light
 * for a light background. Used anywhere a party's own color is used as text color rather
 * than a swatch, since real party colors (e.g. pure black) can otherwise vanish.
 */
export function readableOn(hex: string, background: 'dark' | 'light'): string {
  const [r, g, b] = hexToRgb(hex);
  const lum = relativeLuminance(r, g, b);
  if (background === 'dark') {
    return lum < 0.32 ? adjustLightness(hex, 0.4) : hex;
  }
  return lum > 0.6 ? adjustLightness(hex, -0.35) : hex;
}

/** Largest-remainder allocation of `totalSeats` proportional to each entry's share. */
export function allocateSeats(shares: { id: string; value: number }[], totalSeats: number): Record<string, number> {
  const sum = shares.reduce((a, s) => a + s.value, 0) || 1;
  const exact = shares.map((s) => ({ id: s.id, exact: (s.value / sum) * totalSeats }));
  const base = exact.map((e) => ({ id: e.id, seats: Math.floor(e.exact), rem: e.exact - Math.floor(e.exact) }));
  let assigned = base.reduce((a, b) => a + b.seats, 0);
  const byRemainder = [...base].sort((a, b) => b.rem - a.rem);
  let i = 0;
  while (assigned < totalSeats && byRemainder.length > 0) {
    byRemainder[i % byRemainder.length].seats += 1;
    assigned++;
    i++;
  }
  const result: Record<string, number> = {};
  base.forEach((b) => (result[b.id] = b.seats));
  return result;
}
