// SANDLINE YARD — the map. An original desert-industrial compound: two bomb
// sites (A warehouse north-east, B courtyard south-east), three lanes (A long,
// mid, B tunnel), crates and containers for cover. Builds the three.js scene,
// the AABB colliders, the waypoint graph bots walk, and the collision /
// line-of-sight queries the rest of the game uses.
import * as THREE from 'three';
import { PALETTE } from './config.js';
import { S } from './state.js';
import { rand } from './rng.js';

const tmpV = new THREE.Vector3();

// ---- runtime-generated textures (no network, no image files) ----
function canvasTexture(size, draw) {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function sandTexture() {
  return canvasTexture(256, (g, s) => {
    g.fillStyle = '#c9a06b';
    g.fillRect(0, 0, s, s);
    for (let i = 0; i < 2600; i++) {
      g.fillStyle = rand() > 0.5 ? 'rgba(120,90,55,0.25)' : 'rgba(230,200,150,0.25)';
      g.fillRect(rand() * s, rand() * s, 2, 2);
    }
    g.strokeStyle = 'rgba(120,90,55,0.35)';
    g.lineWidth = 5;
    for (let i = 0; i < 4; i++) {
      g.beginPath();
      const y = 30 + i * 60 + rand() * 20;
      g.moveTo(0, y);
      g.bezierCurveTo(s * 0.3, y + 14, s * 0.6, y - 14, s, y);
      g.stroke();
    }
  });
}

function plankTexture() {
  return canvasTexture(128, (g, s) => {
    g.fillStyle = '#9c7a4e';
    g.fillRect(0, 0, s, s);
    g.strokeStyle = 'rgba(60,40,20,0.6)';
    g.lineWidth = 3;
    for (let y = 0; y <= s; y += 32) {
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(s, y);
      g.stroke();
    }
    g.strokeStyle = 'rgba(60,40,20,0.35)';
    g.lineWidth = 2;
    for (let i = 0; i < 8; i++) {
      const x = rand() * s;
      const y = Math.floor(rand() * 4) * 32;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x, y + 32);
      g.stroke();
    }
  });
}

function ribbedTexture(base) {
  return canvasTexture(128, (g, s) => {
    g.fillStyle = base;
    g.fillRect(0, 0, s, s);
    for (let x = 0; x < s; x += 16) {
      g.fillStyle = 'rgba(0,0,0,0.22)';
      g.fillRect(x, 0, 5, s);
      g.fillStyle = 'rgba(255,255,255,0.10)';
      g.fillRect(x + 5, 0, 3, s);
    }
    g.fillStyle = 'rgba(0,0,0,0.25)';
    g.fillRect(0, 0, s, 6);
    g.fillRect(0, s - 6, s, 6);
  });
}

function letterTexture(letter, color) {
  return canvasTexture(128, (g, s) => {
    g.clearRect(0, 0, s, s);
    g.font = 'bold 92px system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = color;
    g.fillText(letter, s / 2, s / 2 + 4);
  });
}

function skyTexture() {
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#2e3a52');
  grad.addColorStop(0.42, '#6f5f70');
  grad.addColorStop(0.52, '#d99a68');
  grad.addColorStop(0.7, '#e8a56b');
  grad.addColorStop(1, '#e8a56b');
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ---- construction helpers ----
const materials = {};
function mat(key, params) {
  if (!materials[key]) materials[key] = new THREE.MeshStandardMaterial(params);
  return materials[key];
}

function addBox(scene, x0, z0, x1, z1, y0, y1, material, collide = true) {
  const w = x1 - x0;
  const d = z1 - z0;
  const h = y1 - y0;
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set((x0 + x1) / 2, y0 + h / 2, (z0 + z1) / 2);
  mesh.castShadow = h > 0.5;
  mesh.receiveShadow = true;
  scene.add(mesh);
  if (collide) S.colliders.push({ x0, z0, x1, z1, y0, y1 });
  return mesh;
}

// Shared crate/container materials, built once: the texture makers run a
// single time instead of once per prop.
let sharedCrateMat = null;
function crateMat() {
  if (!sharedCrateMat) sharedCrateMat = new THREE.MeshStandardMaterial({ map: plankTexture(), roughness: 0.9 });
  return sharedCrateMat;
}

function addCrate(scene, x, z, size, rotY = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(size, size, size), crateMat());
  mesh.position.set(x, size / 2, z);
  mesh.rotation.y = rotY;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
  const r = size / 2 + 0.08;
  S.colliders.push({ x0: x - r, z0: z - r, x1: x + r, z1: z + r, y0: 0, y1: size });
}

