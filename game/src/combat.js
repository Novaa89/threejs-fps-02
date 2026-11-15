// Hitscan combat: ray tests against bodies and walls, headshot multipliers,
// damage falloff, deaths, and grenade blasts. All ray math is closed-form
// against spheres and boxes — no three.js Raycaster, no allocation.
import * as THREE from 'three';
import { CFG, WEAPONS } from './config.js';
import { S, pushKillfeed } from './state.js';
import { rayHitWall, lineOfSight } from './world.js';
import { spawnTracer, spawnBurst } from './effects.js';
import { sfx } from './audio.js';

const tmpHit = new THREE.Vector3();

// Ray vs sphere. Returns distance or Infinity.
function raySphere(ox, oy, oz, dx, dy, dz, cx, cy, cz, r) {
  const lx = cx - ox;
  const ly = cy - oy;
  const lz = cz - oz;
  const tca = lx * dx + ly * dy + lz * dz;
  if (tca < 0) return Infinity;
  const d2 = lx * lx + ly * ly + lz * lz - tca * tca;
  const r2 = r * r;
  if (d2 > r2) return Infinity;
  const thc = Math.sqrt(r2 - d2);
  const t = tca - thc;
  return t > 0 ? t : Infinity;
}

// Ray vs axis-aligned box. Returns distance or Infinity.
function rayBox(ox, oy, oz, dx, dy, dz, x0, y0, z0, x1, y1, z1) {
  let tmin = 0;
  let tmax = Infinity;
  const axes = [[ox, dx, x0, x1], [oy, dy, y0, y1], [oz, dz, z0, z1]];
  for (const [o, d, lo, hi] of axes) {
    if (Math.abs(d) < 1e-9) {
      if (o < lo || o > hi) return Infinity;
    } else {
      let t1 = (lo - o) / d;
      let t2 = (hi - o) / d;
      if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return Infinity;
    }
  }
  return tmin;
}

function falloff(weapon, dist) {
  if (dist <= weapon.falloffStart) return 1;
  if (dist >= weapon.falloffEnd) return weapon.falloffMin;
  const f = (dist - weapon.falloffStart) / (weapon.falloffEnd - weapon.falloffStart);
  return 1 - f * (1 - weapon.falloffMin);
}

// Fire one hitscan shot. shooterTeam avoids friendly fire. Returns hit info.
export function fireHitscan(origin, dir, weaponId, shooterTeam, shooterName) {
  const weapon = WEAPONS[weaponId];
  const wallDist = rayHitWall(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, 80);
  let bestDist = wallDist;
  let bestBot = null;
  let bestHead = false;

  for (const bot of S.bots) {
    if (!bot.alive || bot.team === shooterTeam) continue;
    const headDist = raySphere(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z,
      bot.pos.x, bot.pos.y + 1.55, bot.pos.z, 0.24);
    if (headDist < bestDist) {
      bestDist = headDist;
      bestBot = bot;
      bestHead = true;
      continue;
    }
    const bodyDist = rayBox(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z,
      bot.pos.x - 0.34, bot.pos.y, bot.pos.z - 0.34,
      bot.pos.x + 0.34, bot.pos.y + 1.38, bot.pos.z + 0.34);
    if (bodyDist < bestDist) {
      bestDist = bodyDist;
      bestBot = bot;
      bestHead = false;
    }
  }

  // The player, when the shooter is a bot.
  let hitPlayer = false;
  if (shooterTeam !== S.player.team && S.player.alive) {
    const p = S.player;
    const eyeY = p.pos.y + (p.crouch ? CFG.crouchHeight : CFG.eyeHeight);
    const headDist = raySphere(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z,
      p.pos.x, eyeY - 0.1, p.pos.z, 0.24);
    const bodyTop = p.crouch ? 0.95 : 1.38;
    const bodyDist = rayBox(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z,
      p.pos.x - 0.34, p.pos.y, p.pos.z - 0.34,
      p.pos.x + 0.34, p.pos.y + bodyTop, p.pos.z + 0.34);
    const playerDist = Math.min(headDist, bodyDist);
    if (playerDist < bestDist) {
      bestDist = playerDist;
      bestBot = null;
      bestHead = headDist <= bodyDist;
      hitPlayer = true;
    }
  }

  tmpHit.copy(origin).addScaledVector(dir, Math.min(bestDist, 80));
  spawnTracer(origin, tmpHit);

  if (bestBot) {
    const dmg = Math.round(weapon.damage * falloff(weapon, bestDist) * (bestHead ? weapon.headMult : 1));
    spawnBurst(tmpHit, bestHead ? 8 : 5, 'blood');
    damageBot(bestBot, dmg, bestHead, shooterName, shooterTeam);
    return { hit: true, head: bestHead, dist: bestDist, victim: bestBot };
  }
  if (hitPlayer) {
    const dmg = Math.round(weapon.damage * falloff(weapon, bestDist) * (bestHead ? weapon.headMult : 1));
    spawnBurst(tmpHit, 5, 'blood');
    damagePlayer(dmg, shooterName);
    return { hit: true, head: bestHead, dist: bestDist, victim: 'player' };
  }
  if (wallDist < 80) spawnBurst(tmpHit, 3, wallDist < 79 ? 'spark' : 'dust');
  return { hit: false, head: false, dist: bestDist, victim: null };
}

