/* ============================================================
   Scenes.

   One renderer, scenes as data. A scene is a palette plus a
   stack of layers; each layer has a depth that drives parallax.
   Adding a scene later is a new object, not new code.

   Light travels with the journey: dawn on the shore, day on the
   path, dusk at the Ting, night at the Alting. Progress is
   something you feel without reading a number.
   ============================================================ */

const sky = `<rect width="1440" height="900" fill="url(#sky)"/>
  <circle cx="1230" cy="130" r="170" fill="url(#glow)"/>`;

/* Beech, not conifer. Denmark's national tree, and the rounded
   canopy is what keeps this from reading as generic fantasy north. */
const beech = (fill, ys, scale = 1) => ys.map(([x, y, r]) =>
  `<ellipse cx="${x}" cy="${y}" rx="${r * scale}" ry="${r * scale * 0.55}" fill="${fill}"/>`).join('');

const water = (y) => `<rect x="0" y="${y}" width="1440" height="${900 - y}" fill="#152224" opacity=".85"/>
  <path d="M0,${y + 14} Q120,${y + 8} 240,${y + 14} T480,${y + 14} T720,${y + 14} T960,${y + 14} T1200,${y + 14} T1440,${y + 14}"
    stroke="#2a3e3c" stroke-width="2" fill="none" opacity=".5"/>
  <path d="M0,${y + 42} Q120,${y + 35} 240,${y + 42} T480,${y + 42} T720,${y + 42} T960,${y + 42} T1200,${y + 42} T1440,${y + 42}"
    stroke="#2a3e3c" stroke-width="2" fill="none" opacity=".4"/>`;

/* Mute swan, Denmark's national bird. Drifts the width of the fjord
   over a long session; nobody is meant to notice it quickly. */
const swan = (x, y, s, o) => `<g transform="translate(${x},${y}) scale(${s})" opacity="${o}">
  <path d="M0,10 Q-18,10 -20,0 Q-8,4 0,2 Q6,-16 20,-20 Q10,-10 10,2 Q16,4 18,10 Q6,14 0,10 Z" fill="#c9bd9f"/>
  <animateTransform attributeName="transform" type="translate" additive="sum"
    values="0 0; 140 0; 0 0" dur="90s" repeatCount="indefinite"/></g>`;

