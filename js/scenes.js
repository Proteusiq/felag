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

const water = (y) => `<rect x="0" y="${y}" width="1440" height="${900 - y}" fill="#101c26" opacity=".85"/>
  <path d="M0,${y + 14} Q120,${y + 8} 240,${y + 14} T480,${y + 14} T720,${y + 14} T960,${y + 14} T1200,${y + 14} T1440,${y + 14}"
    stroke="#253a44" stroke-width="2" fill="none" opacity=".5"/>
  <path d="M0,${y + 42} Q120,${y + 35} 240,${y + 42} T480,${y + 42} T720,${y + 42} T960,${y + 42} T1200,${y + 42} T1440,${y + 42}"
    stroke="#253a44" stroke-width="2" fill="none" opacity=".4"/>`;

/* Haze on the horizon, not darkness.
   Distance in this landscape is carried by air, not by dimming: the far trees
   are the same colour as the near ones with more sky in front of them. One
   band sitting on the waterline is the whole trick. */
const haze = (y, o = .5) => `<rect x="0" y="${y - 90}" width="1440" height="180" fill="url(#haze)" opacity="${o}"/>`;

/* A sail on the horizon, cream with a red stripe, the width of a thumbnail.
   Rides the same long clock as the swan: a session is long enough to notice
   it has moved, never long enough to watch it move. */
const longship = (x, y, s, o) => `<g transform="translate(${x},${y}) scale(${s})" opacity="${o}">
  <path d="M-30,10 Q-35,0 -25,-2 L25,-2 Q35,0 30,10 Q0,17 -30,10 Z" fill="#2a3a42"/>
  <path d="M-25,-3 Q-29,-13 -20,-15 M25,-3 Q29,-15 19,-17" stroke="#2a3a42" stroke-width="3" fill="none" stroke-linecap="round"/>
  <rect x="-2" y="-42" width="4" height="40" fill="#2a3a42"/>
  <rect x="-17" y="-40" width="34" height="34" fill="#ded3ba"/>
  <rect x="-17" y="-32" width="34" height="6" fill="#a8563f"/>
  <rect x="-17" y="-19" width="34" height="6" fill="#a8563f"/>
  <animateTransform attributeName="transform" type="translate" additive="sum"
    values="0 0; ${-190 * s} 0; 0 0" dur="150s" repeatCount="indefinite"/></g>`;

/* The stone is the one lit thing in the landscape.
   Every reference for this project puts a glowing monolith at the centre of
   the settlement, and it earns its place here for a different reason: it is
   the only object on the shore that is looking back at you. The pulse is slow
   enough to read as breathing rather than as a notification. */
const runestone = `<g transform="translate(700,555)">
  <ellipse cx="0" cy="30" rx="120" ry="130" fill="url(#rune)">
    <animate attributeName="opacity" values=".55;.9;.55" dur="7s" repeatCount="indefinite"/></ellipse>
  <path d="M-26,90 L-30,10 Q-30,-30 0,-34 Q30,-30 30,10 L26,90 Z" fill="#2f3d44"/>
  <g stroke="#8fe8f2" stroke-linecap="round" fill="none" opacity=".7">
    <animate attributeName="opacity" values=".45;.85;.45" dur="7s" repeatCount="indefinite"/>
    <path d="M-16,20 L-4,-4 L6,14 L16,-8" stroke-width="3.5"/>
    <path d="M-14,44 L14,44 M-12,58 L12,58" stroke-width="3" opacity=".65"/>
  </g>
</g>`;

/* A log palisade, seen from inside the ring.
   Sharpened stave tops on uneven heights, because a wall built by a village is
   never level. Sits behind the hall so the room reads as enclosed rather than
   as a stage set with two posts on it. */
const palisade = (y, fill) => {
  let out = '';
  for (let x = -20; x < 1460; x += 34) {
    const h = 150 + ((x * 37) % 46);
    out += `<path d="M${x},${y} L${x},${y - h} L${x + 13},${y - h - 20} L${x + 26},${y - h} L${x + 26},${y} Z" fill="${fill}"/>`;
  }
  return out;
};

