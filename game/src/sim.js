// Fixed-step simulation: one step advances the whole game by CFG.simDt.
// Rendering never touches game state; the loop in main.js calls stepGame
// from an accumulator and renders the result.
import { PHASE, S } from './state.js';
import { stepPlayer } from './player.js';
import { stepWeapons, stepGrenades } from './weapons.js';
import { stepBots } from './bots.js';
import { stepRounds } from './rounds.js';
import { stepEffects } from './effects.js';
import { endStep } from './input.js';

export function stepGame(dt) {
  S.time += dt;
  if (S.paused || S.phase === PHASE.MENU || S.phase === PHASE.MATCH_END) {
    stepEffects(dt);
    endStep();
    return;
  }
  stepPlayer(dt);
  stepWeapons(dt);
  stepGrenades(dt);
  stepBots(dt);
  stepRounds(dt);
  stepEffects(dt);
  // Events are consumed by bot perception during the step; clear them so a
  // gunshot is heard once, the step after it fires.
  S.events.length = 0;
  endStep();
}
