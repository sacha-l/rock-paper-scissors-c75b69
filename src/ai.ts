// Computer opponent strategies for solo play.
import type { Move } from "./types.ts";
import { MOVES, BEATS, randomMove } from "./game.ts";

export type Difficulty = "easy" | "hard";

// Returns a move that beats `target` (the first counter found in the BEATS table).
// Falls back to a random move if nothing beats it (shouldn't happen in standard RPS).
function counterTo(target: Move): Move {
    const counter = MOVES.find(m => BEATS[m].includes(target));
    return counter ?? randomMove();
}

// "hard" predicts the player's most-frequent past move and plays its counter.
// "easy" (and an empty history) is pure random.
export function nextMove(history: Move[], difficulty: Difficulty): Move {
    if (difficulty === "easy" || history.length === 0) return randomMove();

    const counts = new Map<Move, number>();
    for (const m of history) counts.set(m, (counts.get(m) ?? 0) + 1);

    let predicted: Move = history[history.length - 1];
    let best = -1;
    for (const m of MOVES) {
        const c = counts.get(m) ?? 0;
        if (c > best) { best = c; predicted = m; }
    }
    return counterTo(predicted);
}
