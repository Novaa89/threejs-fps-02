// Player weapons: firing with spread and recoil, reloads, switching,
// grenade throws, and the first-person viewmodel. Bots shoot through
// combat.fireHitscan directly with their own aim error.
import * as THREE from 'three';
import { CFG, WEAPONS, GRENADE } from './config.js';
import { S, pushEvent } from './state.js';
import { input, consumePress } from './input.js';
import { fireHitscan, explodeGrenade } from './combat.js';
import { muzzleFlash } from './effects.js';
import { sfx } from './audio.js';

const forward = new THREE.Vector3();
const muzzle = new THREE.Vector3();
const right = new THREE.Vector3();
const up = new THREE.Vector3(0, 1, 0);
const tmpDir = new THREE.Vector3();

let camera = null;
let scene = null;
let viewmodel = null;
let grenadeMesh = null;
let prevFiring = false;
let bobTime = 0;
const grenadeGeo = new THREE.SphereGeometry(0.11, 10, 8);
const grenadeMat = new THREE.MeshStandardMaterial({ color: 0x3d4a35, roughness: 0.6, metalness: 0.3 });

function buildViewmodel() {
  const group = new THREE.Group();
  const dark = new THREE.MeshStandardMaterial({ color: 0x4a525c, roughness: 0.45, metalness: 0.25 });
  const grip = new THREE.MeshStandardMaterial({ color: 0x5a4630, roughness: 0.8 });
  const accent = new THREE.MeshStandardMaterial({ color: 0x2fa8a0, roughness: 0.4, metalness: 0.3 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 0.44), dark);
  body.position.set(0, 0, -0.08);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.26, 10), dark);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.02, -0.38);
  const mag = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.14, 0.09), grip);
  mag.position.set(0, -0.11, -0.04);
  mag.rotation.x = 0.15;
  const stock = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.2), grip);
  stock.position.set(0, -0.02, 0.2);
  const sight = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.045, 0.05), accent);
  sight.position.set(0, 0.07, -0.24);
  group.add(body, barrel, mag, stock, sight);
  group.position.set(0.24, -0.2, -0.45);
  return group;
}

export function initWeapons(targetScene, targetCamera) {
  scene = targetScene;
  camera = targetCamera;
  viewmodel = buildViewmodel();
  camera.add(viewmodel);
  grenadeMesh = new THREE.Mesh(grenadeGeo, grenadeMat);
  grenadeMesh.position.set(0.24, -0.2, -0.45);
  grenadeMesh.visible = false;
  camera.add(grenadeMesh);
}

function eyePos(out) {
  const p = S.player;
  out.set(p.pos.x, p.pos.y + (p.crouch ? CFG.crouchHeight : CFG.eyeHeight), p.pos.z);
  return out;
}

function aimDir(out, spread) {
  const p = S.player;
  const pitch = p.pitch + p.recoilPitch;
  out.set(
    -Math.sin(p.yaw) * Math.cos(pitch),
    Math.sin(pitch),
    -Math.cos(p.yaw) * Math.cos(pitch),
  );
  if (spread > 0) {
    right.crossVectors(out, up).normalize();
    const rx = (Math.random() - 0.5) * 2 * spread;
    const ry = (Math.random() - 0.5) * 2 * spread;
    out.addScaledVector(right, rx);
    out.y += ry;
    out.normalize();
  }
  return out;
}

export function currentWeapon() {
  return WEAPONS[S.player.current];
}

function startReload() {
  const p = S.player;
  const w = currentWeapon();
  if (p.reloading > 0 || p.mags[p.current] >= w.mag || p.reserves[p.current] <= 0) return;
  p.reloading = w.reload;
  sfx.reload();
}

function throwGrenade() {
  const p = S.player;
  if (p.grenades <= 0) return;
  p.grenades -= 1;
  aimDir(forward, 0);
  const mesh = new THREE.Mesh(grenadeGeo, grenadeMat);
  mesh.position.copy(eyePos(muzzle)).addScaledVector(forward, 0.5);
  scene.add(mesh);
  S.grenades.push({
    pos: mesh.position.clone(),
    vel: forward.clone().multiplyScalar(13).add(new THREE.Vector3(0, 3.2, 0)),
    fuse: GRENADE.fuse,
    team: p.team,
    thrower: 'You',
    mesh,
  });
  sfx.step();
}

function fireOnce() {
  const p = S.player;
  const w = currentWeapon();
  if (p.mags[p.current] <= 0) {
    sfx.dryFire();
    startReload();
    return;
  }
  p.mags[p.current] -= 1;
  p.fireCooldown = w.interval;
  const speed = Math.hypot(p.vel.x, p.vel.z);
  const moveFactor = Math.min(1, speed / CFG.walkSpeed);
  const spread = w.spread + p.spreadBloom + w.moveSpread * moveFactor * (p.crouch ? 0.4 : 1);
  aimDir(tmpDir, spread);
  const origin = eyePos(muzzle);
  const result = fireHitscan(origin, tmpDir, w.id, p.team, 'You');
  if (result.hit) {
    sfx.hit(result.head);
    p.hitmarkTimer = result.head ? 0.25 : 0.15;
    p.hitmarkHead = result.head;
  }
  p.spreadBloom = Math.min(0.05, p.spreadBloom + w.spread * 1.6);
  p.recoilPitch += w.recoil;
  p.yaw += (Math.random() - 0.5) * w.recoil * 0.5;
  muzzleFlash(origin.clone().addScaledVector(tmpDir, 0.9), tmpDir);
  sfx.shoot(w.id === 'pistol' ? 1.2 : 1);
  pushEvent('shot', p.pos.x, p.pos.z, CFG.botHearRange);
}

