import { useEffect } from 'react'
import { useFireStore } from '../store'
import type { FirePoint } from '../data/sample'

// Inspector (demo's #inspector / #inspHint): the clicked point/group —
// both original observations for matched pairs, plus distance and
// time-difference evidence. Demo quirk preserved verbatim: the MODIS
// observation line for a matched pair reads "Terra • FRP 58.4 MW".
export default function Inspector({ points }: { points: FirePoint[] }) {
  const selectedPointId = useFireStore((s) => s.selectedPointId)
  const inspectorPoint = useFireStore((s) => s.inspectorPoint)
  // A RealMap click hands the Inspector the full point directly (its
  // GeoJSON feature is not in the hero map's 700-dot sample, so an id
  // lookup would miss). A hero-map click clears inspectorPoint and the
  // id lookup below takes over.
  const p = inspectorPoint ?? points.find((x) => x.id === selectedPointId) ?? null

  // On narrow screens the demo scrolls the Inspector into view.
  useEffect(() => {
    if (p && window.innerWidth < 1020) {
      document.getElementById('inspector')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [p])

  return (
    <div className="card">
      <div className="card-h">
        <b>Inspector</b>
        <span id="inspHint">
          {p ? `Record #${String(p.id).padStart(5, '0')}` : 'Click a map point'}
        </span>
      </div>
      <div className="card-b" id="inspector">
        {!p && (
          <>
            <p style={{ color: 'var(--muted)', fontSize: 13, lineHeight: 1.6, margin: 0 }}>
              Select any dot on the map — ideally a lime matched pair — to see both
              original satellite observations side by side: distance, time gap, FRP
              and confidence.
            </p>
            <div
              style={{
                marginTop: 12,
                background: '#0F0F10',
                border: '1px solid var(--line)',
                borderRadius: 10,
                padding: 12,
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: 22 }}>◎</div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                Try the glowing lime point
                <br />
                in Northern California
              </div>
            </div>
          </>
        )}
        {p && (
          <>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>
              {p.type === 'matched' ? (
                <span style={{ color: 'var(--match)' }}>● MATCHED PAIR</span>
              ) : p.type === 'amb' ? (
                <span style={{ color: 'var(--amb)' }}>● AMBIGUOUS GROUP</span>
              ) : (
                <span style={{ color: 'var(--muted)' }}>
                  ○ UNMATCHED / SINGLE SENSOR
                </span>
              )}
            </div>
            <div className="mono" style={{ fontSize: 11, color: 'var(--muted)' }}>
              RECORD #{String(p.id).padStart(5, '0')} • {p.sat.toUpperCase()}
            </div>
            <div className="inspector-row">
              <span>Location</span>
              <b>
                {p.lat}°, {p.lon}°
              </b>
            </div>
            <div className="inspector-row">
              <span>Fire Radiative Power</span>
              <b>{p.frp} MW</b>
            </div>
            <div className="inspector-row">
              <span>Confidence</span>
              <b>{p.conf}%</b>
            </div>
            {p.type === 'matched' && (
              <>
                <div className="inspector-row">
                  <span>Partner distance</span>
                  <b>{p.dist} km ✓ ≤1.0</b>
                </div>
                <div className="inspector-row">
                  <span>Time difference</span>
                  <b>{p.dt} h ✓ ≤4h</b>
                </div>
                <div className="inspector-row">
                  <span>MODIS obs</span>
                  <b>
                    {p.sat === 'Terra' || p.sat === 'Aqua'
                      ? `${p.sat} • FRP ${p.frp} MW`
                      : 'Partner record — in dataset'}
                  </b>
                </div>
                <div className="inspector-row">
                  <span>VIIRS obs</span>
                  <b>
                    {p.sat === 'NOAA-20' || p.sat === 'S-NPP'
                      ? `${p.sat} • FRP ${p.frp} MW`
                      : 'Partner record — in dataset'}
                  </b>
                </div>
              </>
            )}
            {p.type === 'amb' && (
              <div className="info-box" style={{ marginTop: 10 }}>
                Multiple candidates within 1.0 km / 4 h. Kept ambiguous —{' '}
                <b>not</b> counted as a confirmed match.
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
