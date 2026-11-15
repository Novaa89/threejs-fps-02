// SANDLINE — a round-based tactical FPS. Boots the renderer, builds the
// world, runs the fixed-step loop, and owns the camera. Staged screenshots
// (?shot=start|play|buy|site|end) drive the game's own code into a scene and
// render it, with no pointer lock, so the shots are real renders.
import * as THREE from 'three';
import { CFG, TEAMS } from './config.js';
import { S, PHASE, resetMatch } from './state.js';
import { setSeed } from './rng.js';
import { initMapData, buildWorld } from './world.js';
import { initInput, requestLock, releaseLock } from './input.js';
import { initAudio, resumeAudio } from './audio.js';
import { initEffects } from './effects.js';
import { initWeapons, updateViewmodel, clearGrenades } from './weapons.js';
import { initBots, spawnBots, syncBotMeshes } from './bots.js';
import { initBombVisuals, startRound } from './rounds.js';
import { initHud, showOverlay, hideOverlay, stepHud } from './hud.js';
import { stepGame } from './sim.js';
import { playerEyeHeight } from './player.js';

const params = new URLSearchParams(location.search);
const shotMode = params.get('shot');
const staging = !!shotMode;
setSeed(Number(params.get('seed') || 7));

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x2e3a52);
const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.05, 300);
scene.add(camera);

initMapData();
buildWorld(scene);
initEffects(scene);
initWeapons(scene, camera);
initBots(scene);
spawnBots();
initBombVisuals(scene, THREE);
initHud();
initAudio();

let playing = false;

function beginMatch() {
  resetMatch();
  clearGrenades();
  spawnBots();
  startRound();
  playing = true;
}

function onLockChange(locked) {
  if (staging) return;
  if (!locked && playing && (S.phase === PHASE.BUY || S.phase === PHASE.LIVE)) {
    S.paused = true;
    showOverlay('Paused', 'The round is waiting. Click below to jump back in.', 'Resume');
  }
}

initInput(renderer.domElement, onLockChange);

document.getElementById('play').addEventListener('click', () => {
  resumeAudio();
  hideOverlay();
  if (!playing) beginMatch();
  S.paused = false;
  requestLock();
});

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// Buy menu toggle during the buy phase.
addEventListener('keydown', (e) => {
  if (e.code === 'KeyB' && S.phase === PHASE.BUY && S.player.alive) {
    S.buyOpen = !S.buyOpen;
    if (S.buyOpen) releaseLock();
    else requestLock();
  }
});

