// Footer — attribution, products, limitations, and the demo's photo
// credits, copied EXACTLY from the approved demo. Do not edit the
// credit text: every space photograph is real, and its source is named.
export default function Footer() {
  return (
    <footer>
      <div className="footer-inner">
        <div>
          <b style={{ color: 'var(--text)' }}>FireFusion AI</b> — NASA Space Apps
          Challenge 2026 • Team #786 • Challenge: Harmonization of MODIS and VIIRS
          Hot Spots
          <br />
          Data: NASA FIRMS • MODIS C6.1 (Terra/Aqua) • VIIRS 375 m (NOAA-20) •
          California, Jul–Sep 2023 case study
          <br />
          <span style={{ color: 'var(--text)' }}>
            This page is a UI demo with representative sample data to preview the
            design. The real app runs React + Vite + FastAPI on precomputed
            harmonized data.
          </span>
          <br />
          <span style={{ color: 'var(--text)' }}>
            Backdrop — real photographs only, nothing drawn or generated,
            colour-graded with light washes into the darker, muted Ember Dark
            nebula sky of the earlier version, the galactic band dimmed back down:
            NASA / ESA Hubble image of the star-forming region Sharpless 2-106; a
            Milky Way galactic-centre photograph; Hubble spiral galaxies
            (ESA/Hubble and NGC 976); Hubble&apos;s portrait of Saturn on the left
            with its complete ring system, fully inside the frame, drifting slowly
            while the full-Moon photograph circles it as a small moon in its ring
            plane; NASA photos of Earth, Jupiter and Mars — Earth and the Moon
            shown whole and blended into the sky with soft feathered edges, no
            frames and no discs around them. The planets are arranged as in the
            previous version — Saturn at the top-left in its original position
            behind the headline, Earth moved up to the top-right, Jupiter at the
            bottom-right, Mars at the bottom-left, and the Moon small mid-page —
            so none of them pile up together, and every planet and spacecraft sits
            fully on the page, with no scroll parallax on the repositioned bodies,
            so nothing is cut off by the page edge even at the very end of the
            page. Floating in the sky, also in motion: two real spacecraft
            photographs, shot against pure black space so they blend in with no
            visible frame — the International Space Station, photographed from a
            departing crew vehicle with the whole station inside the frame,
            enlarged and flying across the top-centre of the sky on its full
            wide-arc drift; and the Hubble Space Telescope, fitted into the left
            column between Saturn above it and Mars below it, with clear space on
            both sides and only a small, limited drift, so it holds its gap and
            never overlaps Earth. The only effects are light itself: a live
            starfield, meteors and a comet.
          </span>
        </div>
        <div className="mono" style={{ fontSize: 11 }}>
          EMBER DARK v1.0
          <br />
          MODIS #FFB020 • VIIRS #22D3EE
          <br />
          MATCH #A3E635 • AMB #FB7185
        </div>
      </div>
    </footer>
  )
}