function addBarrel(scene, x, z, color) {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.42, 0.42, 1.1, 14),
    mat('barrel' + color, { color, roughness: 0.55, metalness: 0.15 }),
  );
  mesh.position.set(x, 0.55, z);
  mesh.castShadow = true;
  scene.add(mesh);
  S.colliders.push({ x0: x - 0.42, z0: z - 0.42, x1: x + 0.42, z1: z + 0.42, y0: 0, y1: 1.1 });
}

function addContainer(scene, x, z, rotY, color) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(6, 2.6, 2.4),
    mat('container' + color, { map: ribbedTexture(color), roughness: 0.7, metalness: 0.12 }),
  );
  body.position.y = 1.3;
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);
  group.position.set(x, 0, z);
  group.rotation.y = rotY;
  scene.add(group);
  const c = Math.abs(Math.cos(rotY));
  const s = Math.abs(Math.sin(rotY));
  const hw = (6 * c + 2.4 * s) / 2;
  const hd = (6 * s + 2.4 * c) / 2;
  S.colliders.push({ x0: x - hw, z0: z - hd, x1: x + hw, z1: z + hd, y0: 0, y1: 2.6 });
}

// ---- the map ----
export function buildWorld(scene) {
  S.colliders.length = 0;
  scene.fog = new THREE.Fog(PALETTE.fog, 45, 110);

  // Sky dome: gradient canvas texture, back side. The same gradient lights
  // the scene as an environment map, so metals read instead of going black.
  const skyTex = skyTexture();
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(160, 24, 12),
    new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false }),
  );
  scene.add(dome);
  const envTex = skyTexture();
  envTex.mapping = THREE.EquirectangularReflectionMapping;
  scene.environment = envTex;

  // Sun + sky fill.
  const sun = new THREE.DirectionalLight(0xffd9a8, 2.4);
  sun.position.set(-30, 42, -18);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -40;
  sun.shadow.camera.right = 40;
  sun.shadow.camera.top = 40;
  sun.shadow.camera.bottom = -40;
  sun.shadow.camera.far = 120;
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0x8fa3c7, 0xb08a5e, 1.15));

  // Ground.
  const sand = sandTexture();
  sand.wrapS = sand.wrapT = THREE.RepeatWrapping;
  sand.repeat.set(10, 8);
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(220, 220),
    new THREE.MeshStandardMaterial({ map: sand, roughness: 1 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // Distant dunes outside the walls.
  const duneMat = mat('dune', { color: PALETTE.sandDark, roughness: 1 });
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const dune = new THREE.Mesh(new THREE.ConeGeometry(18 + rand() * 10, 7 + rand() * 5, 7), duneMat);
    dune.position.set(Math.cos(a) * 85, 0, Math.sin(a) * 85);
    dune.scale.y = 0.6;
    scene.add(dune);
  }

  const wallMat = mat('wall', { color: PALETTE.concrete, roughness: 0.95 });
  const wallDark = mat('wallDark', { color: PALETTE.concreteDark, roughness: 0.95 });
  const trimMat = mat('trim', { color: PALETTE.rustDark, roughness: 0.8 });

  // Perimeter walls.
  addBox(scene, -31, -23, 31, -22, 0, 4.2, wallMat);
  addBox(scene, -31, 22, 31, 23, 0, 4.2, wallMat);
  addBox(scene, -31, -22, -30, 22, 0, 4.2, wallMat);
  addBox(scene, 30, -22, 31, 22, 0, 4.2, wallMat);
  // Trim caps on the perimeter.
  addBox(scene, -31, -23, 31, -22, 4.2, 4.5, trimMat, false);
  addBox(scene, -31, 22, 31, 23, 4.2, 4.5, trimMat, false);

  // Mid divider with a central gap (the mid doors).
  addBox(scene, -1, -9, 1, -2.2, 0, 3.6, wallDark);
  addBox(scene, -1, 2.2, 1, 9, 0, 3.6, wallDark);
  addBox(scene, -1.4, -2.2, 1.4, 2.2, 3.2, 3.8, trimMat, false); // lintel over the gap

  // Corner blocks shaping the mid connectors.
  addBox(scene, -13, -9, -9, -5, 0, 3, wallMat);
  addBox(scene, -13, 5, -9, 9, 0, 3, wallMat);
  addBox(scene, 7, -9, 11, -5, 0, 3, wallMat);
  addBox(scene, 7, 5, 11, 9, 0, 3, wallMat);

  // Site A warehouse: walls with a west and a south entrance.
  addBox(scene, 12, -21, 27, -20, 0, 4, wallMat);
  addBox(scene, 26, -20, 27, -8, 0, 4, wallMat);
  addBox(scene, 12, -20, 13, -15.5, 0, 4, wallMat);
  addBox(scene, 12, -12.5, 13, -8, 0, 4, wallMat);
  addBox(scene, 13, -9, 16.5, -8, 0, 4, wallMat);
  addBox(scene, 19.5, -9, 26, -8, 0, 4, wallMat);
  addBox(scene, 13, -20, 26, -19, 2.8, 3.4, trimMat, false); // roof beam

  // Site B courtyard: low walls with west and north entrances.
  addBox(scene, 12, 20, 27, 21, 0, 2.6, wallMat);
  addBox(scene, 26, 8, 27, 20, 0, 2.6, wallMat);
  addBox(scene, 12, 8, 13, 12, 0, 2.6, wallMat);
  addBox(scene, 12, 15, 13, 20, 0, 2.6, wallMat);
  addBox(scene, 13, 8, 16.5, 9, 0, 2.6, wallMat);
  addBox(scene, 19.5, 8, 26, 9, 0, 2.6, wallMat);

  // B tunnel roof (south lane cover) — high, so it never blocks movement.
  // The tunnel walls stop short of the south boundary, leaving an exit gap.
  addBox(scene, -7, 15.5, 7, 18.5, 2.7, 3.0, wallDark, false);
  addBox(scene, -7, 15.5, -6.4, 18.5, 0, 2.7, wallMat);
  addBox(scene, 6.4, 15.5, 7, 18.5, 0, 2.7, wallMat);

  // Watchtower at mid-north: legs, platform, railing.
  for (const [lx, lz] of [[4, -13], [7, -13], [4, -10], [7, -10]]) {
    addBox(scene, lx - 0.18, lz - 0.18, lx + 0.18, lz + 0.18, 0, 3.4, wallDark);
  }
  addBox(scene, 3.6, -13.4, 7.4, -9.6, 3.4, 3.7, wallMat, false);
  addBox(scene, 3.6, -13.4, 7.4, -13.0, 3.7, 4.5, trimMat, false);

  // Containers and crates: cover with sightlines between them.
  addContainer(scene, -16, -14, 0.12, '#b5542c');
  addContainer(scene, -17, 17, -0.1, '#4a6b7a');
  addContainer(scene, 22, -18.5, 0.05, '#8a5a2c');
  addCrate(scene, -2.5, 1.6, 1.3, 0.2);
  addCrate(scene, 2.2, -1.2, 1.1, 0.5);
  addCrate(scene, -6.5, -19.2, 1.1, 0.1);
  addCrate(scene, 5, -19.5, 1.2, 0.4);
  addCrate(scene, -8, 19, 1.3, 0.3);
  addCrate(scene, 5, 19.5, 1.2, 0.0);
  addCrate(scene, 15, -18.5, 1.3, 0.2);
  addCrate(scene, 25, -13.5, 1.2, 0.6);
  addCrate(scene, 15, 18.5, 1.3, 0.1);
  addCrate(scene, 25, 13.5, 1.2, 0.4);
  addCrate(scene, -22.5, -6, 1.2, 0.3);
  addCrate(scene, -22.5, 6, 1.2, 0.0);
  addCrate(scene, 21, 2.5, 1.3, 0.2);
  addBarrel(scene, 13.5, -18.5, PALETTE.rust);
  addBarrel(scene, 24.5, -9.5, PALETTE.steel);
  addBarrel(scene, 13.5, 18.5, PALETTE.rust);
  addBarrel(scene, 24.5, 9.5, PALETTE.steel);
  addBarrel(scene, -4, 4, PALETTE.steel);

  // Site markers: floating letters + a painted zone ring on the ground.
  for (const site of S.sites) {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: letterTexture(site.id, site.id === 'A' ? '#e8a33d' : '#2fa8a0'),
      transparent: true, depthWrite: false,
    }));
    sprite.position.set(site.x, 5.2, site.z);
    sprite.scale.set(3.4, 3.4, 1);
    scene.add(sprite);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(site.radius - 0.35, site.radius, 40),
      new THREE.MeshBasicMaterial({ color: site.id === 'A' ? PALETTE.amber : PALETTE.teal, transparent: true, opacity: 0.55, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(site.x, 0.03, site.z);
    scene.add(ring);
  }

  // Spawn markers: low glowing pads.
  for (const [x, z, color] of [[-27, 0, PALETTE.teal], [27, 0, PALETTE.amber]]) {
    const pad = new THREE.Mesh(
      new THREE.CircleGeometry(2.2, 24),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.25 }),
    );
    pad.rotation.x = -Math.PI / 2;
    pad.position.set(x, 0.03, z);
    scene.add(pad);
  }
}

