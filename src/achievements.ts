// Data-driven achievement badges. Adding a new badge is a single array entry —
// each `earned` predicate reads the stored PlayerData and its derived PlayerStats.
import type { PlayerData } from "./types.ts";
import type { PlayerStats } from "./stats.ts";
import { MOVES } from "./game.ts";

export interface Achievement {
    id: string;
    label: string;
    emoji: string;
    description: string;
    earned: (data: PlayerData, stats: PlayerStats) => boolean;
}

export const ACHIEVEMENTS: Achievement[] = [
    {
        id: "first-win",
        label: "First Win",
        emoji: "🥇",
        description: "Win your first match",
        earned: (data) => data.wins >= 1,
    },
    {
        id: "played-10",
        label: "Regular",
        emoji: "🎮",
        description: "Play 10 matches",
        earned: (data) => data.totalGames >= 10,
    },
    {
        id: "streak-3",
        label: "On a Roll",
        emoji: "🔥",
        description: "Win 3 matches in a row",
        earned: (_data, stats) => stats.longestWinStreak >= 3,
    },
    {
        id: "streak-5",
        label: "Unstoppable",
        emoji: "⚡",
        description: "Win 5 matches in a row",
        earned: (_data, stats) => stats.longestWinStreak >= 5,
    },
    {
        id: "beat-human",
        label: "Human Hunter",
        emoji: "🤝",
        description: "Beat another player in multiplayer",
        earned: (_data, stats) => stats.byMode.multiplayer.wins >= 1,
    },
    {
        id: "all-moves-win",
        label: "Well Rounded",
        emoji: "♻️",
        description: "Win a round with every move",
        earned: (_data, stats) => MOVES.every(m => stats.movesWonWith[m] > 0),
    },
    {
        id: "comeback",
        label: "Comeback Kid",
        emoji: "🔄",
        description: "Win a match after losing the first round",
        earned: (_data, stats) => stats.comebackWins >= 1,
    },
];

export function evaluateAchievements(data: PlayerData, stats: PlayerStats): { achievement: Achievement; earned: boolean }[] {
    return ACHIEVEMENTS.map(achievement => ({ achievement, earned: achievement.earned(data, stats) }));
}
