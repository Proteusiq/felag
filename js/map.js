/* ============================================================
   The saga map.

   The same journey the list of halls describes, laid out as
   ground you can see across. Nothing here owns state: app.js
   hands over a chain of stops with a gate on each, and this
   draws them. The list remains the way through for anyone who
   cannot use a map, so this is allowed to be a picture.

   Six halls inland from the shore, the Ting on the high ground
   at dusk, the Alting at the summit. The road between them is
   dashed until you have walked it.

   The island is inhabited. The guide you chose is the figure you
   steer, and the five you did not choose walk it on their own.
   ============================================================ */

import { CAST } from './cast.js';
import { still } from './scenes.js';

/* Where each stop stands. Fixed, because a map whose landmarks move is not a
   map. The chain runs south-west to north-east and climbs as it goes: the
   Alting is the last node and the highest. */
export const STOPS = [
  [200, 615], [325, 495], [470, 560], [615, 440],
  [750, 515], [875, 400], [955, 275], [1010, 155],
];

/* Coastline drawn around the chain rather than the chain fitted into a
   coastline, so no stop can drift into the sea when the road is retuned.
   Bitten into on every side: an outline this size reads as a blob unless the
   bays are deeper than looks reasonable while drawing it. */
const COAST = `M95 320 Q120 195 250 165 Q330 95 430 140 Q540 60 660 115
  Q790 45 930 85 Q1090 120 1110 270 Q1160 400 1075 500
  Q1030 600 900 615 Q810 700 690 655 Q560 745 430 680
  Q300 730 195 655 Q80 590 60 470 Q45 380 95 320 Z`;

const peak = (x, y, w, h) =>
  `<path class="peak" d="M${x - w} ${y} l${w} ${-h} l${w} ${h}z"/>
   <path class="snow" d="M${x} ${y - h} l${-w * 0.4} ${h * 0.42} l${w * 0.4} ${-h * 0.1} l${w * 0.4} ${h * 0.11}z"/>`;

/* Beech again, as on the shore: the rounded canopy is what keeps the whole
   project from reading as generic fantasy north. */
const wood = (x, y, r) =>
  `<ellipse class="wood" cx="${x}" cy="${y}" rx="${r}" ry="${r * 0.6}"/>
   <ellipse class="wood" cx="${x + r * 0.9}" cy="${y + r * 0.3}" rx="${r * 0.72}" ry="${r * 0.44}"/>`;

const terrain = `
  <path class="sea-ring" d="${COAST}"/>
  <path class="land" d="${COAST}"/>
  <path class="shore-line" d="${COAST}"/>
  <path class="grain" d="${COAST}"/>

  <path class="fjord" d="M120 470 Q200 430 250 470 Q300 515 255 560"/>
  <path class="river" d="M980 175 Q930 265 960 340 Q985 410 930 470 Q880 525 900 600"/>

  ${peak(880, 210, 46, 78)}${peak(970, 185, 52, 92)}${peak(1065, 300, 40, 66)}
  ${peak(430, 225, 40, 66)}${peak(520, 205, 46, 80)}

  ${wood(250, 340, 26)}${wood(330, 370, 22)}${wood(155, 415, 20)}
  ${wood(560, 640, 24)}${wood(640, 662, 20)}
  ${wood(820, 578, 24)}${wood(886, 602, 18)}
  ${wood(690, 305, 22)}${wood(762, 332, 18)}

  <text class="region" x="700" y="190">HØJLANDET</text>
  <text class="region-sub" x="700" y="206">TINGET OG ALTINGET</text>
  <text class="sea-name" x="235" y="748">VESTERHAVET</text>`;

/* The glyph inside the ring. Halls carry their numeral; the two assemblies
   carry what they are, so that a stop's kind survives being read at a glance
   and at small sizes. */
const glyph = (stop) => stop.kind === 'ting'
  ? `<g class="stop-glyph"><path d="M-8 6v-9M0 6v-13M8 6v-9"/><path d="M-11 7h22"/></g>`
  : stop.kind === 'alting'
    ? `<g class="stop-glyph"><path d="M0-9c4 4 6 7 6 10a6 6 0 0 1-12 0c0-3 2-6 6-10Z"/><path d="M-10 9h20"/></g>`
    : `<text class="stop-numeral" y="5">${stop.numeral}</text>`;

