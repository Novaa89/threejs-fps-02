// HUD: health, ammo, money, timer, score, kill feed, crosshair spread,
// plant/defuse bars, the buy menu, the minimap, and the start / pause /
// round / match overlays. Reads the state store; writes only the DOM.
import { CFG, WEAPONS, GRENADE, TEAMS } from './config.js';
import { S, PHASE } from './state.js';
import { buyItem } from './rounds.js';

const el = {};
let minimap = null;
let mapCtx = null;

export function initHud() {
  for (const id of ['hud', 'crosshair', 'hitmarker', 'health-num', 'health-bar', 'ammo-mag',
    'ammo-reserve', 'weapon-name', 'money', 'timer', 'score-van', 'score-sen', 'round-num',
    'killfeed', 'banner', 'bomb-status', 'plant-bar', 'plant-fill', 'plant-label',
    'buy-menu', 'overlay', 'overlay-title', 'overlay-copy', 'play', 'vignette',
    'grenade-count', 'charge-icon', 'spectate']) {
    el[id] = document.getElementById(id);
  }
  minimap = document.getElementById('minimap');
  mapCtx = minimap.getContext('2d');
  el['buy-menu'].addEventListener('click', (e) => {
    const button = e.target.closest('[data-buy]');
    if (!button) return;
    buyItem(button.dataset.buy);
  });
}

export function showOverlay(title, copy, buttonText) {
  el['overlay-title'].textContent = title;
  el['overlay-copy'].textContent = copy;
  el.play.textContent = buttonText;
  el.overlay.hidden = false;
}

export function hideOverlay() {
  el.overlay.hidden = true;
}

export function setBanner(text, seconds) {
  S.banner = text;
  S.bannerTimer = seconds;
}

