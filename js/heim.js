/* ============================================================
   Vikingheim.

   The settlement the rest of the site only draws in silhouette,
   built once in three dimensions: an island raised from a height
   field, gable-roofed longhouses inside a palisade, a longship at
   the dock, and a rune stone burning the same cyan as the one on
   the shore.

   It teaches nothing. It is the one place on this site that is
   only worth looking at, and it costs a 700 KB library to draw,
   so it is never loaded until someone asks for it and never
   offered to a phone on mobile data. Everything that matters
   still works if this file never arrives.
   ============================================================ */

import * as THREE from '../vendor/three.module.min.js';

/* Colour follows the page, not the reference renders. Those are lit by a
   midday sun; this has to sit inside a site that is navy at every hour, so
   the sky, the banners and the sails are the palette from css/app.css. */
const COLOR = {
  sand: new THREE.Color('#c9b489'),
  grassLight: new THREE.Color('#658d50'),
  grassMid: new THREE.Color('#446c3c'),
  grassDark: new THREE.Color('#3d6236'),
  rockHigh: new THREE.Color('#7e857e'),
  trunk: '#5a4022',
  birch: '#cfc7ae',
  pineDark: '#2f5236',
  pineMed: '#3b6743',
  leaf: '#4e7442',
  leafDark: '#3a6337',
  berry: '#b3552f',          // --rust
  rock: '#767c82',
  rockDark: '#575d63',
  wall: '#7a5333',
  wallDark: '#5c3d24',
  roof: '#6b4a30',
  roofDark: '#4c3320',
  fence: '#5a4128',
  towerRoof: '#5c3020',
  bannerRed: '#a32b33',      // the flag's red, taken down to firelight
  hull: '#8a6238',
  hullTrim: '#5c3d24',
  sailCream: '#efe3c8',      // --parchment
  sailRed: '#a32b33',
  rune: '#2f3d44',           // the same stone as the shore scene
  runeGlow: '#8fe8f2',
  flame: '#ff9a44',
  flameCore: '#ffd27a',
};

const HORIZON = new THREE.Color('#d9a668');   // --tint, dawn
const ZENITH = new THREE.Color('#22334a');    // --sky-hi, dawn, taken down a stop

const clamp01 = (t) => Math.max(0, Math.min(1, t));
const smooth = (t) => { const c = clamp01(t); return c * c * (3 - 2 * c); };
const lerpColor = (a, b, t) => a.clone().lerp(b, clamp01(t));

/* Deterministic value noise. The island has to come out the same every time
   it is opened, or the place you visited yesterday is not the place you
   visit today, so nothing here touches Math.random. */
function hash(x, y, s = 0) {
  const v = Math.sin(x * 127.1 + y * 311.7 + s * 91.7) * 43758.5453;
  return v - Math.floor(v);
}

let live = null;

