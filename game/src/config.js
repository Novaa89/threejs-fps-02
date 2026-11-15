// SANDLINE — tuning, palette and weapon definitions. One place for every number
// the rest of the game reads; nothing here imports anything else.
export const CFG = {
  simDt: 1 / 60,
  roundsToWin: 5,
  maxRounds: 9,
  buyTime: 12,
  roundTime: 100,
  bombTime: 35,
  plantTime: 3,
  defuseTime: 5,
  roundEndTime: 4,
  eyeHeight: 1.62,
  crouchHeight: 1.1,
  playerRadius: 0.38,
  walkSpeed: 4.6,
  crouchSpeed: 2.3,
  accel: 42,
  friction: 11,
  jumpSpeed: 4.9,
  gravity: 12.5,
  startMoney: 800,
  killReward: 300,
  winReward: 1400,
  lossReward: 900,
  plantReward: 300,
  botCount: { van: 2, sen: 4 },
  botSpeed: 4.2,
  botVisionRange: 42,
  botVisionHalfAngle: 1.05,
  botHearRange: 26,
  grenadeFuse: 2.5,
  grenadeRadius: 9,
  grenadeMaxDamage: 130,
};

// Dusk-desert palette: sand, rust, concrete, one teal and one amber accent.
export const PALETTE = {
  sky: 0x2e3a52,
  horizon: 0xe8a56b,
  fog: 0xd9a877,
  sand: 0xc9a06b,
  sandDark: 0xa8825a,
  concrete: 0x8a7f70,
  concreteDark: 0x6b6257,
  rust: 0xb5542c,
  rustDark: 0x8a3d1f,
  steel: 0x4a525c,
  teal: 0x2fa8a0,
  amber: 0xe8a33d,
  crate: 0x9c7a4e,
  crateDark: 0x7d5f3a,
  canvas: 0x14161a,
  ink: 0xe9e6df,
};

export const TEAMS = { VAN: 'vanguard', SEN: 'sentinel' };

// Weapons: damage is per body hit at close range; headshots multiply it.
// spread is radians of cone half-angle added per shot; moveSpread is added
// while moving, so stopping to aim pays. recoil kicks the aim up per shot.
export const WEAPONS = {
  pistol: {
    id: 'pistol', name: 'P9 Sidearm', price: 0, auto: false,
    damage: 26, headMult: 3.0, mag: 12, reserveMax: 48,
    interval: 0.16, reload: 1.4, spread: 0.006, moveSpread: 0.018,
    recoil: 0.011, falloffStart: 18, falloffEnd: 45, falloffMin: 0.6,
  },
  smg: {
    id: 'smg', name: 'K7 Ripper', price: 1400, auto: true,
    damage: 22, headMult: 3.0, mag: 30, reserveMax: 90,
    interval: 0.085, reload: 1.9, spread: 0.014, moveSpread: 0.026,
    recoil: 0.009, falloffStart: 14, falloffEnd: 38, falloffMin: 0.55,
  },
  rifle: {
    id: 'rifle', name: 'AR-4 Longshot', price: 2600, auto: true,
    damage: 34, headMult: 3.2, mag: 30, reserveMax: 90,
    interval: 0.11, reload: 2.2, spread: 0.004, moveSpread: 0.024,
    recoil: 0.013, falloffStart: 22, falloffEnd: 55, falloffMin: 0.65,
  },
};

export const GRENADE = {
  id: 'grenade', name: 'Sunder Frag', price: 300,
  fuse: CFG.grenadeFuse, radius: CFG.grenadeRadius, maxDamage: CFG.grenadeMaxDamage,
};