function formatTime(seconds) {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function drawMinimap() {
  const g = mapCtx;
  const W = minimap.width;
  const H = minimap.height;
  g.clearRect(0, 0, W, H);
  g.fillStyle = 'rgba(20,22,26,0.72)';
  g.fillRect(0, 0, W, H);
  const px = (x) => ((x + 31) / 62) * W;
  const pz = (z) => ((z + 23) / 46) * H;
  g.fillStyle = 'rgba(233,230,223,0.55)';
  for (const c of S.colliders) {
    if (c.y1 < 2) continue;
    g.fillRect(px(c.x0), pz(c.z0), px(c.x1) - px(c.x0), pz(c.z1) - pz(c.z0));
  }
  for (const site of S.sites) {
    g.fillStyle = site.id === 'A' ? '#e8a33d' : '#2fa8a0';
    g.font = 'bold 11px system-ui, sans-serif';
    g.textAlign = 'center';
    g.fillText(site.id, px(site.x), pz(site.z) + 4);
  }
  // Teammates teal, spotted enemies amber, the player white with a facing tick.
  for (const bot of S.bots) {
    if (!bot.alive) continue;
    g.fillStyle = bot.team === TEAMS.VAN ? '#2fa8a0' : '#e8a33d';
    g.beginPath();
    g.arc(px(bot.pos.x), pz(bot.pos.z), 3, 0, Math.PI * 2);
    g.fill();
  }
  const p = S.player;
  g.fillStyle = '#ffffff';
  g.beginPath();
  g.arc(px(p.pos.x), pz(p.pos.z), 3.5, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = '#ffffff';
  g.beginPath();
  g.moveTo(px(p.pos.x), pz(p.pos.z));
  g.lineTo(px(p.pos.x) - Math.sin(p.yaw) * 8, pz(p.pos.z) - Math.cos(p.yaw) * 8);
  g.stroke();
}

export function stepHud(dt) {
  const p = S.player;
  // Health.
  el['health-num'].textContent = Math.max(0, p.hp);
  el['health-bar'].style.width = `${Math.max(0, p.hp)}%`;
  el['health-bar'].style.background = p.hp > 50 ? '#2fa8a0' : p.hp > 25 ? '#e8a33d' : '#c23b2e';
  // Ammo.
  if (p.current === 'grenade') {
    el['weapon-name'].textContent = GRENADE.name;
    el['ammo-mag'].textContent = p.grenades;
    el['ammo-reserve'].textContent = '';
  } else {
    const w = WEAPONS[p.current];
    el['weapon-name'].textContent = w.name;
    el['ammo-mag'].textContent = p.mags[p.current];
    el['ammo-reserve'].textContent = `/ ${p.reserves[p.current]}`;
  }
  el['grenade-count'].textContent = `◆ ${p.grenades}`;
  el.money.textContent = `$${S.money}`;
  el.timer.textContent = formatTime(S.roundTimer);
  el.timer.style.color = S.roundTimer <= 10 && S.phase === PHASE.LIVE ? '#e8a33d' : '';
  el['score-van'].textContent = S.scoreVan;
  el['score-sen'].textContent = S.scoreSen;
  el['round-num'].textContent = `ROUND ${S.round}`;
  el['charge-icon'].style.opacity = p.hasCharge ? '1' : '0.25';
  // Crosshair spread grows with bloom and movement.
  const spread = 6 + p.spreadBloom * 260 + Math.min(10, Math.hypot(p.vel.x, p.vel.z) * 1.4);
  el.crosshair.style.setProperty('--gap', `${spread.toFixed(1)}px`);
  // Hitmarker.
  el.hitmarker.classList.toggle('on', (p.hitmarkTimer || 0) > 0);
  el.hitmarker.classList.toggle('head', !!p.hitmarkHead);
  // Damage vignette.
  p.hurtFlash = Math.max(0, p.hurtFlash - dt * 1.8);
  el.vignette.style.opacity = p.hurtFlash > 0 ? (0.35 + p.hurtFlash * 0.45).toFixed(2) : '0';
  // Kill feed.
  const feedHtml = S.killfeed.map((line) => `<div>${line}</div>`).join('');
  if (el.killfeed.dataset.html !== feedHtml) {
    el.killfeed.dataset.html = feedHtml;
    el.killfeed.innerHTML = feedHtml;
  }
  // Banner.
  if (S.bannerTimer > 0) {
    S.bannerTimer -= dt;
    el.banner.textContent = S.banner;
    el.banner.hidden = false;
  } else {
    el.banner.hidden = true;
  }
  // Bomb status + plant progress.
  const bomb = S.bomb;
  if (bomb.state === 'planted') {
    el['bomb-status'].textContent = `CHARGE LIVE — ${formatTime(bomb.timer)}`;
    el['bomb-status'].hidden = false;
  } else if (bomb.state === 'dropped') {
    el['bomb-status'].textContent = 'CHARGE DROPPED';
    el['bomb-status'].hidden = false;
  } else {
    el['bomb-status'].hidden = true;
  }
  if (p.plantProgress > 0) {
    el['plant-bar'].hidden = false;
    el['plant-fill'].style.width = `${(p.plantProgress * 100).toFixed(0)}%`;
    el['plant-label'].textContent = 'PLANTING…';
  } else if (bomb.state === 'planted' && bomb.defuseProgress > 0) {
    el['plant-bar'].hidden = false;
    el['plant-fill'].style.width = `${(bomb.defuseProgress * 100).toFixed(0)}%`;
    el['plant-label'].textContent = 'DEFUSING…';
  } else {
    el['plant-bar'].hidden = true;
  }
  // Buy menu visibility + affordability.
  const showBuy = S.buyOpen && S.phase === PHASE.BUY && p.alive;
  el['buy-menu'].hidden = !showBuy;
  if (showBuy) {
    for (const button of el['buy-menu'].querySelectorAll('[data-buy]')) {
      const id = button.dataset.buy;
      const price = id === 'grenade' ? GRENADE.price : WEAPONS[id].price;
      const owned = id === 'grenade' ? p.grenades >= 2 : p.weapons.includes(id);
      button.disabled = owned || S.money < price;
      button.classList.toggle('owned', owned);
    }
    el['buy-menu'].querySelector('.buy-timer').textContent = `Buy phase — ${formatTime(CFG.buyTime - S.phaseTime)}`;
  }
  // Spectate label.
  el.spectate.hidden = p.alive;
  if (!p.alive && S.phase === PHASE.LIVE) {
    el.spectate.textContent = 'You are down — spectating a teammate';
  }
  drawMinimap();
}