/* Firelight from below. Two ellipses, warm core inside a wide falloff, on a
   deliberately uneven clock so no two fires in a scene breathe together. */
const ember = (x, y, w, dur) => `<g>
  <ellipse cx="${x}" cy="${y}" rx="${w}" ry="${w * .42}" fill="#ff9a44" opacity=".14">
    <animate attributeName="opacity" values=".10;.20;.13;.18;.10" dur="${dur}s" repeatCount="indefinite"/></ellipse>
  <ellipse cx="${x}" cy="${y}" rx="${w * .42}" ry="${w * .2}" fill="#ffd27a" opacity=".3">
    <animate attributeName="opacity" values=".22;.38;.26;.34;.22" dur="${dur * .7}s" repeatCount="indefinite"/></ellipse>
</g>`;

/* Holger Danske, waiting at the water's edge.
   He is the one who sleeps until Denmark needs him, so landfall is where he
   belongs: he is already standing there when you arrive to say who you are.
   He gets the landfall scene alone. On the guide picker the six guides are the
   subject, and a seventh viking behind them is just noise. */
const holger = `<g transform="translate(600,505) scale(0.47)" opacity=".26">
  <path d="M120 252 Q220 216 320 252 L340 456 Q220 482 100 456 Z" fill="#5f4028"/>
  <g fill="#7a5738">
    <circle cx="132" cy="264" r="11"/><circle cx="168" cy="248" r="11"/><circle cx="204" cy="240" r="11"/>
    <circle cx="236" cy="240" r="11"/><circle cx="272" cy="248" r="11"/><circle cx="308" cy="264" r="11"/>
  </g>
  <rect x="310" y="176" width="14" height="240" rx="7" fill="#5c3a21"/>
  <path d="M324 188 L392 170 L400 218 L380 242 L324 230 Z" fill="#79838c"/>
  <path d="M380 242 L400 218 L408 244 L388 262 Z" fill="#5b656d"/>
  <path d="M166 268 Q220 238 274 268 L268 452 Q220 468 172 452 Z" fill="#3d5a4c"/>
  <path d="M174 352 H266" stroke="#2c4137" stroke-width="14"/>
  <path d="M174 286 Q140 306 122 330" stroke="#c08b5f" stroke-width="22" stroke-linecap="round" fill="none"/>
  <path d="M266 286 Q298 296 313 318" stroke="#c08b5f" stroke-width="22" stroke-linecap="round" fill="none"/>
  <!-- Shield last of the body, so it covers the forearm behind it: a round
       shield is gripped at the boss, not carried out at arm's length. -->
  <circle cx="104" cy="342" r="88" fill="#8a3324"/>
  <circle cx="104" cy="342" r="72" fill="none" stroke="#e7dcc4" stroke-width="6"/>
  <circle cx="104" cy="342" r="53" fill="none" stroke="#e7dcc4" stroke-width="4"/>
  <circle cx="104" cy="342" r="17" fill="#3d3d3d"/>
  <path d="M166 156 Q158 234 180 270 Q220 296 260 270 Q282 234 274 156 Z" fill="#cfc7b4"/>
  <g fill="none" stroke="#a8a08c" stroke-width="4" stroke-linecap="round">
    <path d="M186 238 Q194 264 208 276"/><path d="M254 238 Q246 264 232 276"/><path d="M204 258 Q220 278 236 258"/>
  </g>
  <ellipse cx="220" cy="152" rx="62" ry="64" fill="#c08b5f"/>
  <g class="rig-eyes" style="--ed:2.3s">
    <ellipse cx="196" cy="150" rx="8" ry="10" fill="#3d3d3d"/>
    <ellipse cx="244" cy="150" rx="8" ry="10" fill="#3d3d3d"/>
  </g>
  <path d="M178 130 Q196 118 213 129" stroke="#8a6142" stroke-width="6" stroke-linecap="round" fill="none"/>
  <path d="M227 129 Q244 118 262 131" stroke="#8a6142" stroke-width="6" stroke-linecap="round" fill="none"/>
  <ellipse cx="188" cy="178" rx="11" ry="7" fill="#a8674a" opacity=".45"/>
  <ellipse cx="252" cy="178" rx="11" ry="7" fill="#a8674a" opacity=".45"/>
  <path d="M184 176 Q203 190 217 182 Q220 188 223 182 Q237 190 256 176 Q248 204 220 207 Q192 204 184 176 Z" fill="#cfc7b4"/>
  <path d="M162 124 A58 58 0 0 1 278 124 L278 137 Q220 110 162 137 Z" fill="#79838c"/>
  <path d="M162 130 Q220 106 278 130" stroke="#5b656d" stroke-width="7" fill="none"/>
  <rect x="212" y="72" width="16" height="60" rx="4" fill="#5b656d"/>
  <circle cx="220" cy="72" r="11" fill="#6b7075"/>
  <path d="M172 134 Q126 122 86 58 Q106 118 148 148 Z" fill="#ded3ba"/>
  <path d="M268 134 Q314 122 354 58 Q334 118 292 148 Z" fill="#ded3ba"/>
  <path d="M162 138 Q124 120 100 78" stroke="#bdb298" stroke-width="3" fill="none"/>
  <path d="M278 138 Q316 120 340 78" stroke="#bdb298" stroke-width="3" fill="none"/>
</g>`;

