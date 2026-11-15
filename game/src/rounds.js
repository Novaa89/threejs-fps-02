// Round flow: buy phase, live round, bomb timer, win/loss resolution, money
// awards, and the match end. The round is won by eliminating the enemy team,
// by the charge exploding (attackers), by a defuse (defenders), or by the
// clock (defenders) when the charge never goes off.
import { CFG, TEAMS, WEAPONS, GRENADE } from './config.js';
import { S, PHASE, pushKillfeed } from './state.js';
import { resetBotsForRound } from './bots.js';
import { refillAmmo } from './weapons.js';
import { sfx } from './audio.js';

let bombMesh = null;
let bombLight = null;

export function initBombVisuals(scene, THREE) {
  bombMesh = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.45, 0.3, 0.3),
    new THREE.MeshStandardMaterial({ color: 0x2b2f36, roughness: 0.5, metalness: 0.5 }),
  );
  const light = new THREE.Mesh(
    new THREE.BoxGeometry(0.1, 0.1, 0.05),
    new THREE.MeshBasicMaterial({ color: 0xff3b30 }),
  );
  light.position.set(0.12, 0.08, 0.16);
  bombMesh.add(body, light);
  bombMesh.visible = false;
  scene.add(bombMesh);
  bombLight = new THREE.PointLight(0xff3b30, 0, 6, 2);
  scene.add(bombLight);
}

export function startRound() {
  const p = S.player;
  // Loadout: survivors keep their guns; the dead restart with a pistol.
  if (p.diedThisRound) {
    p.weapons = ['pistol'];
    p.current = 'pistol';
    p.mags = { pistol: 12, smg: 0, rifle: 0 };
    p.reserves = { pistol: 48, smg: 0, rifle: 0 };
    p.grenades = 0;
    p.diedThisRound = false;
  } else {
    refillAmmo();
  }
  const spawn = S.spawns.van[0];
  p.pos.set(spawn.x, 0, spawn.z);
  p.vel.set(0, 0, 0);
  p.yaw = -Math.PI / 2;
  p.pitch = 0;
  p.hp = 100;
  p.alive = true;
  p.plantProgress = 0;
  p.reloading = 0;
  p.spreadBloom = 0;
  p.recoilPitch = 0;
  p.hasCharge = true;
  p.hurtFlash = 0;
  S.bomb.state = 'carried';
  S.bomb.carrier = 'player';
  S.bomb.site = null;
  S.bomb.timer = 0;
  S.bomb.defuseProgress = 0;
  S.bomb.defuser = null;
  S.roundTimer = CFG.roundTime;
  S.phase = PHASE.BUY;
  S.phaseTime = 0;
  S.buyOpen = true;
  resetBotsForRound();
  S.banner = `ROUND ${S.round}`;
  S.bannerTimer = 2.5;
}

export function endRound(winnerTeam, reason) {
  if (S.phase === PHASE.ROUND_END || S.phase === PHASE.MATCH_END) return;
  if (winnerTeam === TEAMS.VAN) {
    S.scoreVan += 1;
    S.money += CFG.winReward;
    S.banner = `ROUND WON — ${reason}`;
    sfx.win();
  } else {
    S.scoreSen += 1;
    S.money += CFG.lossReward;
    S.banner = `ROUND LOST — ${reason}`;
    sfx.lose();
  }
  pushKillfeed(S.banner);
  S.bannerTimer = 3.5;
  S.phase = PHASE.ROUND_END;
  S.phaseTime = 0;
  S.buyOpen = false;
  if (bombMesh) bombMesh.visible = false;
  if (bombLight) bombLight.intensity = 0;
}

function aliveCount(team) {
  let n = 0;
  if (team === TEAMS.VAN && S.player.alive) n++;
  for (const bot of S.bots) if (bot.alive && bot.team === team) n++;
  return n;
}

export function buyItem(id) {
  const p = S.player;
  if (S.phase !== PHASE.BUY) return false;
  if (id === 'grenade') {
    if (p.grenades >= 2 || S.money < GRENADE.price) return false;
    S.money -= GRENADE.price;
    p.grenades += 1;
    sfx.buy();
    return true;
  }
  const w = WEAPONS[id];
  if (!w || p.weapons.includes(id) || S.money < w.price) return false;
  S.money -= w.price;
  if (!p.weapons.includes(id)) p.weapons.push(id);
  p.mags[id] = w.mag;
  p.reserves[id] = w.reserveMax;
  p.current = id;
  sfx.buy();
  return true;
}

export function stepRounds(dt) {
  S.phaseTime += dt;
  const bomb = S.bomb;

  // Bomb visuals + beeps while planted.
  if (bombMesh) {
    const show = bomb.state === 'planted' || bomb.state === 'dropped';
    bombMesh.visible = show;
    if (show) {
      bombMesh.position.copy(bomb.pos);
      bombLight.position.copy(bomb.pos).y += 0.6;
      bombLight.intensity = bomb.state === 'planted' ? 2 + Math.sin(S.time * 8) * 1.5 : 0;
    } else {
      bombLight.intensity = 0;
    }
  }

  if (S.phase === PHASE.BUY) {
    S.roundTimer = CFG.roundTime;
    if (S.phaseTime >= CFG.buyTime) {
      S.phase = PHASE.LIVE;
      S.phaseTime = 0;
      S.buyOpen = false;
    }
    return;
  }

  if (S.phase === PHASE.ROUND_END) {
    if (S.phaseTime >= CFG.roundEndTime) {
      if (S.scoreVan >= CFG.roundsToWin || S.scoreSen >= CFG.roundsToWin || S.round >= CFG.maxRounds) {
        S.phase = PHASE.MATCH_END;
        S.phaseTime = 0;
        S.banner = S.scoreVan > S.scoreSen ? 'MATCH WON' : S.scoreSen > S.scoreVan ? 'MATCH LOST' : 'MATCH DRAW';
        S.bannerTimer = 999;
      } else {
        S.round += 1;
        startRound();
      }
    }
    return;
  }

  if (S.phase !== PHASE.LIVE) return;

  // Clock.
  S.roundTimer -= dt;
  if (bomb.state === 'planted') {
    bomb.timer -= dt;
    S.roundTimer = Math.max(0, bomb.timer);
    bomb.beepTimer -= dt;
    if (bomb.beepTimer <= 0) {
      bomb.beepTimer = bomb.timer < 10 ? 0.25 : 0.6;
      sfx.beep();
    }
    if (bomb.timer <= 0) {
      bomb.state = 'exploded';
      sfx.explosion();
      endRound(TEAMS.VAN, 'the charge detonated');
      return;
    }
    if (bomb.state === 'defused') {
      endRound(TEAMS.SEN, 'the charge was defused');
      return;
    }
  } else if (S.roundTimer <= 0) {
    endRound(TEAMS.SEN, 'time expired');
    return;
  }
  if (bomb.state === 'defused') {
    endRound(TEAMS.SEN, 'the charge was defused');
    return;
  }

  // Elimination.
  const vanAlive = aliveCount(TEAMS.VAN);
  const senAlive = aliveCount(TEAMS.SEN);
  if (senAlive === 0) {
    endRound(TEAMS.VAN, bomb.state === 'planted' ? 'site cleared' : 'enemy team eliminated');
    return;
  }
  if (vanAlive === 0 && bomb.state !== 'planted') {
    endRound(TEAMS.SEN, 'your team was eliminated');
  }
}