/** Build the island into `container` and start the loop. */
export function mount(container) {
  if (live) dispose();

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x53637a, 46, 120);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  container.appendChild(renderer.domElement);

  // Sky dome, coloured per vertex and seen from the inside.
  const skyGeo = new THREE.SphereGeometry(90, 16, 12);
  const skyPos = skyGeo.attributes.position;
  const skyColors = new Float32Array(skyPos.count * 3);
  for (let i = 0; i < skyPos.count; i++) {
    // The warm band belongs on the horizon. Spread over the whole dome it
    // stops being dawn light and becomes an orange wall behind the island.
    const c = lerpColor(HORIZON, ZENITH, smooth(clamp01((skyPos.getY(i) / 90 + 0.06) / 0.62)));
    skyColors.set([c.r, c.g, c.b], i * 3);
  }
  skyGeo.setAttribute('color', new THREE.BufferAttribute(skyColors, 3));
  scene.add(new THREE.Mesh(skyGeo, new THREE.MeshBasicMaterial({
    vertexColors: true, side: THREE.BackSide, fog: false,
  })));

  /* ---------- camera ---------- */
  const HOME = { azimuth: Math.PI * 0.28, elevation: 0.72, dist: 34 };
  const cam = { ...HOME, targetAzimuth: HOME.azimuth, targetElevation: HOME.elevation, targetDist: HOME.dist };
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 200);
  const lookAt = new THREE.Vector3(0, 1.6, 0);

  function place() {
    const r = cam.dist;
    camera.position.set(
      r * Math.cos(cam.elevation) * Math.sin(cam.azimuth),
      r * Math.sin(cam.elevation) + 2,
      r * Math.cos(cam.elevation) * Math.cos(cam.azimuth),
    );
    camera.lookAt(lookAt);
  }

  /* ---------- light ---------- */
  scene.add(new THREE.HemisphereLight(0xdfe6ee, 0x2a3320, 0.55));
  const sun = new THREE.DirectionalLight(0xffd9a8, 1.15);
  sun.position.set(-16, 14, 8);
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0x6a86c8, 0.32);
  fill.position.set(12, 8, -12);
  scene.add(fill);

  /* ---------- ground ---------- */
  function heightAt(x, z) {
    const nx = x / 17, nz = z / 12.5;
    const distN = Math.sqrt(nx * nx + nz * nz);
    const mask = smooth(clamp01(1 - (distN - 0.34) / 0.62));
    const noiseAmp = 0.18 + 0.85 * smooth(distN);
    const n = (Math.sin(x * 0.5 + z * 0.32)
      + Math.sin(x * 0.24 - z * 0.61) * 0.8
      + Math.sin(x * 0.9 + z * 1.05) * 0.35) / 2.15;
    return Math.max(-0.55, mask * 3.1 + n * noiseAmp);
  }

  const terrainGeo = new THREE.PlaneGeometry(34, 26, 46, 36);
  terrainGeo.rotateX(-Math.PI / 2);
  const tPos = terrainGeo.attributes.position;
  const tColors = new Float32Array(tPos.count * 3);
  for (let i = 0; i < tPos.count; i++) {
    const wx = tPos.getX(i), wz = tPos.getZ(i);
    const h = heightAt(wx, wz);
    tPos.setY(i, h);
    const c = h < 0.15 ? lerpColor(COLOR.sand, COLOR.grassLight, (h + 0.55) / 0.7)
      : h < 1.6 ? lerpColor(COLOR.grassLight, COLOR.grassMid, (h - 0.15) / 1.45)
        : lerpColor(COLOR.grassMid, COLOR.rockHigh, (h - 1.6) / 1.6);
    const jitter = 1 + (hash(wx, wz, 4) - 0.5) * 0.08;
    tColors.set([c.r * jitter, c.g * jitter, c.b * jitter], i * 3);
  }
  terrainGeo.setAttribute('color', new THREE.BufferAttribute(tColors, 3));
  terrainGeo.computeVertexNormals();
  scene.add(new THREE.Mesh(terrainGeo,
    new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })));

  const waterGeo = new THREE.PlaneGeometry(150, 150, 26, 26);
  waterGeo.rotateX(-Math.PI / 2);
  const water = new THREE.Mesh(waterGeo, new THREE.MeshPhongMaterial({
    color: new THREE.Color('#2f6a88'), transparent: true, opacity: 0.88,
    shininess: 60, flatShading: true,
  }));
  water.position.y = 0.02;
  scene.add(water);
  const wPos = waterGeo.attributes.position;

  /* ---------- scatter helpers ---------- */
  const group = new THREE.Group();
  scene.add(group);

  const stdMat = (color, opts = {}) =>
    new THREE.MeshLambertMaterial({ color, flatShading: true, ...opts });

  function addMesh(geo, mat, x, y, z, ry = 0, scale = 1) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.y = ry;
    if (typeof scale === 'number') m.scale.setScalar(scale);
    else m.scale.set(...scale);
    group.add(m);
    return m;
  }

  const geoTrunk = new THREE.CylinderGeometry(0.09, 0.13, 1.3, 6);
  const geoRock = new THREE.DodecahedronGeometry(0.4, 0);
  const geoBerry = new THREE.SphereGeometry(0.05, 4, 3);

  const taken = [];
  const clear = (x, z, r) => taken.every(([ox, oz, orr]) => Math.hypot(x - ox, z - oz) >= r + orr);
  const claim = (x, z, r) => taken.push([x, z, r]);

  function pine(x, z, s = 1) {
    const y = heightAt(x, z);
    addMesh(geoTrunk, stdMat(COLOR.trunk), x, y + 0.55 * s, z, 0, [0.9 * s, s, 0.9 * s]);
    for (const l of [
      { r: 0.62, h: 0.9, y: 1.1, c: COLOR.pineMed },
      { r: 0.46, h: 0.8, y: 1.65, c: COLOR.pineDark },
      { r: 0.28, h: 0.65, y: 2.15, c: COLOR.pineMed },
    ]) addMesh(new THREE.ConeGeometry(l.r * s, l.h * s, 6), stdMat(l.c),
      x, y + l.y * s, z, hash(x, z, l.y) * Math.PI);
  }

  function birch(x, z, s = 1) {
    const y = heightAt(x, z);
    addMesh(geoTrunk, stdMat(COLOR.birch), x, y + 0.85 * s, z, 0, [0.55 * s, 1.5 * s, 0.55 * s]);
    const canopy = hash(x, z, 8) > 0.5 ? COLOR.leaf : COLOR.leafDark;
    addMesh(new THREE.IcosahedronGeometry(0.75 * s, 0), stdMat(canopy),
      x + 0.15 * s, y + 2.05 * s, z, hash(x, z, 1) * Math.PI, [1, 0.8, 1]);
    addMesh(new THREE.IcosahedronGeometry(0.55 * s, 0), stdMat(COLOR.leaf),
      x - 0.3 * s, y + 1.9 * s, z + 0.2 * s, hash(x, z, 2) * Math.PI);
  }

  function bush(x, z) {
    const y = heightAt(x, z);
    addMesh(new THREE.IcosahedronGeometry(0.34, 0), stdMat(COLOR.leaf),
      x, y + 0.3, z, hash(x, z, 3) * Math.PI,
      [1 + hash(x, z, 4) * 0.3, 0.75, 1 + hash(x, z, 5) * 0.3]);
    for (let i = 0; i < 2; i++) {
      const a = hash(x, z, 6 + i) * Math.PI * 2;
      addMesh(geoBerry, stdMat(COLOR.berry),
        x + Math.cos(a) * 0.28, y + 0.32 + hash(x, z, 9 + i) * 0.15, z + Math.sin(a) * 0.28);
    }
  }

  function rocks(x, z, n = 3) {
    for (let i = 0; i < n; i++) {
      const a = hash(x, z, 10 + i) * Math.PI * 2;
      const rr = hash(x, z, 20 + i) * 0.5;
      const px = x + Math.cos(a) * rr, pz = z + Math.sin(a) * rr;
      const s = 0.5 + hash(x, z, 30 + i) * 0.6;
      addMesh(geoRock, stdMat(hash(px, pz, 40) > 0.5 ? COLOR.rock : COLOR.rockDark),
        px, heightAt(px, pz) + 0.2 * s, pz, hash(px, pz, 50) * Math.PI,
        [s, s * (0.7 + hash(px, pz, 60) * 0.5), s]);
    }
  }

  /* ---------- buildings ---------- */

  /* A gable roof as six points and six triangles. A box rotated 45 degrees
     would have been less code and would also have had no ridge, and the ridge
     line is the whole silhouette of a longhouse. */
  function gableRoof(w, d, ridgeH, overhang) {
    const hw = w / 2 + overhang, hd = d / 2 + overhang;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([
      -hw, 0, -hd, hw, 0, -hd, hw, 0, hd, -hw, 0, hd, 0, ridgeH, -hd, 0, ridgeH, hd,
    ], 3));
    geo.setIndex([0, 3, 5, 0, 5, 4, 1, 4, 5, 1, 5, 2, 0, 1, 4, 3, 5, 2]);
    geo.computeVertexNormals();
    return geo;
  }

  const banners = [];
  function longhouse(x, z, w, d, wallH, ridgeH, rotY = 0) {
    const y = heightAt(x, z);
    claim(x, z, Math.max(w, d) * 0.75 + 0.6);
    addMesh(new THREE.BoxGeometry(w, wallH, d), stdMat(COLOR.wall), x, y + wallH / 2, z, rotY);
    addMesh(gableRoof(w + 0.3, d + 0.3, ridgeH, 0.35),
      stdMat(COLOR.roof, { side: THREE.DoubleSide }), x, y + wallH, z, rotY);

    // Crossed beam horns at each gable end.
    const beam = new THREE.CylinderGeometry(0.04, 0.04, 0.9, 4);
    for (const side of [-1, 1]) {
      const dz = side * (d / 2 + 0.35);
      const px = x + Math.sin(rotY) * dz, pz = z + Math.cos(rotY) * dz;
      for (const tilt of [0.35, -0.35]) {
        const m = addMesh(beam, stdMat(COLOR.roofDark), px, y + wallH + ridgeH, pz);
        m.rotation.z = tilt;
        m.rotation.y = rotY;
      }
    }

    const ddz = d / 2 + 0.15;
    addMesh(new THREE.BoxGeometry(0.9, 1.3, 0.25), stdMat(COLOR.wallDark),
      x - Math.sin(rotY) * ddz, y + 0.65, z - Math.cos(rotY) * ddz, rotY);

    const poleX = x - Math.sin(rotY) * (ddz + 0.5) + Math.cos(rotY) * (w / 2 - 0.3);
    const poleZ = z - Math.cos(rotY) * (ddz + 0.5) - Math.sin(rotY) * (w / 2 - 0.3);
    addMesh(new THREE.CylinderGeometry(0.035, 0.035, 1.6, 5), stdMat(COLOR.trunk), poleX, y + 0.9, poleZ);
    const banner = addMesh(new THREE.PlaneGeometry(0.5, 0.9, 1, 3),
      stdMat(COLOR.bannerRed, { side: THREE.DoubleSide }), poleX, y + 1.15, poleZ + 0.02);
    banner.rotation.y = rotY;
    banners.push(banner);
  }

  const VILLAGE_R = 8.2;
  const gateAngle = Math.PI * 0.5;

  const spike = new THREE.ConeGeometry(0.17, 1.9, 4);
  const SPIKES = 108;
  for (let i = 0; i < SPIKES; i++) {
    const a = (i / SPIKES) * Math.PI * 2;
    if (Math.abs(((a - gateAngle + Math.PI) % (Math.PI * 2)) - Math.PI) < 0.28) continue;
    const px = Math.sin(a) * VILLAGE_R, pz = Math.cos(a) * VILLAGE_R;
    const m = addMesh(spike, stdMat(COLOR.fence), px, heightAt(px, pz) + 0.95, pz);
    m.rotation.z = (hash(px, pz, 70) - 0.5) * 0.15;
    m.rotation.x = (hash(px, pz, 71) - 0.5) * 0.15;
  }

  function watchtower(x, z) {
    const y = heightAt(x, z);
    const leg = new THREE.CylinderGeometry(0.06, 0.08, 2.1, 5);
    for (const [dx, dz] of [[0.35, 0.35], [-0.35, 0.35], [0.35, -0.35], [-0.35, -0.35]]) {
      addMesh(leg, stdMat(COLOR.fence), x + dx, y + 1.05, z + dz);
    }
    addMesh(new THREE.BoxGeometry(1, 0.14, 1), stdMat(COLOR.wallDark), x, y + 2.15, z);
    addMesh(new THREE.ConeGeometry(0.85, 0.7, 4), stdMat(COLOR.towerRoof), x, y + 2.75, z, Math.PI / 4);
  }
  for (const a of [gateAngle + 1.05, gateAngle - 1.05, gateAngle + Math.PI]) {
    watchtower(Math.sin(a) * VILLAGE_R, Math.cos(a) * VILLAGE_R);
  }

  longhouse(-2.6, -3.0, 4.6, 3.0, 1.9, 1.6, 0.15);
  longhouse(3.4, -1.6, 3.4, 2.4, 1.6, 1.3, -0.5);
  longhouse(-4.2, 2.6, 3.2, 2.2, 1.5, 1.2, 0.9);
  longhouse(1.2, 4.0, 5.0, 2.8, 1.7, 1.4, 0.05);
  claim(0, 0, 4.6);

  /* ---------- fire and the rune stone ---------- */
  const flickers = [];
  const flames = [];

  (function campfire(x, z) {
    const y = heightAt(x, z);
    const log = new THREE.CylinderGeometry(0.06, 0.06, 0.7, 5);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const m = addMesh(log, stdMat(COLOR.trunk), x + Math.cos(a) * 0.12, y + 0.08, z + Math.sin(a) * 0.12);
      m.rotation.x = Math.PI / 2;
      m.rotation.z = a;
    }
    flames.push(addMesh(new THREE.ConeGeometry(0.16, 0.5, 6),
      new THREE.MeshBasicMaterial({ color: COLOR.flameCore }), x, y + 0.35, z));
    const light = new THREE.PointLight(0xff9a44, 1.5, 8, 2);
    light.position.set(x, y + 0.6, z);
    scene.add(light);
    flickers.push({ light, phase: hash(x, z, 77) * 10, base: 1.5 });
  })(0, -0.2);

  let runeMat = null;
  (function runeStone(x, z) {
    const y = heightAt(x, z);
    claim(x, z, 1.6);
    runeMat = new THREE.MeshStandardMaterial({
      color: COLOR.rune, emissive: new THREE.Color(COLOR.runeGlow),
      emissiveIntensity: 0.55, flatShading: true,
    });
    addMesh(new THREE.CylinderGeometry(0.24, 0.36, 2.3, 4, 1), runeMat, x, y + 1.15, z, 0.4, [1, 1, 0.5]);
    const base = new THREE.DodecahedronGeometry(0.3, 0);
    [[0.5, 0.3], [-0.45, 0.35], [0.15, -0.5]].forEach(([dx, dz], i) =>
      addMesh(base, stdMat(i % 2 ? COLOR.rock : COLOR.rockDark), x + dx, y + 0.15, z + dz, i));
    const light = new THREE.PointLight(0x8fe8f2, 1.1, 6, 2);
    light.position.set(x, y + 1.4, z);
    scene.add(light);
    flickers.push({ light, phase: hash(x, z, 88) * 10, base: 1.1, slow: true });
  })(-VILLAGE_R - 3.2, VILLAGE_R * 0.15);

  /* ---------- dock and longship ---------- */
  const dockX = Math.sin(gateAngle), dockZ = Math.cos(gateAngle);
  const plank = new THREE.BoxGeometry(1, 0.12, 1.4);
  const leg = new THREE.CylinderGeometry(0.05, 0.05, 0.6, 5);
  for (let i = 0; i < 6; i++) {
    const dist = VILLAGE_R + 1.2 + i * 1.05;
    const px = dockX * dist, pz = dockZ * dist;
    const y = Math.max(heightAt(px, pz), 0.06);
    addMesh(plank, stdMat(COLOR.hullTrim), px, y, pz, gateAngle);
    addMesh(leg, stdMat(COLOR.hullTrim), px - 0.4, y - 0.35, pz);
    addMesh(leg, stdMat(COLOR.hullTrim), px + 0.4, y - 0.35, pz);
  }

  /* The hull is lofted from seven cross-sections rather than modelled, so the
     sheer line and the rising stems come out of the ring scales alone. */
  (function longship(originX, originZ, rotY) {
    const rings = [
      { x: -3.1, s: 0.05, y: 0.5 }, { x: -2.2, s: 0.55, y: 0.15 },
      { x: -1.0, s: 0.92, y: 0.0 }, { x: 0.0, s: 1.0, y: 0.0 },
      { x: 1.0, s: 0.85, y: 0.05 }, { x: 1.9, s: 0.5, y: 0.35 },
      { x: 2.8, s: 0.04, y: 1.55 },
    ];
    const section = (s) => [
      [0.35 * s, -0.42 * s], [-0.15 * s, -0.55 * s], [-0.5 * s, 0],
      [-0.15 * s, 0.55 * s], [0.35 * s, 0.42 * s],
    ];
    const positions = [], colors = [], indices = [];
    const trimC = new THREE.Color(COLOR.hullTrim), hullC = new THREE.Color(COLOR.hull);
    const grid = rings.map((r) => section(r.s).map(([y, z], pi) => {
      positions.push(r.x, y + r.y, z);
      const c = pi === 0 || pi === 4 ? trimC : hullC;
      colors.push(c.r, c.g, c.b);
      return positions.length / 3 - 1;
    }));
    for (let ri = 0; ri < rings.length - 1; ri++) {
      for (let pi = 0; pi < 4; pi++) {
        indices.push(grid[ri][pi], grid[ri][pi + 1], grid[ri + 1][pi + 1],
          grid[ri][pi], grid[ri + 1][pi + 1], grid[ri + 1][pi]);
      }
      indices.push(grid[ri][0], grid[ri + 1][0], grid[ri + 1][4],
        grid[ri][0], grid[ri + 1][4], grid[ri][4]);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();

    const rig = new THREE.Group();
    rig.position.set(originX, Math.min(0.28, heightAt(originX, originZ) + 0.28), originZ);
    rig.rotation.y = rotY;
    rig.add(new THREE.Mesh(geo, new THREE.MeshLambertMaterial({
      vertexColors: true, flatShading: true, side: THREE.DoubleSide,
    })));

    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 2.6, 6), stdMat(COLOR.trunk));
    mast.position.set(0, 1.35, 0);
    rig.add(mast);

    const sailGeo = new THREE.PlaneGeometry(1.4, 1.7, 1, 6);
    const sPos = sailGeo.attributes.position;
    const sColors = new Float32Array(sPos.count * 3);
    const cream = new THREE.Color(COLOR.sailCream), red = new THREE.Color(COLOR.sailRed);
    for (let i = 0; i < sPos.count; i++) {
      const rowT = (sPos.getY(i) + 0.85) / 1.7;
      sPos.setZ(i, Math.sin(rowT * Math.PI) * 0.3);
      const stripe = Math.floor(rowT * 6) % 2 === 0 ? cream : red;
      sColors.set([stripe.r, stripe.g, stripe.b], i * 3);
    }
    sailGeo.setAttribute('color', new THREE.BufferAttribute(sColors, 3));
    sailGeo.computeVertexNormals();
    const sail = new THREE.Mesh(sailGeo, new THREE.MeshLambertMaterial({
      vertexColors: true, flatShading: true, side: THREE.DoubleSide,
    }));
    sail.position.set(0, 1.9, 0);
    sail.rotation.y = Math.PI / 2;
    rig.add(sail);

    const head = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.55, 4), stdMat(COLOR.hullTrim));
    head.position.set(3.05, 1.5, 0);
    head.rotation.z = -Math.PI / 2.4;
    rig.add(head);

    group.add(rig);
  })(dockX * (VILLAGE_R + 7.6), dockZ * (VILLAGE_R + 7.6), gateAngle + Math.PI / 2 + 0.15);

  /* ---------- scatter ---------- */
  for (let i = 0; i < 26; i++) {
    const a = hash(i, 1, 100) * Math.PI * 2, r = 9 + hash(i, 2, 101) * 9;
    const x = Math.sin(a) * r, z = Math.cos(a) * r;
    if (heightAt(x, z) < -0.2 || !clear(x, z, 0.9)) continue;
    claim(x, z, 0.9);
    if (hash(i, 3, 102) > 0.4) pine(x, z, 0.85 + hash(i, 4, 103) * 0.5);
    else birch(x, z, 0.8 + hash(i, 5, 104) * 0.4);
  }
  for (let i = 0; i < 16; i++) {
    const a = hash(i, 6, 110) * Math.PI * 2, r = 6 + hash(i, 7, 111) * 12;
    const x = Math.sin(a) * r, z = Math.cos(a) * r;
    if (heightAt(x, z) < -0.1 || !clear(x, z, 0.5)) continue;
    claim(x, z, 0.5);
    bush(x, z);
  }
  for (let i = 0; i < 10; i++) {
    const a = hash(i, 8, 120) * Math.PI * 2, r = 5 + hash(i, 9, 121) * 13;
    const x = Math.sin(a) * r, z = Math.cos(a) * r;
    if (heightAt(x, z) < -0.2 || !clear(x, z, 0.7)) continue;
    claim(x, z, 0.7);
    rocks(x, z, 2 + Math.floor(hash(i, 10, 122) * 2));
  }

  place();

  /* ---------- interaction ---------- */
  let drag = null;
  let autoRotate = true;

  const onDown = (e) => {
    drag = { x: e.clientX, y: e.clientY };
    autoRotate = false;
    container.setPointerCapture?.(e.pointerId);
  };
  const onMove = (e) => {
    if (!drag) return;
    cam.targetAzimuth -= (e.clientX - drag.x) * 0.006;
    cam.targetElevation = Math.min(1.25, Math.max(0.14, cam.targetElevation + (e.clientY - drag.y) * 0.005));
    drag = { x: e.clientX, y: e.clientY };
  };
  const onUp = () => { drag = null; };
  const onWheel = (e) => {
    e.preventDefault();
    cam.targetDist = Math.min(52, Math.max(12, cam.targetDist + e.deltaY * 0.02));
  };
  // Keyboard, because a view you can only inspect with a mouse is a view some
  // people simply cannot inspect.
  const onKey = (e) => {
    const step = { ArrowLeft: [0.12, 0, 0], ArrowRight: [-0.12, 0, 0], ArrowUp: [0, 0.08, 0], ArrowDown: [0, -0.08, 0], '+': [0, 0, -3], '-': [0, 0, 3] }[e.key];
    if (!step) return;
    e.preventDefault();
    autoRotate = false;
    cam.targetAzimuth += step[0];
    cam.targetElevation = Math.min(1.25, Math.max(0.14, cam.targetElevation + step[1]));
    cam.targetDist = Math.min(52, Math.max(12, cam.targetDist + step[2]));
  };

  container.addEventListener('pointerdown', onDown);
  container.addEventListener('pointermove', onMove);
  container.addEventListener('pointerup', onUp);
  container.addEventListener('pointercancel', onUp);
  container.addEventListener('wheel', onWheel, { passive: false });
  container.addEventListener('keydown', onKey);

  const resize = () => {
    const w = container.clientWidth || 1, h = container.clientHeight || 1;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  const ro = new ResizeObserver(resize);
  ro.observe(container);
  resize();

  /* ---------- loop ---------- */
  const clock = new THREE.Clock();
  let raf = 0;
  function frame() {
    raf = requestAnimationFrame(frame);
    const t = clock.getElapsedTime();

    if (autoRotate) cam.targetAzimuth += 0.0011;
    cam.azimuth += (cam.targetAzimuth - cam.azimuth) * 0.08;
    cam.elevation += (cam.targetElevation - cam.elevation) * 0.08;
    cam.dist += (cam.targetDist - cam.dist) * 0.1;
    place();

    for (let i = 0; i < wPos.count; i++) {
      wPos.setY(i, Math.sin(wPos.getX(i) * 0.4 + t * 1.1) * 0.05 + Math.cos(wPos.getZ(i) * 0.5 - t * 0.8) * 0.04);
    }
    wPos.needsUpdate = true;

    for (const { light, phase, base, slow } of flickers) {
      light.intensity = base
        + Math.sin(t * (slow ? 2.2 : 9) + phase) * (slow ? 0.25 : 0.22)
        + Math.sin(t * 3.1 + phase) * 0.08;
    }
    for (const f of flames) f.scale.setScalar(1 + Math.sin(t * 11) * 0.12);
    for (const b of banners) b.rotation.z = Math.sin(t * 1.6 + b.position.x) * 0.06;
    runeMat.emissiveIntensity = 0.5 + Math.sin(t * 1.8) * 0.2;

    renderer.render(scene, camera);
  }
  frame();

  live = {
    dispose() {
      cancelAnimationFrame(raf);
      ro.disconnect();
      container.removeEventListener('pointerdown', onDown);
      container.removeEventListener('pointermove', onMove);
      container.removeEventListener('pointerup', onUp);
      container.removeEventListener('pointercancel', onUp);
      container.removeEventListener('wheel', onWheel);
      container.removeEventListener('keydown', onKey);
      // Every geometry and material built above is per-mount, so leaving the
      // view twice without this is two islands' worth of GPU memory held by
      // nothing.
      scene.traverse((o) => {
        o.geometry?.dispose();
        for (const m of [o.material].flat()) m?.dispose();
      });
      renderer.dispose();
      renderer.domElement.remove();
    },
    reset() {
      Object.assign(cam, { targetAzimuth: HOME.azimuth, targetElevation: HOME.elevation, targetDist: HOME.dist });
      autoRotate = false;
    },
  };
}

export function dispose() {
  live?.dispose();
  live = null;
}

export function reset() {
  live?.reset();
}
