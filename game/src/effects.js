// Visual effects: tracer lines, impact sparks, muzzle flash and the bomb
// light. Tracers and particles live in fixed pools — the hot loop never
// allocates a mesh, a vector or a material.
import * as THREE from 'three';

const MAX_TRACERS = 24;
const MAX_PARTICLES = 160;

let scene = null;
const tracers = [];
const particles = [];
let tracerCursor = 0;
let particleCursor = 0;
const flashLight = new THREE.PointLight(0xffc46b, 0, 9, 2);
const flashMesh = new THREE.Mesh(
  new THREE.PlaneGeometry(0.5, 0.5),
  new THREE.MeshBasicMaterial({ color: 0xffd98a, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }),
);
let flashTime = 0;

const particleGeo = new THREE.BoxGeometry(0.06, 0.06, 0.06);
const sparkMat = new THREE.MeshBasicMaterial({ color: 0xffc46b });
const dustMat = new THREE.MeshBasicMaterial({ color: 0xc9a06b });
const bloodMat = new THREE.MeshBasicMaterial({ color: 0xa32b22 });

export function initEffects(targetScene) {
  scene = targetScene;
  const tracerGeo = new THREE.BufferGeometry();
  tracerGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
  for (let i = 0; i < MAX_TRACERS; i++) {
    const line = new THREE.Line(
      tracerGeo.clone(),
      new THREE.LineBasicMaterial({ color: 0xffe6a8, transparent: true, opacity: 0 }),
    );
    line.frustumCulled = false;
    line.visible = false;
    scene.add(line);
    tracers.push({ line, life: 0 });
  }
  for (let i = 0; i < MAX_PARTICLES; i++) {
    const mesh = new THREE.Mesh(particleGeo, sparkMat);
    mesh.visible = false;
    scene.add(mesh);
    particles.push({ mesh, life: 0, vel: new THREE.Vector3() });
  }
  flashLight.visible = false;
  scene.add(flashLight);
  flashMesh.visible = false;
  scene.add(flashMesh);
}

export function spawnTracer(from, to) {
  const t = tracers[tracerCursor];
  tracerCursor = (tracerCursor + 1) % MAX_TRACERS;
  const pos = t.line.geometry.getAttribute('position');
  pos.setXYZ(0, from.x, from.y, from.z);
  pos.setXYZ(1, to.x, to.y, to.z);
  pos.needsUpdate = true;
  t.life = 0.07;
  t.line.visible = true;
  t.line.material.opacity = 0.9;
}

export function spawnBurst(at, count, kind) {
  const material = kind === 'blood' ? bloodMat : kind === 'dust' ? dustMat : sparkMat;
  for (let n = 0; n < count; n++) {
    const p = particles[particleCursor];
    particleCursor = (particleCursor + 1) % MAX_PARTICLES;
    p.mesh.material = material;
    p.mesh.position.copy(at);
    p.vel.set((Math.random() - 0.5) * 3.4, Math.random() * 3.2, (Math.random() - 0.5) * 3.4);
    p.life = 0.35 + Math.random() * 0.25;
    p.mesh.visible = true;
    p.mesh.scale.setScalar(1);
  }
}

export function muzzleFlash(at, facing) {
  flashLight.position.copy(at);
  flashLight.intensity = 14;
  flashLight.visible = true;
  flashMesh.position.copy(at).addScaledVector(facing, 0.15);
  flashMesh.lookAt(at.x + facing.x, at.y + facing.y, at.z + facing.z);
  flashMesh.material.opacity = 0.95;
  flashMesh.visible = true;
  flashTime = 0.05;
}

export function stepEffects(dt) {
  for (const t of tracers) {
    if (t.life <= 0) continue;
    t.life -= dt;
    if (t.life <= 0) t.line.visible = false;
    else t.line.material.opacity = t.life / 0.07 * 0.9;
  }
  for (const p of particles) {
    if (p.life <= 0) continue;
    p.life -= dt;
    if (p.life <= 0) {
      p.mesh.visible = false;
      continue;
    }
    p.vel.y -= 9.5 * dt;
    p.mesh.position.addScaledVector(p.vel, dt);
    if (p.mesh.position.y < 0.03) p.mesh.position.y = 0.03;
    p.mesh.scale.setScalar(Math.max(0.2, p.life * 2.4));
  }
  if (flashTime > 0) {
    flashTime -= dt;
    if (flashTime <= 0) {
      flashLight.visible = false;
      flashMesh.visible = false;
    }
  }
}
