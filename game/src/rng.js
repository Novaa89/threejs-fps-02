// Seeded RNG (mulberry32) so staged screenshots and bot behaviour are
// reproducible from a ?seed= query. One instance, shared by the whole game.
let seed = 1;

export function setSeed(value) {
  seed = (value >>> 0) || 1;
}

export function rand() {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function randRange(min, max) {
  return min + rand() * (max - min);
}

export function pick(array) {
  return array[Math.floor(rand() * array.length)];
}