// ---- map data: sites, spawns, waypoints ----
export function initMapData() {
  S.sites = [
    { id: 'A', x: 19.5, z: -14, radius: 5.5 },
    { id: 'B', x: 19.5, z: 14, radius: 5.5 },
  ];
  S.spawns.van = [
    { x: -27, z: -2 }, { x: -27, z: 2 }, { x: -25, z: 0 },
  ];
  S.spawns.sen = [
    { x: 27, z: -3 }, { x: 27, z: 3 }, { x: 25, z: -1 }, { x: 25, z: 1 },
  ];
  // Waypoint graph: lanes, connectors, site approaches, hold spots. Every
  // edge is a straight walkable segment — no edge crosses a wall or a prop.
  const pts = [
    [-26, 0], [-20, 0], [-14, 0], [-8, 0], [-2, 0], [3, 0], [8, 0], [12, 0], // 0-7 mid
    [-20, -18], [-12, -18], [-4, -18], [4, -18], [10, -15.5], [14, -14], // 8-13 A long
    [19, -14], [22, -12], [16, -17], // 14-16 site A
    [-20, 14], [-12, 14], [-4, 14], [4, 14], [10, 14], [14, 14], // 17-22 B lane
    [19, 14], [22, 16], [16, 17], // 23-25 site B
    [-14, -12], [-8, -12], [-14, 12], [-8, 12], [9, -3.5], [9, 3.5], // 26-31 connectors
    [26, 0], [20, -6], [14, -4], [20, 6], [14, 4], // 32-36 sentinel side
    [-26, -10], [-26, 10], [24, -12], [24, 17], // 37-40 flank / hold spots
    [18, -6], [18, -11], [18, 6], [18, 11], // 41-44 site entrances
    [0, 17], [0, 19.2], // 45-46 B tunnel
  ];
  S.waypoints = pts.map(([x, z]) => ({ x, z }));
  const E = (a, b) => S.waypointEdges.push([a, b]);
  E(0, 1); E(1, 2); E(2, 3); E(3, 4); E(4, 5); E(5, 6); E(6, 7);
  E(1, 8); E(8, 9); E(9, 10); E(10, 11); E(11, 12); E(12, 13); E(13, 14);
  E(14, 15); E(14, 16); E(16, 39); E(39, 15);
  E(1, 17); E(17, 18); E(18, 19); E(19, 20); E(20, 21); E(21, 22); E(22, 23);
  E(23, 24); E(23, 25); E(25, 40); E(40, 24);
  E(2, 26); E(26, 27); E(27, 10); E(37, 26); E(0, 37); E(37, 8);
  E(2, 28); E(28, 29); E(29, 19); E(38, 28); E(0, 38); E(38, 17);
  E(6, 30); E(30, 34); E(34, 41); E(41, 42); E(42, 14); E(33, 41);
  E(6, 31); E(31, 36); E(36, 43); E(43, 44); E(44, 23); E(32, 35); E(35, 36);
  E(7, 32); E(32, 33); E(33, 34); E(7, 33);
  E(19, 45); E(45, 46); E(46, 20);
}

