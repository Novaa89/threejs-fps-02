// Bot AI: waypoint routes, hold positions, vision and hearing, burst fire
// with reaction delay, bomb fetch / plant for attackers and defuse for
// defenders. Bots are plain state objects; their meshes are simple styled
// figures built from boxes, team-coloured, with a head sphere the combat
// code can hit.
import * as THREE from 'three';
import { CFG, TEAMS, WEAPONS, PALETTE } from './config.js';
import { S, pushEvent } from './state.js';
import { findPath, nearestWaypoint, collideCircle, lineOfSight, pointInSite } from './world.js';
import { fireHitscan } from './combat.js';
import { muzzleFlash } from './effects.js';
import { sfx } from './audio.js';
import { rand, randRange } from './rng.js';

const VAN_NAMES = ['Juno', 'Kestrel'];
const SEN_NAMES = ['Rook', 'Vex', 'Onyx', 'Sable'];
const VAN_ROUTES = [
  [8, 9, 10, 11, 12, 13, 14], // A long
  [2, 3, 4, 5, 6, 30, 34, 41, 42, 14], // mid to A
  [17, 18, 19, 20, 21, 22, 23], // B lane
];
const SEN_HOLDS = [15, 16, 24, 25];
const tmpDir = new THREE.Vector3();
const tmpEye = new THREE.Vector3();
const tmpTarget = new THREE.Vector3();
const tmpFacing = new THREE.Vector3();
const tmpFlat = new THREE.Vector3();

let scene = null;
let botId = 0;

function buildBotMesh(team) {
  const group = new THREE.Group();
  const torsoMat = new THREE.MeshStandardMaterial({
    color: team === TEAMS.VAN ? PALETTE.teal : PALETTE.rust, roughness: 0.7,
  });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x33383f, roughness: 0.8 });
  const skinMat = new THREE.MeshStandardMaterial({ color: 0xc9a184, roughness: 0.8 });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.62, 0.3), torsoMat);
  torso.position.y = 1.06;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.21, 12, 10), skinMat);
  head.position.y = 1.55;
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.23, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), darkMat);
  helmet.position.y = 1.57;
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.72, 0.22), darkMat);
  legL.position.set(-0.14, 0.36, 0);
  const legR = legL.clone();
  legR.position.x = 0.14;
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.55, 0.16), torsoMat);
  armL.position.set(-0.35, 1.05, 0.05);
  const armR = armL.clone();
  armR.position.x = 0.35;
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.6), darkMat);
  gun.position.set(0.28, 1.12, -0.35);
  for (const m of [torso, head, helmet, legL, legR, armL, armR, gun]) {
    m.castShadow = true;
    group.add(m);
  }
  group.userData = { legL, legR, armL, armR };
  return group;
}

function makeBot(team, name, spawn, weaponId) {
  const mesh = buildBotMesh(team);
  mesh.position.set(spawn.x, 0, spawn.z);
  scene.add(mesh);
  const bot = {
    id: botId++,
    team,
    name,
    pos: new THREE.Vector3(spawn.x, 0, spawn.z),
    yaw: team === TEAMS.VAN ? -Math.PI / 2 : Math.PI / 2,
    hp: 100,
    alive: true,
    mesh,
    weapon: weaponId,
    state: 'route',
    path: [],
    pathIdx: 0,
    holdNode: -1,
    holdYaw: 0,
    scanPhase: rand() * Math.PI * 2,
    target: null,
    reactTimer: 0,
    burstLeft: 0,
    shotTimer: 0,
    lastKnown: null,
    alertTimer: 0,
    strafeDir: 1,
    strafeTimer: 0,
    channelTimer: 0,
    walkPhase: 0,
    lastDamageFrom: null,
    hpAtChannelStart: 100,
  };
  return bot;
}

export function initBots(targetScene) {
  scene = targetScene;
}