/* Mute swan, Denmark's national bird. Drifts the width of the fjord
   over a long session; nobody is meant to notice it quickly. */
const swan = (x, y, s, o) => `<g transform="translate(${x},${y}) scale(${s})" opacity="${o}">
  <path d="M0,10 Q-18,10 -20,0 Q-8,4 0,2 Q6,-16 20,-20 Q10,-10 10,2 Q16,4 18,10 Q6,14 0,10 Z" fill="#cfc2a4"/>
  <animateTransform attributeName="transform" type="translate" additive="sum"
    values="0 0; 140 0; 0 0" dur="90s" repeatCount="indefinite"/></g>`;

const SCENES = {
  // The shore. You have just landed. Flat farmland, beech woods, a rune stone.
  shore: {
    palette: 'dawn',
    layers: [
      { d: 0.02, svg: sky },
      { d: 0.06, svg: `<path d="M0,590 Q200,570 420,585 T860,580 T1260,590 L1440,585 1440,900 0,900 Z" fill="#16262f"/>` },
      { d: 0.14, svg: beech('#1b2c31', [[70,630,60],[150,640,52],[240,628,58],[330,642,50],[420,626,62],[520,638,54],[900,628,56],[990,640,50],[1080,624,60],[1170,638,52],[1260,626,58],[1350,640,54]]) },
      { d: 0.22, svg: runestone },
      { d: 0.30, svg: haze(600, .55) },
      { d: 0.34, svg: beech('#253a44', [[30,700,70],[140,712,62],[250,696,72],[380,712,64],[1060,696,68],[1180,712,62],[1300,698,72],[1410,712,56]]) },
      // The horizon here is land, so a sail on it would be a ship parked on a
      // ridge. The only water in this scene is the strait in front of you, and
      // that is where the ship you arrived on is drawn.
      { d: 0.46, svg: water(760) + longship(1250, 836, 1.1, .75) + swan(1020, 808, 1, .55) + swan(200, 792, .75, .4) },
    ],
  },
  // Landfall. The same shore, but Holger is standing on it, waiting to be told
  // who you are. Only ever shown on "Hvem øver?".
  landfall: {
    palette: 'dawn',
    layers: [],
  },
  // The path inland. Midday, the sea still visible behind you.
  path: {
    palette: 'day',
    layers: [
      { d: 0.02, svg: sky },
      { d: 0.08, svg: water(520) + longship(290, 540, .6, .3) + longship(455, 552, .46, .2) },
      { d: 0.12, svg: haze(524, .45) },
      { d: 0.16, svg: `<path d="M0,600 Q300,575 620,596 T1160,590 L1440,600 1440,900 0,900 Z" fill="#16262f"/>` },
      { d: 0.26, svg: beech('#1d2f31', [[120,640,64],[250,652,54],[1150,640,60],[1290,652,56],[1400,644,50]]) },
      // the road itself, worn pale through the grass
      { d: 0.4, svg: `<path d="M620,900 Q700,760 690,660 Q684,600 720,560" stroke="#35464a" stroke-width="46" fill="none" opacity=".5" stroke-linecap="round"/>
        <path d="M620,900 Q700,760 690,660 Q684,600 720,560" stroke="#45564f" stroke-width="18" fill="none" opacity=".45" stroke-linecap="round" stroke-dasharray="8 22"/>` },
      { d: 0.5, svg: beech('#253a44', [[60,760,74],[1380,760,70]]) },
    ],
  },
  // Inside a hall. Firelight, close and warm, nothing to look at but the question.
  hall: {
    palette: 'day',
    layers: [
      { d: 0.02, svg: `<rect width="1440" height="900" fill="url(#sky)"/>` },
      { d: 0.06, svg: `<circle cx="720" cy="440" r="520" fill="url(#glow)" opacity=".5"/>` },
      { d: 0.11, svg: `<g opacity=".55">${palisade(900, '#142029')}</g>` },
      { d: 0.16, svg: `<g opacity=".5" fill="#182730">
          <rect x="70" y="120" width="34" height="780" rx="6"/><rect x="1336" y="120" width="34" height="780" rx="6"/>
          <rect x="210" y="200" width="26" height="700" rx="6"/><rect x="1204" y="200" width="26" height="700" rx="6"/>
        </g>` },
      // The hearth is off the floor of the frame, so the room is lit from
      // below the reader rather than from behind the text.
      { d: 0.32, svg: ember(720, 880, 260, 4.3) },
    ],
  },
  // The Ting at dusk. Standing stones, firelight from below, you are being weighed.
  ting: {
    palette: 'dusk',
    layers: [
      { d: 0.02, svg: sky },
      { d: 0.1, svg: `<path d="M0,640 Q360,610 720,632 T1440,626 L1440,900 0,900 Z" fill="#1b1a26"/>` },
      { d: 0.24, svg: [140,320,500,940,1120,1300].map((x, i) =>
          `<path d="M${x - 26},760 L${x - 30},${640 + (i % 3) * 26} Q${x - 30},${600 + (i % 3) * 26} ${x},${596 + (i % 3) * 26} Q${x + 30},${600 + (i % 3) * 26} ${x + 30},${640 + (i % 3) * 26} L${x + 26},760 Z" fill="#292734"/>`).join('') },
      { d: 0.4, svg: ember(720, 800, 150, 5.2) },
    ],
  },
  // The Alting at night. The full assembly. This is the exam.
  alting: {
    palette: 'night',
    layers: [
      { d: 0.02, svg: `<rect width="1440" height="900" fill="url(#sky)"/>` },
      { d: 0.05, svg: Array.from({ length: 60 }, (_, i) =>
          `<circle cx="${(i * 397) % 1440}" cy="${(i * 233) % 420}" r="${1 + (i % 3) * .5}" fill="#efe3c8" opacity="${.12 + (i % 5) * .05}"/>`).join('') },
      { d: 0.14, svg: `<path d="M0,660 Q360,630 720,652 T1440,646 L1440,900 0,900 Z" fill="#12151f"/>` },
      // torches down both sides, flicker on deliberately uneven timing
      { d: 0.3, svg: [180, 400, 1040, 1260].map((x, i) =>
          `<g><ellipse cx="${x}" cy="600" rx="46" ry="70" fill="#ff9a44" opacity=".13">
            <animate attributeName="opacity" values=".10;.19;.12;.17;.10" dur="${3.1 + i * 0.7}s" repeatCount="indefinite"/></ellipse>
            <ellipse cx="${x}" cy="606" rx="9" ry="15" fill="#ffd27a" opacity=".55"/></g>`).join('') },
    ],
  },
};