// ---- staged screenshots: the game's own code, posed by query ----
function stageShot(mode) {
  S.staging = true;
  beginMatch();
  const p = S.player;
  if (mode === 'start') {
    S.phase = PHASE.MENU;
    p.pos.set(-24, 0, 0);
    p.yaw = -Math.PI / 2;
    p.pitch = 0;
    showOverlay('SANDLINE', 'A round-based tactical FPS. Plant the charge or eliminate the Sentinels — first to 5 rounds takes the match.', 'Click to play');
    return;
  }
  if (mode === 'play') {
    S.phase = PHASE.LIVE;
    S.phaseTime = 0;
    S.buyOpen = false;
    S.roundTimer = 78;
    p.weapons = ['pistol', 'rifle'];
    p.current = 'rifle';
    p.mags = { pistol: 12, smg: 0, rifle: 27 };
    p.reserves = { pistol: 48, smg: 0, rifle: 90 };
    p.pos.set(-7, 0, -1);
    p.yaw = -Math.PI / 2 + 0.12;
    p.pitch = 0.01;
    // Two defenders holding mid, in view down the lane.
    const sens = S.bots.filter((b) => b.team === TEAMS.SEN);
    sens[0].pos.set(7, 0, -2.5);
    sens[0].state = 'hold';
    sens[0].holdYaw = Math.PI / 2;
    sens[1].pos.set(10, 0, 2);
    sens[1].state = 'hold';
    sens[1].holdYaw = Math.PI / 2;
    const vans = S.bots.filter((b) => b.team === TEAMS.VAN);
    vans[0].pos.set(-10, 0, 3);
    hideOverlay();
  } else if (mode === 'buy') {
    S.phase = PHASE.BUY;
    S.phaseTime = 2;
    S.buyOpen = true;
    S.money = 3200;
    p.pos.set(-26, 0, 0);
    p.yaw = -Math.PI / 2;
    // Teammates step aside so the spawn view stays open.
    const vans = S.bots.filter((b) => b.team === TEAMS.VAN);
    vans[0].pos.set(-28, 0, -4);
    vans[1].pos.set(-28, 0, 4);
    hideOverlay();
  } else if (mode === 'site') {
    // The charge is planted at site A; the player defends the site.
    S.phase = PHASE.LIVE;
    S.phaseTime = 0;
    S.buyOpen = false;
    S.roundTimer = 28;
    p.weapons = ['pistol', 'rifle'];
    p.current = 'rifle';
    p.mags = { pistol: 12, smg: 0, rifle: 30 };
    p.reserves = { pistol: 48, smg: 0, rifle: 90 };
    p.hasCharge = false;
    S.bomb.state = 'planted';
    S.bomb.site = S.sites[0];
    S.bomb.pos.set(S.sites[0].x, 0.25, S.sites[0].z);
    S.bomb.timer = 28;
    p.pos.set(10.5, 0, -14);
    p.yaw = -Math.PI / 2;
    p.pitch = -0.02;
    const sens = S.bots.filter((b) => b.team === TEAMS.SEN);
    sens[0].pos.set(23, 0, -16);
    sens[0].state = 'hold';
    sens[0].holdYaw = -Math.PI / 2;
    hideOverlay();
  } else if (mode === 'end') {
    S.phase = PHASE.ROUND_END;
    S.phaseTime = 0.5;
    S.scoreVan = 3;
    S.scoreSen = 2;
    S.banner = 'ROUND WON — enemy team eliminated';
    S.bannerTimer = 999;
    p.weapons = ['pistol', 'rifle'];
    p.current = 'rifle';
    p.mags = { pistol: 12, smg: 0, rifle: 24 };
    p.reserves = { pistol: 48, smg: 0, rifle: 90 };
    p.pos.set(-4, 0, 0);
    p.yaw = -Math.PI / 2;
    const vans = S.bots.filter((b) => b.team === TEAMS.VAN);
    vans[0].pos.set(-2, 0, 3);
    hideOverlay();
  }
  S.paused = false;
  playing = true;
}

if (staging) {
  stageShot(shotMode);
} else {
  showOverlay('SANDLINE', 'A round-based tactical FPS. Plant the charge or eliminate the Sentinels — first to 5 rounds takes the match.', 'Click to play');
}

// ---- camera ----
const camPos = new THREE.Vector3();
function updateCamera(dt) {
  const p = S.player;
  if (S.phase === PHASE.MENU && !staging) {
    // Slow orbit over the yard behind the start panel.
    const t = S.time * 0.08;
    camPos.set(Math.cos(t) * 26, 15, Math.sin(t) * 26);
    camera.position.copy(camPos);
    camera.lookAt(0, 0, 0);
    return;
  }
  const spectating = !p.alive && S.phase === PHASE.LIVE;
  let mate = null;
  if (spectating) {
    // Spectate the first living teammate; hide their mesh so the camera is
    // not inside their head and gun.
    mate = S.bots.find((b) => b.alive && b.team === TEAMS.VAN);
  }
  for (const bot of S.bots) {
    bot.mesh.visible = !bot.alive || bot !== mate;
  }
  if (mate) {
    camera.position.set(mate.pos.x, mate.pos.y + 1.55, mate.pos.z);
    camera.rotation.set(0, mate.yaw, 0, 'YXZ');
    return;
  }
  camera.position.set(p.pos.x, p.pos.y + playerEyeHeight(), p.pos.z);
  camera.rotation.set(p.pitch + p.recoilPitch * 0.4, p.yaw, 0, 'YXZ');
}

// ---- fixed-step loop ----
let last = performance.now();
let accumulator = 0;
const MAX_STEPS = 4;

function frame(now) {
  requestAnimationFrame(frame);
  const frameDt = Math.min(0.1, (now - last) / 1000);
  last = now;
  accumulator += frameDt;
  let steps = 0;
  while (accumulator >= CFG.simDt && steps < MAX_STEPS) {
    stepGame(CFG.simDt);
    accumulator -= CFG.simDt;
    steps++;
  }
  if (steps === MAX_STEPS) accumulator = 0;
  const moving = Math.hypot(S.player.vel.x, S.player.vel.z) > 0.5;
  updateViewmodel(frameDt, moving);
  updateCamera(frameDt);
  syncBotMeshes();
  stepHud(frameDt);
  renderer.render(scene, camera);
}

requestAnimationFrame(frame);