const node = (stop, i) => {
  const [x, y] = STOPS[i];
  const shut = stop.gate === 'shut';
  return `<g class="stop ${stop.gate}" transform="translate(${x} ${y})"
      style="--accent:var(${stop.accent})"
      tabindex="0" role="button" data-i="${i}"
      aria-disabled="${shut}" aria-label="${stop.aria}">
    ${stop.gate === 'open' ? '<circle class="stop-pulse" r="30"/>' : ''}
    <circle class="stop-halo" r="30"/>
    <circle class="stop-ring" r="21"/>
    ${glyph(stop)}
    <text class="stop-name" y="46">${stop.name}</text>
    <text class="stop-state" y="63">${stop.state}</text>
  </g>`;
};

/* One leg of the road, as a bare `d`. Drawn as the road, walked by the figures
   and used as the leash for yours, so all three can never disagree about where
   the road actually runs. */
const lane = (i) => {
  const [px, py] = STOPS[i];
  const [x, y] = STOPS[i + 1];
  const mx = (px + x) / 2 + (i % 2 ? 34 : -34);
  const my = (py + y) / 2 + 26;
  return `M${px} ${py} Q${mx} ${my} ${x} ${y}`;
};

/* The beach below Hal I. The chain of stops begins inland, so without this the
   road you are allowed to walk would have no length at all on the first day
   and your figure would stand frozen on the spot. The ships put in here, the
   others come up the sand, and the road starts where they land. */
const BEACH = 'M264 688 Q224 658 200 615';

/* Two approaches, both ending at the beach. Nobody arrives in this country by
   any other means. */
const SEA = [
  'M-60 744 Q92 738 260 692',
  'M672 774 Q456 750 268 696',
];

/* The road. Dashed while it is still ahead of you, solid once the stop it
   leads to has been cleared, which is the same rule the gate uses. */
const road = (stops) => STOPS.slice(1).map((_, i) =>
  `<path class="road ${stops[i + 1].gate === 'shut' ? 'ahead' : 'walked'}" d="${lane(i)}"/>`).join('');

/* The guides are already drawn, at 160x196 and in far more detail than a map
   needs. Reusing them beats cutting six new silhouettes: the figure on the
   road is demonstrably the same person who met you on the shore, and the
   breathing and the blinking come along for nothing, because those are CSS
   hung on class names the artwork already carries. The nested svg is given an
   explicit size so it does not expand to fill the map. */
const figure = (c, cls = '') => `<g class="${cls}" transform="translate(-17.6 -40.9) scale(.22)">${
  c.svg.replace('<svg ', '<svg width="160" height="196" ')}</g>`;

const walker = (c, path, dur, begin, back) => `<g style="animation-delay:${begin}s">
  ${figure(c, 'fig-step')}
  <animateMotion path="${path}" dur="${dur}s" begin="${begin}s" repeatCount="indefinite"
    ${back ? 'keyPoints="1;0" keyTimes="0;1" calcMode="linear"' : ''}/>
</g>`;

const ship = (path, dur, begin) => `<g>
  <path class="ship-hull" d="M-15 4 Q-18 -1 -13 -3 H13 Q18 -1 15 4 Q0 9 -15 4Z"/>
  <path class="ship-mast" d="M0 -3 V-19"/>
  <rect class="ship-sail" x="-8" y="-18.5" width="16" height="12.5"/>
  <path class="ship-stripe" d="M-8 -14.5 h16 M-8 -10 h16"/>
  <animateMotion path="${path}" dur="${dur}s" begin="${begin}s" repeatCount="indefinite"/>
  <animate attributeName="opacity" values="0;1;1;0" keyTimes="0;.1;.82;1"
    dur="${dur}s" begin="${begin}s" repeatCount="indefinite"/>
</g>`;

/**
 * Everyone else, and the ships they came on.
 *
 * The five guides you did not choose walk the ground that is open: the beach,
 * and whatever road you have already opened. They keep off the locked half,
 * which is what makes the locked half read as locked rather than as unvisited.
 * Assigned round-robin and never shuffled, so Gorm is found where Gorm was
 * yesterday; a map that reseats its inhabitants on every visit reads as noise.
 */
const folk = (stops, mine) => {
  const routes = [BEACH, ...STOPS.slice(1)
    .map((_, i) => (stops[i + 1].gate === 'shut' ? null : lane(i)))
    .filter(Boolean)];
  return SEA.map((p, i) => ship(p, 56 + i * 19, -i * 24)).join('')
    + CAST.filter((c) => c.id !== mine).map((c, i) =>
      walker(c, routes[i % routes.length], 24 + (i % 4) * 7, -i * 9, i >= routes.length)).join('');
};

