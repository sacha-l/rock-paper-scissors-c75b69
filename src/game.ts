// Single source of truth for the game's rules, moves, and presentation.
// Adding a variant (e.g. Rock-Paper-Scissors-Lizard-Spock) is a data edit here:
// extend MOVES / MOVE_EMOJI / MOVE_LABEL and the BEATS table — no logic changes.

import type { Move, RoundResult } from "./types.ts";

export const MOVES: Move[] = ["rock", "paper", "scissors"];

export const MOVE_EMOJI: Record<Move, string> = {
    rock: "✊",
    paper: "✋",
    scissors: "✂️",
};

export const MOVE_LABEL: Record<Move, string> = {
    rock: "Rock",
    paper: "Paper",
    scissors: "Scissors",
};

// BEATS[a] lists the moves that `a` defeats.
export const BEATS: Record<Move, Move[]> = {
    rock: ["scissors"],
    paper: ["rock"],
    scissors: ["paper"],
};

export function determineWinner(player: Move, opponent: Move): RoundResult {
    if (player === opponent) return "draw";
    return BEATS[player].includes(opponent) ? "win" : "loss";
}

export function pointsForResult(result: RoundResult): number {
    if (result === "win") return 2;
    if (result === "loss") return -1;
    return 0;
}

export function randomMove(): Move {
    return MOVES[Math.floor(Math.random() * MOVES.length)];
}

// Match-length options for the Best-of-N selector. Wins needed = ceil(N/2).
export const BEST_OF_OPTIONS = [1, 3, 5] as const;
export const DEFAULT_BEST_OF = 3;

export function matchNeeded(bestOf: number): number {
    return Math.ceil(bestOf / 2);
}

// True once a match is decided: someone reached the needed wins, or all rounds played.
export function isMatchOver(playerWins: number, opponentWins: number, roundsPlayed: number, bestOf: number): boolean {
    const needed = matchNeeded(bestOf);
    return playerWins >= needed || opponentWins >= needed || roundsPlayed >= bestOf;
}
