import { useFireStore, type Layers } from '../store'
import type { FirePoint } from '../data/sample'
import { FireDot } from './Hero'

// Main fire map (demo's #mainMap): dot map on a plain dark background
// with grid cells — the offline fallback IS the map (framework §5.2).
// No Leaflet, no tiles: the demo's custom div-based map, ported as-is.
// Layer toggles filter which point types render.
export default function FireMap({ points, isSample }: { points: FirePoint[]; isSample: boolean }) {
  const layers = useFireStore((s) => s.layers)
  const selectedDate = useFireStore((s) => s.selectedDate)
  const visible = points.filter((p) => layers[p.type as keyof Layers])

  return (
    <>
      <div className="map-stage big-map" id="mainMap">
        {visible.map((p) => (
          <FireDot key={p.id} p={p} />
        ))}
        <div
          style={{
            position: 'absolute',
            left: 12,
            bottom: 10,
            fontSize: 11,
            color: '#9C978C',
          }}
          className="mono"
        >
          GRID AGGREGATED • {visible.length} {isSample ? 'SAMPLE' : 'REAL'} POINTS SHOWN
        </div>
        <div
          style={{
            position: 'absolute',
            right: 12,
            top: 10,
            background: 'rgba(10,10,11,.7)',
            border: '1px solid #26262B',
            padding: '6px 9px',
            borderRadius: 999,
            fontSize: 11,
          }}
          className="mono"
        >
          {selectedDate ? selectedDate : 'JUL–SEP 2023'}
        </div>
      </div>
      <div style={{ padding: '12px 14px' }}>
        <div className="legend">
          <span>
            <i className="dot" style={{ background: 'var(--amber)' }}></i>MODIS only
          </span>
          <span>
            <i className="dot" style={{ background: 'var(--cyan)' }}></i>VIIRS only
          </span>
          <span>
            <i className="dot" style={{ background: 'var(--match)' }}></i>Matched —
            both agree
          </span>
          <span>
            <i className="dot" style={{ background: 'var(--amb)' }}></i>Ambiguous
            group
          </span>
        </div>
        <div className="notice">
          ⚠ Raw detections are <b>not</b> counts of unique fires. One fire can be
          detected many times. Only lime matched pairs are confirmed one-to-one
          agreements.
        </div>
      </div>
    </>
  )
}