/**
 * How far the road is yours to walk: up to the first stop still shut, and not
 * a step past it. This is the whole of "you may go where you have opened",
 * and it is derived from the same gates the halls are drawn from, so the leash
 * cannot drift out of step with what the map is showing.
 */
const leashPath = (stops) => {
  const shut = stops.findIndex((s) => s.gate === 'shut');
  const reach = shut === -1 ? STOPS.length - 1 : shut - 1;
  return BEACH + STOPS.slice(1, reach + 1).map((_, i) => lane(i)).join('');
};

/* Land colour is pulled down hard from the reference renders. Those are lit by
   a midday sun and can carry a bright grass; this sits inside a page that is
   navy at every hour, and a saturated green here shouts over the six accent
   colours the stops are trying to tell apart. Sage and olive, not grass. */
const defs = `<defs>
  <linearGradient id="mapland" x1="0" y1="0" x2=".4" y2="1">
    <stop offset="0%" stop-color="#334b3a"/><stop offset="100%" stop-color="#1e3025"/>
  </linearGradient>
  <pattern id="mapgrain" width="34" height="34" patternUnits="userSpaceOnUse">
    <path d="M34 0H0V34" fill="none" stroke="#8aa176" stroke-opacity=".07"/>
  </pattern>
</defs>`;

let view = { scale: 1, x: 0, y: 0 };

/**
 * Draw the map into `el`, with `guide` as the figure you steer, and call
 * `onPick(index)` when an unlocked stop is chosen. Called again on every
 * visit, so the view is reset each time: the map should open showing the whole
 * road, not wherever it was left panned.
 */