export function stepWeapons(dt) {
  const p = S.player;
  if (!p.alive) return;
  p.fireCooldown = Math.max(0, p.fireCooldown - dt);
  p.spreadBloom = Math.max(0, p.spreadBloom - dt * 0.06);
  p.recoilPitch = Math.max(0, p.recoilPitch - dt * 0.09);
  if (p.hitmarkTimer > 0) p.hitmarkTimer -= dt;

  if (p.reloading > 0) {
    p.reloading -= dt;
    if (p.reloading <= 0) {
      const w = currentWeapon();
      const need = w.mag - p.mags[p.current];
      const take = Math.min(need, p.reserves[p.current]);
      p.mags[p.current] += take;
      p.reserves[p.current] -= take;
    }
    return;
  }

  if (consumePress('KeyR')) startReload();
  if (consumePress('KeyG')) throwGrenade();
  if (consumePress('Digit1') && p.weapons.includes('pistol')) p.current = 'pistol';
  if (consumePress('Digit2') && p.weapons.includes('smg')) p.current = 'smg';
  if (consumePress('Digit3') && p.weapons.includes('rifle')) p.current = 'rifle';
  if (consumePress('Digit4')) p.current = p.grenades > 0 ? 'grenade' : p.current;

  if (p.current === 'grenade') {
    if (input.firing && !prevFiring) {
      throwGrenade();
      p.current = p.weapons.includes('rifle') ? 'rifle' : p.weapons.includes('smg') ? 'smg' : 'pistol';
    }
  } else {
    const w = currentWeapon();
    const trigger = w.auto ? input.firing : input.firing && !prevFiring;
    if (trigger && p.fireCooldown <= 0 && input.locked) fireOnce();
    if (input.firing && p.mags[p.current] <= 0 && p.fireCooldown <= 0 && !w.auto && !prevFiring) {
      sfx.dryFire();
      startReload();
    }
  }
  prevFiring = input.firing;
}

// Drop every live grenade and remove its mesh (match restart).
export function clearGrenades() {
  for (const g of S.grenades) scene.remove(g.mesh);
  S.grenades.length = 0;
}

// Grenade flight: gravity, axis-separated bounce off walls and the ground.
export function stepGrenades(dt) {
  for (let i = S.grenades.length - 1; i >= 0; i--) {
    const g = S.grenades[i];
    g.fuse -= dt;
    g.vel.y -= CFG.gravity * dt;
    const step = tmpDir.copy(g.vel).multiplyScalar(dt);
    // X axis
    g.pos.x += step.x;
    if (wallOverlap(g.pos, 0.11)) {
      g.pos.x -= step.x;
      g.vel.x *= -0.45;
      sfx.bounce();
    }
    g.pos.z += step.z;
    if (wallOverlap(g.pos, 0.11)) {
      g.pos.z -= step.z;
      g.vel.z *= -0.45;
      sfx.bounce();
    }
    g.pos.y += step.y;
    if (g.pos.y < 0.11) {
      g.pos.y = 0.11;
      g.vel.y *= -0.45;
      g.vel.x *= 0.7;
      g.vel.z *= 0.7;
      if (Math.abs(g.vel.y) > 1.5) sfx.bounce();
    }
    g.mesh.position.copy(g.pos);
    if (g.fuse <= 0) {
      scene.remove(g.mesh);
      S.grenades.splice(i, 1);
      explodeGrenade(g.pos, g.team, g.thrower);
      sfx.explosion();
      pushEvent('explosion', g.pos.x, g.pos.z, 40);
    }
  }
}

function wallOverlap(pos, r) {
  for (const c of S.colliders) {
    if (pos.y + r < c.y0 || pos.y - r > c.y1) continue;
    if (pos.x + r > c.x0 && pos.x - r < c.x1 && pos.z + r > c.z0 && pos.z - r < c.z1) return true;
  }
  return false;
}

export function updateViewmodel(dt, moving) {
  if (!viewmodel) return;
  const p = S.player;
  const showGrenade = p.current === 'grenade';
  viewmodel.visible = p.alive && !showGrenade;
  grenadeMesh.visible = p.alive && showGrenade;
  if (!p.alive) return;
  bobTime += dt * (moving ? 9 : 2);
  const bob = moving ? 0.008 : 0.002;
  const kick = p.recoilPitch * 1.4;
  viewmodel.position.set(
    0.24,
    -0.2 + Math.sin(bobTime) * bob - kick * 0.25,
    -0.45 + kick * 0.55,
  );
  viewmodel.rotation.x = kick * 2.2;
  grenadeMesh.position.set(0.24, -0.2 + Math.sin(bobTime) * bob, -0.45);
}

export function giveWeapon(id) {
  const p = S.player;
  const w = WEAPONS[id];
  if (!p.weapons.includes(id)) p.weapons.push(id);
  p.mags[id] = w.mag;
  p.reserves[id] = w.reserveMax;
  p.current = id;
}

export function refillAmmo() {
  const p = S.player;
  for (const id of p.weapons) {
    const w = WEAPONS[id];
    p.mags[id] = w.mag;
    p.reserves[id] = w.reserveMax;
  }
}