export function spawnBots() {
  for (const bot of S.bots) scene.remove(bot.mesh);
  S.bots.length = 0;
  botId = 0;
  VAN_NAMES.forEach((name, i) => {
    const bot = makeBot(TEAMS.VAN, name, S.spawns.van[i + 1] || S.spawns.van[0], i === 0 ? 'rifle' : 'smg');
    bot.route = VAN_ROUTES[i % VAN_ROUTES.length];
    S.bots.push(bot);
  });
  SEN_NAMES.forEach((name, i) => {
    const bot = makeBot(TEAMS.SEN, name, S.spawns.sen[i], i % 2 === 0 ? 'rifle' : 'smg');
    bot.holdNode = SEN_HOLDS[i];
    bot.state = 'route';
    S.bots.push(bot);
  });
}

export function resetBotsForRound() {
  let vi = 0;
  let si = 0;
  for (const bot of S.bots) {
    const spawn = bot.team === TEAMS.VAN
      ? S.spawns.van[vi++ + 1] || S.spawns.van[0]
      : S.spawns.sen[si++];
    bot.pos.set(spawn.x, 0, spawn.z);
    bot.yaw = bot.team === TEAMS.VAN ? -Math.PI / 2 : Math.PI / 2;
    bot.hp = 100;
    bot.alive = true;
    bot.mesh.visible = true;
    bot.mesh.rotation.set(0, bot.yaw, 0);
    bot.mesh.position.copy(bot.pos);
    bot.state = 'route';
    bot.path = [];
    bot.pathIdx = 0;
    bot.target = null;
    bot.lastKnown = null;
    bot.alertTimer = 0;
    bot.channelTimer = 0;
    bot.burstLeft = 0;
    if (bot.team === TEAMS.VAN) bot.route = VAN_ROUTES[bot.id % VAN_ROUTES.length];
  }
}

function entityChest(e, out) {
  const crouch = e.crouch ? 0.75 : 1.05;
  out.set(e.pos.x, e.pos.y + crouch, e.pos.z);
  return out;
}

function canSee(bot, enemy) {
  tmpEye.set(bot.pos.x, bot.pos.y + 1.5, bot.pos.z);
  entityChest(enemy, tmpTarget);
  tmpDir.subVectors(tmpTarget, tmpEye);
  const dist = tmpDir.length();
  if (dist > CFG.botVisionRange) return false;
  tmpDir.multiplyScalar(1 / dist);
  tmpFacing.set(-Math.sin(bot.yaw), 0, -Math.cos(bot.yaw));
  tmpFlat.set(tmpDir.x, 0, tmpDir.z).normalize();
  if (tmpFacing.dot(tmpFlat) < Math.cos(CFG.botVisionHalfAngle)) return false;
  return lineOfSight(tmpEye.x, tmpEye.y, tmpEye.z, tmpTarget.x, tmpTarget.y, tmpTarget.z);
}

function perceive(bot, dt) {
  // Vision: nearest visible enemy becomes the target. Iterates the bots and
  // the player directly — no per-frame array.
  let nearest = null;
  let nearestD = Infinity;
  const consider = (enemy) => {
    const dx = enemy.pos.x - bot.pos.x;
    const dz = enemy.pos.z - bot.pos.z;
    const d = dx * dx + dz * dz;
    if (d < nearestD && canSee(bot, enemy)) {
      nearestD = d;
      nearest = enemy;
    }
  };
  for (const other of S.bots) {
    if (other.alive && other.team !== bot.team) consider(other);
  }
  if (S.player.alive && S.player.team !== bot.team) consider(S.player);
  if (nearest) {
    if (bot.target !== nearest) {
      bot.target = nearest;
      bot.reactTimer = randRange(0.3, 0.55);
    }
    if (!bot.lastKnown) bot.lastKnown = new THREE.Vector3();
    bot.lastKnown.copy(nearest.pos);
    bot.alertTimer = 3;
    if (bot.state !== 'engage') bot.state = 'engage';
    return;
  }
  // Lost sight: keep the last known position for a while, then give up.
  if (bot.target) {
    bot.alertTimer -= dt;
    if (bot.alertTimer <= 0) {
      bot.target = null;
      if (bot.state === 'engage') bot.state = bot.lastKnown ? 'investigate' : 'route';
    }
  }
  // Hearing: gunshots and explosions within range.
  for (const ev of S.events) {
    const dx = ev.x - bot.pos.x;
    const dz = ev.z - bot.pos.z;
    if (dx * dx + dz * dz > ev.radius * ev.radius) continue;
    if (!bot.lastKnown) bot.lastKnown = new THREE.Vector3();
    bot.lastKnown.set(ev.x, 0, ev.z);
    bot.alertTimer = 2.5;
    if (bot.state === 'hold' || bot.state === 'route') bot.state = 'investigate';
  }
}