const SCENES = {
  // The shore. You have just landed. Flat farmland, beech woods, a rune stone.
  shore: {
    palette: 'dawn',
    layers: [
      { d: 0.02, svg: sky },
      { d: 0.06, svg: `<path d="M0,590 Q200,570 420,585 T860,580 T1260,590 L1440,585 1440,900 0,900 Z" fill="#1c2e2f"/>` },
      { d: 0.14, svg: beech('#20302f', [[70,630,60],[150,640,52],[240,628,58],[330,642,50],[420,626,62],[520,638,54],[900,628,56],[990,640,50],[1080,624,60],[1170,638,52],[1260,626,58],[1350,640,54]]) },
      { d: 0.22, svg: `<g transform="translate(700,555)">
          <path d="M-26,90 L-30,10 Q-30,-30 0,-34 Q30,-30 30,10 L26,90 Z" fill="#33403e"/>
          <path d="M-16,20 L-4,-4 L6,14 L16,-8" stroke="#1c2e2f" stroke-width="3.5" fill="none" stroke-linecap="round" opacity=".7"/>
          <path d="M-14,44 L14,44 M-12,58 L12,58" stroke="#1c2e2f" stroke-width="3" fill="none" stroke-linecap="round" opacity=".5"/>
        </g>` },
      { d: 0.34, svg: beech('#2a3e3c', [[30,700,70],[140,712,62],[250,696,72],[380,712,64],[1060,696,68],[1180,712,62],[1300,698,72],[1410,712,56]]) },
      { d: 0.46, svg: water(760) + swan(1020, 808, 1, .55) + swan(200, 792, .75, .4) },
    ],
  },
  // The path inland. Midday, the sea still visible behind you.
  path: {
    palette: 'day',
    layers: [
      { d: 0.02, svg: sky },
      { d: 0.08, svg: water(520) },
      { d: 0.16, svg: `<path d="M0,600 Q300,575 620,596 T1160,590 L1440,600 1440,900 0,900 Z" fill="#1c2e2f"/>` },
      { d: 0.26, svg: beech('#22322f', [[120,640,64],[250,652,54],[1150,640,60],[1290,652,56],[1400,644,50]]) },
      // the road itself, worn pale through the grass
      { d: 0.4, svg: `<path d="M620,900 Q700,760 690,660 Q684,600 720,560" stroke="#3a4a44" stroke-width="46" fill="none" opacity=".5" stroke-linecap="round"/>
        <path d="M620,900 Q700,760 690,660 Q684,600 720,560" stroke="#4a5a50" stroke-width="18" fill="none" opacity=".45" stroke-linecap="round" stroke-dasharray="8 22"/>` },
      { d: 0.5, svg: beech('#2a3e3c', [[60,760,74],[1380,760,70]]) },
    ],
  },
  // Inside a hall. Firelight, close and warm, nothing to look at but the question.
  hall: {
    palette: 'day',
    layers: [
      { d: 0.02, svg: `<rect width="1440" height="900" fill="url(#sky)"/>` },
      { d: 0.06, svg: `<circle cx="720" cy="440" r="520" fill="url(#glow)" opacity=".5"/>` },
      { d: 0.16, svg: `<g opacity=".5" fill="#1b2a2b">
          <rect x="70" y="120" width="34" height="780" rx="6"/><rect x="1336" y="120" width="34" height="780" rx="6"/>
          <rect x="210" y="200" width="26" height="700" rx="6"/><rect x="1204" y="200" width="26" height="700" rx="6"/>
        </g>` },
    ],
  },
  // The Ting at dusk. Standing stones, firelight from below, you are being weighed.
  ting: {
    palette: 'dusk',
    layers: [
      { d: 0.02, svg: sky },
      { d: 0.1, svg: `<path d="M0,640 Q360,610 720,632 T1440,626 L1440,900 0,900 Z" fill="#1d1a24"/>` },
      { d: 0.24, svg: [140,320,500,940,1120,1300].map((x, i) =>
          `<path d="M${x - 26},760 L${x - 30},${640 + (i % 3) * 26} Q${x - 30},${600 + (i % 3) * 26} ${x},${596 + (i % 3) * 26} Q${x + 30},${600 + (i % 3) * 26} ${x + 30},${640 + (i % 3) * 26} L${x + 26},760 Z" fill="#2b2733"/>`).join('') },
      { d: 0.4, svg: `<ellipse cx="720" cy="800" rx="150" ry="34" fill="#d4763f" opacity=".16"/>
        <ellipse cx="720" cy="800" rx="70" ry="18" fill="#e0793c" opacity=".26"/>` },
    ],
  },
  // The Alting at night. The full assembly. This is the exam.
  alting: {
    palette: 'night',
    layers: [
      { d: 0.02, svg: `<rect width="1440" height="900" fill="url(#sky)"/>` },
      { d: 0.05, svg: Array.from({ length: 60 }, (_, i) =>
          `<circle cx="${(i * 397) % 1440}" cy="${(i * 233) % 420}" r="${1 + (i % 3) * .5}" fill="#e7dcc2" opacity="${.12 + (i % 5) * .05}"/>`).join('') },
      { d: 0.14, svg: `<path d="M0,660 Q360,630 720,652 T1440,646 L1440,900 0,900 Z" fill="#12151f"/>` },
      // torches down both sides, flicker on deliberately uneven timing
      { d: 0.3, svg: [180, 400, 1040, 1260].map((x, i) =>
          `<g><ellipse cx="${x}" cy="600" rx="46" ry="70" fill="#e0793c" opacity=".13">
            <animate attributeName="opacity" values=".10;.19;.12;.17;.10" dur="${3.1 + i * 0.7}s" repeatCount="indefinite"/></ellipse>
            <ellipse cx="${x}" cy="606" rx="9" ry="15" fill="#e0932e" opacity=".55"/></g>`).join('') },
    ],
  },
};

const defs = `<defs>
  <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="var(--sky-hi)"/><stop offset="100%" stop-color="var(--sky-lo)"/>
  </linearGradient>
  <radialGradient id="glow" cx="50%" cy="50%" r="50%">
    <stop offset="0%" stop-color="var(--tint)" stop-opacity=".18"/>
    <stop offset="100%" stop-color="var(--tint)" stop-opacity="0"/>
  </radialGradient>
</defs>`;

let host = null;
let depths = [];

export function mount(el) {
  host = el;
  // Pointer parallax, capped at a few pixels so it reads as depth, not as a toy.
  addEventListener('pointermove', (e) => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const x = (e.clientX / innerWidth - .5) * 2;
    const y = (e.clientY / innerHeight - .5) * 2;
    host.querySelectorAll('.layer').forEach((g, i) => {
      const d = depths[i] ?? 0;
      g.style.transform = `translate(${(-x * d * 34).toFixed(2)}px, ${(-y * d * 18).toFixed(2)}px)`;
    });
  }, { passive: true });
}

export function show(name) {
  const scene = SCENES[name] ?? SCENES.shore;
  document.body.dataset.palette = scene.palette;
  depths = scene.layers.map((l) => l.d);
  host.innerHTML = `<svg viewBox="0 0 1440 900" preserveAspectRatio="xMidYMax slice"
    xmlns="http://www.w3.org/2000/svg">${defs}${
    scene.layers.map((l) => `<g class="layer">${l.svg}</g>`).join('')}</svg>`;
}
