interface Segment {
  color: string;
  value: number; // fraction, segments should sum to ~1
}

interface Props {
  segments: Segment[];
  size?: number; // full diameter
}

/**
 * A CSS conic-gradient half-donut standing in for a dot-based parliamentary hemicycle —
 * communicates seat share at a glance without the complexity of true dot-packing.
 */
export function Hemicycle({ segments, size = 240 }: Props) {
  const total = segments.reduce((a, s) => a + s.value, 0) || 1;
  let cum = 0;
  const stops: string[] = [];
  for (const s of segments) {
    const start = (cum / total) * 50;
    cum += s.value;
    const end = (cum / total) * 50;
    stops.push(`${s.color} ${start}% ${end}%`);
  }
  stops.push(`transparent ${(cum / total) * 50}% 100%`);

  const gradient = `conic-gradient(from 180deg, ${stops.join(', ')})`;
  const thickness = size * 0.32;

  return (
    <div style={{ width: size, height: size / 2, position: 'relative', overflow: 'hidden' }}>
      <div style={{ width: size, height: size, borderRadius: '50%', background: gradient, position: 'absolute', top: 0 }} />
      <div
        style={{
          position: 'absolute',
          top: thickness,
          left: thickness,
          width: size - thickness * 2,
          height: size - thickness * 2,
          borderRadius: '50%',
          background: 'white',
        }}
      />
    </div>
  );
}