function steerTo(bot, x, z, dt, speed) {
  const dx = x - bot.pos.x;
  const dz = z - bot.pos.z;
  const dist = Math.hypot(dx, dz);
  if (dist < 0.05) return true;
  const step = Math.min(dist, speed * dt);
  bot.pos.x += (dx / dist) * step;
  bot.pos.z += (dz / dist) * step;
  collideCircle(bot.pos, 0.38);
  // Separation from other bots.
  for (const other of S.bots) {
    if (other === bot || !other.alive) continue;
    const ox = bot.pos.x - other.pos.x;
    const oz = bot.pos.z - other.pos.z;
    const od = Math.hypot(ox, oz);
    if (od > 0.01 && od < 0.85) {
      bot.pos.x += (ox / od) * (0.85 - od) * 0.5;
      bot.pos.z += (oz / od) * (0.85 - od) * 0.5;
    }
  }
  const targetYaw = Math.atan2(-dx, -dz);
  bot.yaw = turnToward(bot.yaw, targetYaw, 6 * dt);
  bot.walkPhase += dt * 8;
  return dist < 1.1;
}

function turnToward(current, target, maxStep) {
  let diff = target - current;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  if (Math.abs(diff) <= maxStep) return target;
  return current + Math.sign(diff) * maxStep;
}

function followPath(bot, dt, speed) {
  if (bot.pathIdx >= bot.path.length) return true;
  const node = S.waypoints[bot.path[bot.pathIdx]];
  if (steerTo(bot, node.x, node.z, dt, speed)) bot.pathIdx++;
  return bot.pathIdx >= bot.path.length;
}

function setPathTo(bot, x, z) {
  const from = nearestWaypoint(bot.pos.x, bot.pos.z);
  const to = nearestWaypoint(x, z);
  bot.path = findPath(from, to);
  bot.pathIdx = 0;
}

function shootAt(bot, dt) {
  const target = bot.target;
  if (!target || !target.alive) return;
  entityChest(target, tmpTarget);
  const dx = tmpTarget.x - bot.pos.x;
  const dz = tmpTarget.z - bot.pos.z;
  bot.yaw = turnToward(bot.yaw, Math.atan2(-dx, -dz), 7 * dt);
  bot.reactTimer -= dt;
  if (bot.reactTimer > 0) return;
  bot.shotTimer -= dt;
  if (bot.shotTimer > 0) return;
  if (bot.burstLeft <= 0) {
    bot.burstLeft = 3 + Math.floor(rand() * 3);
    bot.shotTimer = randRange(0.25, 0.5);
    return;
  }
  bot.burstLeft -= 1;
  bot.shotTimer = WEAPONS[bot.weapon].interval * 1.6;
  // Aim error grows with distance and target speed.
  tmpEye.set(bot.pos.x, bot.pos.y + 1.5, bot.pos.z);
  tmpDir.subVectors(tmpTarget, tmpEye).normalize();
  const dist = tmpEye.distanceTo(tmpTarget);
  const err = 0.028 + dist * 0.0016;
  tmpDir.x += (rand() - 0.5) * 2 * err;
  tmpDir.y += (rand() - 0.5) * 2 * err;
  tmpDir.z += (rand() - 0.5) * 2 * err;
  tmpDir.normalize();
  fireHitscan(tmpEye, tmpDir, bot.weapon, bot.team, bot.name);
  muzzleFlash(tmpEye, tmpDir);
  const playerDist = tmpEye.distanceTo(S.player.pos);
  if (playerDist < 30) sfx.enemyShoot(playerDist);
  pushEvent('shot', bot.pos.x, bot.pos.z, CFG.botHearRange);
}