// BFS over the waypoint graph. Returns waypoint indices from start to goal.
const bfsPrev = new Int16Array(64);
const bfsQueue = new Int16Array(64);
export function findPath(startIdx, goalIdx) {
  bfsPrev.fill(-1);
  let head = 0;
  let tail = 0;
  bfsQueue[tail++] = startIdx;
  bfsPrev[startIdx] = startIdx;
  while (head < tail) {
    const cur = bfsQueue[head++];
    if (cur === goalIdx) break;
    for (const [a, b] of S.waypointEdges) {
      const next = a === cur ? b : b === cur ? a : -1;
      if (next !== -1 && bfsPrev[next] === -1) {
        bfsPrev[next] = cur;
        bfsQueue[tail++] = next;
      }
    }
  }
  if (bfsPrev[goalIdx] === -1) return [];
  const path = [];
  let cur = goalIdx;
  while (cur !== startIdx) {
    path.push(cur);
    cur = bfsPrev[cur];
  }
  path.reverse();
  return path;
}

export function nearestWaypoint(x, z) {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < S.waypoints.length; i++) {
    const dx = S.waypoints[i].x - x;
    const dz = S.waypoints[i].z - z;
    const d = dx * dx + dz * dz;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

// ---- collision & visibility queries ----
// Push a circle (XZ) out of every AABB it overlaps. Mutates pos.
export function collideCircle(pos, radius) {
  for (const c of S.colliders) {
    if (c.y0 > 1.2) continue; // high geometry never blocks feet
    const cx = Math.max(c.x0, Math.min(pos.x, c.x1));
    const cz = Math.max(c.z0, Math.min(pos.z, c.z1));
    const dx = pos.x - cx;
    const dz = pos.z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 >= radius * radius) continue;
    if (d2 > 1e-8) {
      const d = Math.sqrt(d2);
      const push = (radius - d) / d;
      pos.x += dx * push;
      pos.z += dz * push;
    } else {
      // Centre inside the box: push out along the smallest penetration axis.
      const pl = pos.x - c.x0 + radius;
      const pr = c.x1 - pos.x + radius;
      const pn = pos.z - c.z0 + radius;
      const pf = c.z1 - pos.z + radius;
      const m = Math.min(pl, pr, pn, pf);
      if (m === pl) pos.x = c.x0 - radius;
      else if (m === pr) pos.x = c.x1 + radius;
      else if (m === pn) pos.z = c.z0 - radius;
      else pos.z = c.z1 + radius;
    }
  }
  // Hard map bounds.
  pos.x = Math.max(-29.4, Math.min(29.4, pos.x));
  pos.z = Math.max(-21.4, Math.min(21.4, pos.z));
}