// Same shore, Holger where the rune stone stands.
SCENES.landfall.layers = SCENES.shore.layers.map(
  (layer) => (layer.svg === runestone ? { ...layer, svg: holger } : layer));

const defs = `<defs>
  <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="var(--sky-hi)"/><stop offset="100%" stop-color="var(--sky-lo)"/>
  </linearGradient>
  <radialGradient id="glow" cx="50%" cy="50%" r="50%">
    <stop offset="0%" stop-color="var(--tint)" stop-opacity=".18"/>
    <stop offset="100%" stop-color="var(--tint)" stop-opacity="0"/>
  </radialGradient>
  <linearGradient id="haze" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="var(--tint)" stop-opacity="0"/>
    <stop offset="50%" stop-color="var(--tint)" stop-opacity=".16"/>
    <stop offset="100%" stop-color="var(--tint)" stop-opacity="0"/>
  </linearGradient>
  <radialGradient id="rune" cx="50%" cy="50%" r="50%">
    <stop offset="0%" stop-color="#8fe8f2" stop-opacity=".22"/>
    <stop offset="60%" stop-color="#8fe8f2" stop-opacity=".06"/>
    <stop offset="100%" stop-color="#8fe8f2" stop-opacity="0"/>
  </radialGradient>
</defs>`;

