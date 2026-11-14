import { useFireStore } from '../store'

// Left control rail — always visible (framework §4): region + bounding
// box, layer toggles, matching rules, reset.
export default function LeftRail() {
  const layers = useFireStore((s) => s.layers)
  const toggleLayer = useFireStore((s) => s.toggleLayer)
  const resetDemo = useFireStore((s) => s.resetDemo)

  return (
    <aside className="card reveal" id="tour-rail">
      <div className="card-h">
        <b>Control Rail</b>
        <span>Always visible</span>
      </div>
      <div className="card-b">
        <div className="rail-group">
          <h4>Region</h4>
          <div style={{ fontWeight: 700 }}>California, USA</div>
          <div
            className="mono"
            style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4, lineHeight: 1.6 }}
          >
            32.5°N – 42.0°N
            <br />
            124.4°W – 114.1°W
          </div>
        </div>
        <div className="rail-group">
          <h4>Layers — try toggling</h4>
          <label className="toggle-row">
            <span>
              <i className="dot" style={{ background: 'var(--amber)' }}></i>MODIS
            </span>
            <input
              type="checkbox"
              id="layModis"
              checked={layers.modis}
              onChange={() => toggleLayer('modis')}
            />
          </label>
          <label className="toggle-row">
            <span>
              <i className="dot" style={{ background: 'var(--cyan)' }}></i>VIIRS
            </span>
            <input
              type="checkbox"
              id="layViirs"
              checked={layers.viirs}
              onChange={() => toggleLayer('viirs')}
            />
          </label>
          <label className="toggle-row">
            <span>
              <i className="dot" style={{ background: 'var(--match)' }}></i>Matched
              pairs
            </span>
            <input
              type="checkbox"
              id="layMatch"
              checked={layers.matched}
              onChange={() => toggleLayer('matched')}
            />
          </label>
          <label className="toggle-row">
            <span>
              <i className="dot" style={{ background: 'var(--amb)' }}></i>Ambiguous
            </span>
            <input
              type="checkbox"
              id="layAmb"
              checked={layers.amb}
              onChange={() => toggleLayer('amb')}
            />
          </label>
        </div>
        <div className="rail-group">
          <h4>Matching rules</h4>
          <div className="info-box">
            <b>≤ 1.0 km</b> apart
            <br />
            <b>≤ 4 hours</b> apart
            <br />
            <span style={{ fontSize: 11 }}>
              One-to-one only. Anything else stays ambiguous — never forced.
            </span>
          </div>
        </div>
        <button className="dl" style={{ width: '100%' }} onClick={resetDemo}>
          ↺ Reset to full season
        </button>
      </div>
    </aside>
  )
}