export function render(el, stops, guide, onPick) {
  view = { scale: 1, x: 0, y: 0 };
  const me = CAST.find((c) => c.id === guide) ?? CAST[0];
  el.innerHTML = `<div class="map-pan">
    <svg class="map-svg" viewBox="0 0 1200 780" xmlns="http://www.w3.org/2000/svg">
      ${defs}${terrain}${road(stops)}
      <!-- The others go under the stops: a name you cannot read is worse than a
           walker you cannot see, so the labels win every overlap. -->
      <g class="folk">
        <path class="leash" d="${leashPath(stops)}"/>
        ${folk(stops, me.id)}
      </g>
      ${stops.map(node).join('')}
      <!-- You go over them, and stand a little to the side of the marker. The
           one figure that must never be hidden is the one being steered, and
           walking to a hall would otherwise park you inside its own ring. -->
      <g class="folk mine"><g transform="translate(16 0)">
        <ellipse class="fig-mark" rx="15" ry="5"/>${figure(me)}
      </g></g>
    </svg>
  </div>`;

  const svg = el.querySelector('.map-svg');
  // SMIL is out of reach of the reduced-motion media query that silences every
  // CSS animation on the page, so the ships and the walkers are stopped by
  // hand, the same way the parallax scenes stop theirs.
  if (still.matches) svg.pauseAnimations();

  /* Your figure is leashed to the road you have opened: the pointer says where
     you would like to be, the leash decides how near to that it can get you.
     Sampled once into a flat list, because the leash cannot change until the
     map is drawn again, and scanning an array beats calling getPointAtLength
     for every pixel the pointer travels. */
  const leash = el.querySelector('.leash');
  const mine = el.querySelector('.mine');
  const span = leash.getTotalLength();
  const marks = Array.from({ length: 121 }, (_, i) => leash.getPointAtLength((span * i) / 120));
  let at = -1;
  const stand = (i) => {
    at = i;
    mine.setAttribute('transform', `translate(${marks[i].x} ${marks[i].y})`);
  };
  // You stand where you have got to, not back on the beach you landed on six
  // halls ago: the far end of the leash is the stop you may actually enter.
  stand(marks.length - 1);
  const follow = (e) => {
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(svg.getScreenCTM().inverse());
    let best = at;
    let near = Infinity;
    marks.forEach((m, i) => {
      const d = (m.x - p.x) ** 2 + (m.y - p.y) ** 2;
      if (d < near) { near = d; best = i; }
    });
    if (best !== at) stand(best);
  };

  // The pan is held as a percentage of the window rather than in pixels, so
  // that it survives the window being resized under it.
  const pan = el.querySelector('.map-pan');
  const apply = () => {
    pan.style.transform = `translate(${view.x}%,${view.y}%) scale(${view.scale})`;
  };

  /* A phone gives the board 358 pixels, which puts the stop names at four
     pixels of type and the stops themselves at twelve pixels of tap target.
     Fitting the whole island onto that screen is not a view of the map, it is
     a picture of one. So a narrow screen opens zoomed onto the stop you may
     actually enter, at a scale that brings the labels to about fifteen pixels
     and the targets to the forty-four a finger needs, and pans from there.

     Zoom first, then measure where the stop actually landed and slide it to
     the middle. Measuring beats predicting: the svg letterboxes inside its
     window by an amount that depends on both their shapes, and only the
     browser knows it.

     It has to measure more than once. The map is drawn while its section is
     still hidden, the view transition swaps it in over the following frames,
     and a matrix read mid-flight describes where the stop is passing through
     rather than where it will come to rest. Since the correction is relative,
     repeating it converges: once the transition settles the error falls to
     nothing and this stops. It gives up rather than spinning if the map is
     never shown at all, in which case the fitted view is a fine fallback. */
  let tries = 0;
  const openView = () => {
    if (++tries > 40) return;
    const box = el.getBoundingClientRect();
    const ctm = svg.getScreenCTM();
    // Both, not either: a hidden section can still hand out a screen matrix,
    // and dividing the correction by a zero-width box turns the pan into NaN,
    // which the browser drops on the floor as an invalid transform. That fails
    // silently and leaves the map fitted, looking exactly like a media query.
    if (!box.width || !ctm) return requestAnimationFrame(openView);
    view.scale = 3.4;
    const p = marks[marks.length - 1].matrixTransform(ctm);
    const dx = box.x + box.width / 2 - p.x;
    const dy = box.y + box.height / 2 - p.y;
    view.x += (dx / box.width) * 100;
    view.y += (dy / box.height) * 100;
    apply();
    if (Math.abs(dx) > 1 || Math.abs(dy) > 1) requestAnimationFrame(openView);
  };
  if (innerWidth < 760) requestAnimationFrame(openView);

  const pick = (target) => {
    const g = target.closest('.stop');
    if (!g || g.classList.contains('shut')) return;
    onPick(Number(g.dataset.i));
  };

  el.addEventListener('click', (e) => pick(e.target));
  el.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    if (!e.target.closest?.('.stop')) return;
    e.preventDefault();
    pick(e.target);
  });

  const zoom = (s) => { view.scale = Math.min(4, Math.max(.6, s)); apply(); };

  /* Drag to pan, two fingers to zoom. Pointer events only, so a finger and a
     mouse take the same path and no touch handling has to exist twice. Every
     live pointer is kept, because that is the whole of pinch detection: the
     moment there are two of them, the gesture is a zoom and not a drag. */
  const live = new Map();
  const gap = () => {
    const [a, b] = [...live.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };
  let from = null;
  let moved = false;
  let pinch = null;

  el.addEventListener('pointerdown', (e) => {
    live.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (live.size === 2) {
      pinch = { gap: gap(), scale: view.scale };
      from = null;
      return;
    }
    if (e.target.closest('.stop')) return;
    moved = false;
    from = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y, box: el.getBoundingClientRect() };
    el.setPointerCapture(e.pointerId);
    el.classList.add('grabbing');
  });

  el.addEventListener('pointermove', (e) => {
    if (live.has(e.pointerId)) live.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch) return zoom(pinch.scale * gap() / pinch.gap);
    // A drag is a drag. Your figure holds its ground while the map moves under
    // it, or panning would drag the two of you around together.
    if (!from) return follow(e);
    moved = true;
    view.x = from.vx + ((e.clientX - from.x) / from.box.width) * 100;
    view.y = from.vy + ((e.clientY - from.y) / from.box.height) * 100;
    apply();
  });

  const release = (e) => {
    live.delete(e.pointerId);
    if (live.size < 2) pinch = null;
    // On a touch screen there is no pointer hovering for the figure to follow,
    // so a tap on open ground has to say what a hover says on a mouse: walk to
    // here, as far as the leash allows. A tap on a stop never reaches this,
    // because those are let through untouched above.
    if (from && !moved) follow(e);
    from = null;
    el.classList.remove('grabbing');
  };
  el.addEventListener('pointerup', release);
  el.addEventListener('pointercancel', release);

  el.addEventListener('wheel', (e) => {
    e.preventDefault();
    zoom(view.scale * Math.exp(-e.deltaY * 0.0012));
  }, { passive: false });
}