let host = null;
let depths = [];
let tiltBase = null;
let tiltOn = false;
let tiltAsked = false;
let mounted = false;

export const still = matchMedia('(prefers-reduced-motion: reduce)');

const clamp = (value) => Math.max(-1, Math.min(1, value));

function move(x, y) {
  if (!host || still.matches) return;
  document.documentElement.style.setProperty('--scene-light-x', `${(50 + x * 12).toFixed(2)}%`);
  document.documentElement.style.setProperty('--scene-light-y', `${(36 + y * 9).toFixed(2)}%`);
  host.querySelectorAll('.layer').forEach((layer, index) => {
    const depth = depths[index] ?? 0;
    layer.style.transform = `translate(${(-x * depth * 34).toFixed(2)}px, ${(-y * depth * 18).toFixed(2)}px)`;
  });
}

function orient(event) {
  if (!tiltOn || event.beta === null || event.gamma === null) return;
  tiltBase ??= { beta: event.beta, gamma: event.gamma };
  move(clamp((event.gamma - tiltBase.gamma) / 24), clamp((event.beta - tiltBase.beta) / 24));
}

function canTilt() {
  return !still.matches && matchMedia('(pointer:coarse)').matches && 'DeviceOrientationEvent' in window;
}

function startTilt() {
  tiltBase = null;
  tiltOn = true;
}

export async function requestTilt() {
  if (!canTilt() || tiltOn || tiltAsked) return false;
  tiltAsked = true;
  const permission = DeviceOrientationEvent.requestPermission;
  try {
    if (permission && await permission.call(DeviceOrientationEvent) !== 'granted') return false;
  } catch {
    return false;
  }
  startTilt();
  return true;
}

export function mount(el) {
  host = el;
  if (mounted) return;
  mounted = true;
  // Android exposes orientation without a prompt. iPhone requires a tap, which
  // requestTilt receives from the learner's first route choice.
  if (canTilt() && !DeviceOrientationEvent.requestPermission) startTilt();
  // Pointer movement provides the same depth on desktop.
  addEventListener('pointermove', (event) => {
    if (!matchMedia('(pointer:fine)').matches || tiltOn) return;
    move((event.clientX / innerWidth - .5) * 2, (event.clientY / innerHeight - .5) * 2);
  }, { passive: true });
  addEventListener('deviceorientation', orient, { passive: true });
}

export function show(name) {
  const scene = SCENES[name] ?? SCENES.shore;
  document.body.dataset.palette = scene.palette;
  depths = scene.layers.map((l) => l.d);
  host.innerHTML = `<svg viewBox="0 0 1440 900" preserveAspectRatio="xMidYMax slice"
    xmlns="http://www.w3.org/2000/svg">${defs}${
    scene.layers.map((l) => `<g class="layer">${l.svg}</g>`).join('')}</svg>`;
  // The drifting swan, the sails and the torches are SMIL, which no CSS
  // media query can reach. Asking the document to hold still is the only
  // honest way to keep the reduced-motion promise for them.
  if (still.matches) host.firstChild.pauseAnimations();
}
