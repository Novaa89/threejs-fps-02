// Keyboard + mouse + pointer lock. Keeps the current input state in one
// object the sim reads each step; edge-triggered presses are queued and
// consumed once per step so no click is ever lost between frames.
export const input = {
  keys: new Set(),
  lookDX: 0,
  lookDY: 0,
  firing: false,
  pressed: new Set(),
  locked: false,
  enabled: false, // false while menus hold the pointer
};

let canvas = null;
let onLockChange = null;

export function initInput(targetCanvas, lockChangeCallback) {
  canvas = targetCanvas;
  onLockChange = lockChangeCallback;
  document.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    input.keys.add(e.code);
    input.pressed.add(e.code);
    if (['Space', 'Tab'].includes(e.code)) e.preventDefault();
  });
  document.addEventListener('keyup', (e) => input.keys.delete(e.code));
  document.addEventListener('mousemove', (e) => {
    if (!input.locked) return;
    input.lookDX += e.movementX;
    input.lookDY += e.movementY;
  });
  document.addEventListener('mousedown', (e) => {
    if (e.button === 0) input.firing = true;
  });
  document.addEventListener('mouseup', (e) => {
    if (e.button === 0) input.firing = false;
  });
  document.addEventListener('pointerlockchange', () => {
    input.locked = document.pointerLockElement === canvas;
    if (onLockChange) onLockChange(input.locked);
  });
  window.addEventListener('blur', () => {
    input.keys.clear();
    input.firing = false;
  });
}

export function requestLock() {
  if (canvas && document.pointerLockElement !== canvas) {
    canvas.requestPointerLock();
  }
}

export function releaseLock() {
  if (document.pointerLockElement) document.exitPointerLock();
}

export function consumePress(code) {
  if (input.pressed.has(code)) {
    input.pressed.delete(code);
    return true;
  }
  return false;
}

export function endStep() {
  input.lookDX = 0;
  input.lookDY = 0;
  input.pressed.clear();
}
