// The single state store. Every module reads and writes this one object;
// nothing else keeps game state. Entities are plain objects with preallocated
// Vector3s so the hot loop never allocates.
import * as THREE from 'three';
import { CFG, TEAMS } from './config.js';

export const PHASE = {
  MENU: 'menu',
  BUY: 'buy',
  LIVE: 'live',
  ROUND_END: 'roundEnd',
  MATCH_END: 'matchEnd',
};

export const S = {
  phase: PHASE.MENU,
  time: 0,
  phaseTime: 0,
  round: 1,
  scoreVan: 0,
  scoreSen: 0,
  money: CFG.startMoney,
  kills: 0,
  deaths: 0,
  roundTimer: CFG.roundTime,
  buyOpen: false,
  paused: false,
  staging: false, // true for ?shot= demo renders: the player cannot die
  lastKillMessage: '',
  // The player entity. pos is feet position; yaw/pitch are the look angles.
  player: {
    team: TEAMS.VAN,
    name: 'You',
    pos: new THREE.Vector3(),
    vel: new THREE.Vector3(),
    yaw: 0,
    pitch: 0,
    hp: 100,
    alive: true,
    crouch: false,
    grounded: true,
    hasCharge: true,
    weapons: ['pistol'],
    current: 'pistol',
    mags: { pistol: 12, smg: 0, rifle: 0 },
    reserves: { pistol: 48, smg: 0, rifle: 0 },
    grenades: 0,
    reloading: 0,
    fireCooldown: 0,
    spreadBloom: 0,
    recoilPitch: 0,
    plantProgress: 0,
    hurtFlash: 0,
    hitmarkTimer: 0,
    hitmarkHead: false,
    stepTimer: 0,
    diedThisRound: false,
  },
  bots: [],
  grenades: [],
  // Bomb state: 'carried' | 'dropped' | 'planted' | 'exploded' | 'defused'.
  bomb: {
    state: 'carried',
    carrier: 'player',
    site: null,
    pos: new THREE.Vector3(),
    timer: 0,
    defuseProgress: 0,
    defuser: null,
    beepTimer: 0,
  },
  // World data, filled by world.js: colliders, waypoints, sites, spawns.
  colliders: [],
  waypoints: [],
  waypointEdges: [],
  sites: [],
  spawns: { van: [], sen: [] },
  // Fired events the sim consumes once per step: {kind, x, z, radius}.
  events: [],
  killfeed: [],
  banner: '',
  bannerTimer: 0,
};

export function resetMatch() {
  S.phase = PHASE.MENU;
  S.time = 0;
  S.phaseTime = 0;
  S.round = 1;
  S.scoreVan = 0;
  S.scoreSen = 0;
  S.money = CFG.startMoney;
  S.kills = 0;
  S.deaths = 0;
  // Note: S.bots and S.grenades are NOT emptied here — their meshes live in
  // the scene, so only spawnBots()/clearGrenades() may drop them, after
  // removing the meshes. Emptying the arrays first would orphan meshes.
  S.events.length = 0;
  S.killfeed.length = 0;
  const p = S.player;
  p.hp = 100;
  p.alive = true;
  p.weapons = ['pistol'];
  p.current = 'pistol';
  p.mags = { pistol: 12, smg: 0, rifle: 0 };
  p.reserves = { pistol: 48, smg: 0, rifle: 0 };
  p.grenades = 0;
  p.hasCharge = true;
  p.diedThisRound = false;
  p.spreadBloom = 0;
  p.recoilPitch = 0;
  S.bomb.state = 'carried';
  S.bomb.carrier = 'player';
  S.bomb.site = null;
  S.bomb.timer = 0;
  S.bomb.defuseProgress = 0;
  S.bomb.defuser = null;
}

export function pushEvent(kind, x, z, radius) {
  if (S.events.length < 32) S.events.push({ kind, x, z, radius });
}

export function pushKillfeed(text) {
  S.killfeed.unshift(text);
  if (S.killfeed.length > 5) S.killfeed.length = 5;
}
