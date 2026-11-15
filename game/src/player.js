// Player controller: mouse look with sensitivity and pitch clamp,
// acceleration-based WASD movement with friction, crouch, jump, map
// collision, and the bomb plant channel.
import * as THREE from 'three';
import { CFG } from './config.js';
import { S, PHASE } from './state.js';
import { input, consumePress } from './input.js';
import { collideCircle, pointInSite } from './world.js';
import { sfx } from './audio.js';

const wishDir = new THREE.Vector3();
const fwd = new THREE.Vector3();
const strafe = new THREE.Vector3();

const LOOK_SENS = 0.0022;

export function stepPlayer(dt) {
  const p = S.player;
  if (!p.alive) return;

  // Look.
  if (input.locked) {
    p.yaw -= input.lookDX * LOOK_SENS;
    p.pitch -= input.lookDY * LOOK_SENS;
    p.pitch = Math.max(-1.45, Math.min(1.45, p.pitch));
  }

  p.crouch = input.keys.has('ControlLeft') || input.keys.has('ControlRight') || input.keys.has('KeyC');

  // Wish direction from keys, in yaw space.
  fwd.set(-Math.sin(p.yaw), 0, -Math.cos(p.yaw));
  strafe.set(-fwd.z, 0, fwd.x);
  wishDir.set(0, 0, 0);
  if (input.keys.has('KeyW')) wishDir.add(fwd);
  if (input.keys.has('KeyS')) wishDir.sub(fwd);
  if (input.keys.has('KeyD')) wishDir.add(strafe);
  if (input.keys.has('KeyA')) wishDir.sub(strafe);
  const moving = wishDir.lengthSq() > 0;
  if (moving) wishDir.normalize();

  const maxSpeed = p.crouch ? CFG.crouchSpeed : CFG.walkSpeed;
  if (moving) {
    p.vel.x += wishDir.x * CFG.accel * dt;
    p.vel.z += wishDir.z * CFG.accel * dt;
    const speed = Math.hypot(p.vel.x, p.vel.z);
    if (speed > maxSpeed) {
      p.vel.x *= maxSpeed / speed;
      p.vel.z *= maxSpeed / speed;
    }
  } else {
    const damp = Math.max(0, 1 - CFG.friction * dt);
    p.vel.x *= damp;
    p.vel.z *= damp;
    if (Math.hypot(p.vel.x, p.vel.z) < 0.05) {
      p.vel.x = 0;
      p.vel.z = 0;
    }
  }

  // Jump + gravity.
  if (consumePress('Space') && p.grounded) {
    p.vel.y = CFG.jumpSpeed;
    p.grounded = false;
  }
  p.vel.y -= CFG.gravity * dt;
  p.pos.y += p.vel.y * dt;
  if (p.pos.y <= 0) {
    p.pos.y = 0;
    p.vel.y = 0;
    p.grounded = true;
  }

  // Horizontal move with map collision.
  p.pos.x += p.vel.x * dt;
  p.pos.z += p.vel.z * dt;
  collideCircle(p.pos, CFG.playerRadius);

  // Footstep sounds while moving on the ground.
  if (moving && p.grounded) {
    p.stepTimer = (p.stepTimer || 0) - dt;
    if (p.stepTimer <= 0) {
      p.stepTimer = p.crouch ? 0.55 : 0.38;
      sfx.step();
    }
  }

  stepPlant(dt);
}

// Hold E inside a site to plant the charge.
function stepPlant(dt) {
  const p = S.player;
  const bomb = S.bomb;
  const site = pointInSite(p.pos.x, p.pos.z);
  const canPlant = S.phase === PHASE.LIVE && p.hasCharge && bomb.state === 'carried'
    && bomb.carrier === 'player' && site && input.keys.has('KeyE');
  if (canPlant) {
    p.plantProgress += dt / CFG.plantTime;
    if (p.plantProgress >= 1) {
      p.plantProgress = 0;
      bomb.state = 'planted';
      bomb.site = site;
      bomb.pos.set(site.x, 0.25, site.z);
      bomb.timer = CFG.bombTime;
      bomb.defuseProgress = 0;
      bomb.defuser = null;
      p.hasCharge = false;
      S.money += CFG.plantReward;
      S.banner = 'CHARGE PLANTED — defend it!';
      S.bannerTimer = 3;
      sfx.plant();
    }
  } else {
    p.plantProgress = Math.max(0, p.plantProgress - dt * 2);
  }
  if (bomb.state === 'planted') S.roundTimer = Math.min(S.roundTimer, bomb.timer);
}

export function playerEyeHeight() {
  return S.player.crouch ? CFG.crouchHeight : CFG.eyeHeight;
}