function stepBot(bot, dt) {
  if (!bot.alive) return;
  perceive(bot, dt);

  // Bomb logic overrides routing.
  if (S.bomb.state === 'planted' && bot.team === TEAMS.SEN) {
    if (bot.state !== 'defuse' && bot.state !== 'toBomb') {
      bot.state = 'toBomb';
      setPathTo(bot, S.bomb.pos.x, S.bomb.pos.z);
    }
  }
  if (S.bomb.state === 'dropped' && bot.team === TEAMS.VAN && !S.player.alive) {
    if (bot.state !== 'fetch' && bot.state !== 'plant' && S.bomb.carrier !== bot.name) {
      const othersFetching = S.bots.some((b) => b !== bot && b.alive && b.team === TEAMS.VAN && (b.state === 'fetch' || b.state === 'plant'));
      if (!othersFetching) {
        bot.state = 'fetch';
        setPathTo(bot, S.bomb.pos.x, S.bomb.pos.z);
      }
    }
  }

  switch (bot.state) {
    case 'engage': {
      // Strafe perpendicular to the target while shooting.
      bot.strafeTimer -= dt;
      if (bot.strafeTimer <= 0) {
        bot.strafeDir *= -1;
        bot.strafeTimer = randRange(0.7, 1.4);
      }
      if (bot.target) {
        const dx = bot.target.pos.x - bot.pos.x;
        const dz = bot.target.pos.z - bot.pos.z;
        const d = Math.hypot(dx, dz) || 1;
        const px = (-dz / d) * bot.strafeDir;
        const pz = (dx / d) * bot.strafeDir;
        const keep = d < 6 ? -0.6 : d > 20 ? 0.6 : 0;
        steerTo(bot, bot.pos.x + px * 2 + (dx / d) * keep, bot.pos.z + pz * 2 + (dz / d) * keep, dt, CFG.botSpeed * 0.55);
      }
      shootAt(bot, dt);
      break;
    }
    case 'investigate': {
      if (!bot.lastKnown) {
        bot.state = 'route';
        break;
      }
      if (bot.path.length === 0 || bot.pathIdx >= bot.path.length) setPathTo(bot, bot.lastKnown.x, bot.lastKnown.z);
      if (followPath(bot, dt, CFG.botSpeed)) {
        const arrived = steerTo(bot, bot.lastKnown.x, bot.lastKnown.z, dt, CFG.botSpeed);
        if (arrived) {
          bot.lastKnown = null;
          bot.state = bot.team === TEAMS.SEN ? 'route' : 'route';
          bot.path = [];
        }
      }
      break;
    }
    case 'hold': {
      // Scan the lane slowly, waiting.
      bot.scanPhase += dt * 0.5;
      bot.yaw = bot.holdYaw + Math.sin(bot.scanPhase) * 0.5;
      break;
    }
    case 'fetch': {
      if (S.bomb.state !== 'dropped') {
        bot.state = 'route';
        break;
      }
      if (bot.path.length === 0 || bot.pathIdx >= bot.path.length) setPathTo(bot, S.bomb.pos.x, S.bomb.pos.z);
      if (followPath(bot, dt, CFG.botSpeed)) {
        if (steerTo(bot, S.bomb.pos.x, S.bomb.pos.z, dt, CFG.botSpeed)) {
          S.bomb.state = 'carried';
          S.bomb.carrier = bot.name;
          bot.state = 'plant';
          const site = S.sites.reduce((a, b) => {
            const da = Math.hypot(a.x - bot.pos.x, a.z - bot.pos.z);
            const db = Math.hypot(b.x - bot.pos.x, b.z - bot.pos.z);
            return da < db ? a : b;
          });
          bot.plantSite = site;
          setPathTo(bot, site.x, site.z);
        }
      }
      break;
    }
    case 'plant': {
      const site = bot.plantSite;
      if (!site || S.bomb.state !== 'carried' || S.bomb.carrier !== bot.name) {
        bot.state = 'route';
        break;
      }
      if (bot.path.length === 0 || bot.pathIdx >= bot.path.length) setPathTo(bot, site.x, site.z);
      if (followPath(bot, dt, CFG.botSpeed) && steerTo(bot, site.x, site.z, dt, CFG.botSpeed)) {
        bot.channelTimer += dt;
        if (bot.channelTimer >= CFG.plantTime) {
          S.bomb.state = 'planted';
          S.bomb.site = site;
          S.bomb.pos.set(site.x, 0.25, site.z);
          S.bomb.timer = CFG.bombTime;
          S.bomb.defuseProgress = 0;
          S.bomb.defuser = null;
          S.banner = 'CHARGE PLANTED — defend it!';
          S.bannerTimer = 3;
          sfx.plant();
          bot.state = 'hold';
          bot.holdYaw = bot.yaw;
          bot.channelTimer = 0;
        }
      }
      break;
    }
    case 'toBomb': {
      if (S.bomb.state !== 'planted') {
        bot.state = 'route';
        break;
      }
      if (bot.path.length === 0 || bot.pathIdx >= bot.path.length) setPathTo(bot, S.bomb.pos.x, S.bomb.pos.z);
      if (followPath(bot, dt, CFG.botSpeed) && steerTo(bot, S.bomb.pos.x, S.bomb.pos.z, dt, CFG.botSpeed)) {
        // Only one bot defuses; the rest hold nearby.
        if (!S.bomb.defuser || S.bomb.defuser === bot.name) {
          bot.state = 'defuse';
          S.bomb.defuser = bot.name;
          bot.hpAtChannelStart = bot.hp;
        } else {
          bot.state = 'hold';
          bot.holdYaw = bot.yaw;
        }
      }
      break;
    }
    case 'defuse': {
      if (S.bomb.state !== 'planted') {
        bot.state = 'route';
        break;
      }
      if (bot.hp < bot.hpAtChannelStart) {
        // Taking fire breaks the defuse channel.
        bot.hpAtChannelStart = bot.hp;
        S.bomb.defuseProgress = Math.max(0, S.bomb.defuseProgress - 0.4);
      }
      S.bomb.defuseProgress += dt / CFG.defuseTime;
      if (S.bomb.defuseProgress >= 1) {
        S.bomb.state = 'defused';
        S.bomb.defuser = null;
      }
      break;
    }
    default: { // 'route'
      if (bot.team === TEAMS.SEN) {
        // Sentinels walk to their hold spot, then hold it.
        if (bot.path.length === 0) {
          const node = S.waypoints[bot.holdNode];
          setPathTo(bot, node.x, node.z);
        }
        if (followPath(bot, dt, CFG.botSpeed)) {
          const node = S.waypoints[bot.holdNode];
          if (steerTo(bot, node.x, node.z, dt, CFG.botSpeed)) {
            bot.state = 'hold';
            bot.holdYaw = Math.atan2(-(0 - bot.pos.x), -(0 - bot.pos.z));
          }
        }
      } else {
        // Vanguard teammates run their route toward the target site.
        if (bot.path.length === 0) {
          const route = bot.route;
          bot.path = route.slice();
          bot.pathIdx = 0;
        }
        if (followPath(bot, dt, CFG.botSpeed)) {
          bot.state = 'hold';
          bot.holdYaw = bot.yaw;
          const site = pointInSite(bot.pos.x, bot.pos.z);
          if (site && S.bomb.state === 'carried' && S.bomb.carrier === bot.name) {
            bot.state = 'plant';
            bot.plantSite = site;
          }
        }
      }
    }
  }
}

// Mesh sync runs in the render loop, not the fixed step, so meshes always
// match bot positions in every phase (buy, round end, staged shots).
export function syncBotMeshes() {
  for (const bot of S.bots) {
    bot.mesh.position.set(bot.pos.x, bot.alive ? bot.pos.y : 0.25, bot.pos.z);
    bot.mesh.rotation.y = bot.yaw;
    const swing = bot.alive ? Math.sin(bot.walkPhase) * 0.4 : 0;
    const ud = bot.mesh.userData;
    ud.legL.rotation.x = swing;
    ud.legR.rotation.x = -swing;
    ud.armL.rotation.x = -swing * 0.6;
    ud.armR.rotation.x = swing * 0.6;
  }
}

export function stepBots(dt) {
  for (const bot of S.bots) stepBot(bot, dt);
}
