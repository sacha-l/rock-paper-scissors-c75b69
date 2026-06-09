// Derived statistics computed purely from the stored PlayerData history.
// No new storage and no contract calls — everything folds over data.games[].
import type { Move, PlayerData } from "./types.ts";
import { MOVES } from "./game.ts";

export interface ModeRecord {
    games: number;
    wins: number;
    losses: number;
    draws: number;
}

export interface HeadToHead {
    opponent: string;
    games: number;
    wins: number;
    losses: number;
    draws: number;
}

export interface PlayerStats {
    currentWinStreak: number;
    longestWinStreak: number;
    moveCounts: Record<Move, number>;
    favoriteMove: Move | null;
    movesWonWith: Record<Move, number>;
    comebackWins: number;
    byMode: { solo: ModeRecord; multiplayer: ModeRecord };
    headToHead: HeadToHead[];
}

function emptyMode(): ModeRecord {
    return { games: 0, wins: 0, losses: 0, draws: 0 };
}

function tally(rec: ModeRecord, result: "win" | "loss" | "draw") {
    rec.games++;
    if (result === "win") rec.wins++;
    else if (result === "loss") rec.losses++;
    else rec.draws++;
}

export function computeStats(data: PlayerData): PlayerStats {
    const moveCounts = Object.fromEntries(MOVES.map(m => [m, 0])) as Record<Move, number>;
    const movesWonWith = Object.fromEntries(MOVES.map(m => [m, 0])) as Record<Move, number>;
    const byMode = { solo: emptyMode(), multiplayer: emptyMode() };
    const h2h = new Map<string, HeadToHead>();
    let comebackWins = 0;

    // data.games is chronological (appended in play order).
    for (const game of data.games) {
        tally(byMode[game.mode], game.result);

        for (const r of game.rounds) {
            moveCounts[r.playerMove]++;
            if (r.result === "win") movesWonWith[r.playerMove]++;
        }

        if (game.rounds.length > 0 && game.rounds[0].result === "loss" && game.result === "win") {
            comebackWins++;
        }

        if (game.mode === "multiplayer") {
            const key = game.opponent || "unknown";
            const entry = h2h.get(key) ?? { opponent: key, games: 0, wins: 0, losses: 0, draws: 0 };
            tally(entry, game.result);
            h2h.set(key, entry);
        }
    }

    // Win streaks over match results (chronological).
    let longestWinStreak = 0;
    let run = 0;
    for (const game of data.games) {
        if (game.result === "win") { run++; longestWinStreak = Math.max(longestWinStreak, run); }
        else run = 0;
    }
    // Current streak: consecutive wins counting back from the most recent match.
    let currentWinStreak = 0;
    for (let i = data.games.length - 1; i >= 0; i--) {
        if (data.games[i].result === "win") currentWinStreak++;
        else break;
    }

    let favoriteMove: Move | null = null;
    let favCount = 0;
    for (const m of MOVES) {
        if (moveCounts[m] > favCount) { favCount = moveCounts[m]; favoriteMove = m; }
    }

    return {
        currentWinStreak,
        longestWinStreak,
        moveCounts,
        favoriteMove,
        movesWonWith,
        comebackWins,
        byMode,
        headToHead: [...h2h.values()].sort((a, b) => b.games - a.games),
    };
}