export function damageBot(bot, dmg, head, attackerName, attackerTeam) {
  if (!bot.alive) return;
  bot.hp -= dmg;
  bot.lastDamageFrom = attackerName;
  bot.alertTimer = 2;
  if (bot.hp <= 0) {
    bot.hp = 0;
    bot.alive = false;
    if (bot.mesh) {
      bot.mesh.rotation.z = Math.PI / 2 * (bot.id % 2 === 0 ? 1 : -1);
      bot.mesh.position.y = 0.25;
    }
    pushKillfeed(`${attackerName} ▸ ${bot.name}${head ? ' (headshot)' : ''}`);
    if (attackerTeam === S.player.team) {
      S.money += CFG.killReward;
      if (attackerName === 'You') S.kills += 1;
    }
    // A dead carrier drops the charge where he fell.
    if (S.bomb.state === 'carried' && S.bomb.carrier === bot.name) {
      S.bomb.state = 'dropped';
      S.bomb.carrier = null;
      S.bomb.pos.copy(bot.pos);
      S.bomb.pos.y = 0.3;
    }
  }
}

export function damagePlayer(dmg, attackerName) {
  const p = S.player;
  if (!p.alive || S.staging) return;
  p.hp -= dmg;
  p.hurtFlash = 1;
  sfx.hurt();
  if (p.hp <= 0) {
    p.hp = 0;
    p.alive = false;
    p.diedThisRound = true;
    S.deaths += 1;
    pushKillfeed(`${attackerName} ▸ You`);
    if (S.bomb.state === 'carried' && S.bomb.carrier === 'player') {
      S.bomb.state = 'dropped';
      S.bomb.carrier = null;
      S.bomb.pos.copy(p.pos);
      S.bomb.pos.y = 0.3;
    }
  }
}

// Grenade blast: radial falloff, blocked by walls (line of sight from the
// blast centre to the victim's chest).
export function explodeGrenade(pos, throwerTeam, throwerName) {
  const r = CFG.grenadeRadius;
  spawnBurst(pos, 26, 'spark');
  spawnBurst(pos, 14, 'dust');
  const victims = [];
  for (const bot of S.bots) {
    if (!bot.alive || bot.team === throwerTeam) continue;
    victims.push(bot);
  }
  for (const bot of victims) {
    const dx = bot.pos.x - pos.x;
    const dy = bot.pos.y + 0.9 - pos.y;
    const dz = bot.pos.z - pos.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (dist > r) continue;
    if (!lineOfSight(pos.x, pos.y, pos.z, bot.pos.x, bot.pos.y + 0.9, bot.pos.z)) continue;
    const dmg = Math.round(CFG.grenadeMaxDamage * (1 - (dist / r) * 0.85));
    damageBot(bot, Math.max(8, dmg), false, throwerName, throwerTeam);
  }
  if (throwerTeam !== S.player.team && S.player.alive) {
    const p = S.player;
    const dx = p.pos.x - pos.x;
    const dy = p.pos.y + 0.9 - pos.y;
    const dz = p.pos.z - pos.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (dist <= r && lineOfSight(pos.x, pos.y, pos.z, p.pos.x, p.pos.y + 0.9, p.pos.z)) {
      damagePlayer(Math.max(8, Math.round(CFG.grenadeMaxDamage * (1 - (dist / r) * 0.85))), throwerName);
    }
  }
}