// Ray vs AABB (slab test). Returns distance or Infinity. Reuses no heap.
export function rayHitWall(ox, oy, oz, dx, dy, dz, maxDist) {
  let best = Infinity;
  for (const c of S.colliders) {
    let tmin = 0;
    let tmax = maxDist;
    // X slab
    if (Math.abs(dx) < 1e-9) {
      if (ox < c.x0 || ox > c.x1) continue;
    } else {
      let t1 = (c.x0 - ox) / dx;
      let t2 = (c.x1 - ox) / dx;
      if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) continue;
    }
    // Z slab
    if (Math.abs(dz) < 1e-9) {
      if (oz < c.z0 || oz > c.z1) continue;
    } else {
      let t1 = (c.z0 - oz) / dz;
      let t2 = (c.z1 - oz) / dz;
      if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) continue;
    }
    // Y slab
    if (Math.abs(dy) < 1e-9) {
      if (oy < c.y0 || oy > c.y1) continue;
    } else {
      let t1 = (c.y0 - oy) / dy;
      let t2 = (c.y1 - oy) / dy;
      if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) continue;
    }
    if (tmin < best) best = tmin;
  }
  // Ground plane.
  if (dy < -1e-9) {
    const t = -oy / dy;
    if (t > 0 && t < best && t <= maxDist) best = t;
  }
  return best;
}

export function lineOfSight(ax, ay, az, bx, by, bz) {
  tmpV.set(bx - ax, by - ay, bz - az);
  const dist = tmpV.length();
  if (dist < 1e-6) return true;
  tmpV.multiplyScalar(1 / dist);
  return rayHitWall(ax, ay, az, tmpV.x, tmpV.y, tmpV.z, dist - 0.05) === Infinity;
}

export function pointInSite(x, z) {
  for (const site of S.sites) {
    const dx = x - site.x;
    const dz = z - site.z;
    if (dx * dx + dz * dz <= site.radius * site.radius) return site;
  }
  return null;
}
