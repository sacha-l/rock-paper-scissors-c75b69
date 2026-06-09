import type { PlayerData } from "../types.ts";
import { MOVE_EMOJI } from "../game.ts";
import { computeStats } from "../stats.ts";
import { evaluateAchievements } from "../achievements.ts";
import { short } from "../utils.ts";

// Shared stats + achievements view, derived entirely from stored PlayerData.
export default function StatsPanel({ data }: { data: PlayerData }) {
    const stats = computeStats(data);
    const badges = evaluateAchievements(data, stats);
    const earnedCount = badges.filter(b => b.earned).length;

    return (
        <div className="stats-panel">
            <div className="stats-row">
                <div className="stat-card">
                    <div className="stat-value">{stats.currentWinStreak}</div>
                    <div className="stat-label">Win Streak</div>
                </div>
                <div className="stat-card">
                    <div className="stat-value">{stats.longestWinStreak}</div>
                    <div className="stat-label">Best Streak</div>
                </div>
                <div className="stat-card">
                    <div className="stat-value">{stats.favoriteMove ? MOVE_EMOJI[stats.favoriteMove] : "—"}</div>
                    <div className="stat-label">Top Move</div>
                </div>
                <div className="stat-card">
                    <div className="stat-value">{stats.comebackWins}</div>
                    <div className="stat-label">Comebacks</div>
                </div>
            </div>

            <div className="section-title">Achievements ({earnedCount}/{badges.length})</div>
            <div className="badges-row">
                {badges.map(({ achievement, earned }) => (
                    <span
                        key={achievement.id}
                        className={`badge ${earned ? "badge-earned" : "badge-locked"}`}
                        title={achievement.description + (earned ? "" : " (locked)")}
                    >
                        {achievement.emoji} {achievement.label}
                    </span>
                ))}
            </div>

            {stats.headToHead.length > 0 && (
                <>
                    <div className="section-title">Head-to-head</div>
                    <div className="h2h-list">
                        {stats.headToHead.slice(0, 5).map(h => (
                            <div key={h.opponent} className="h2h-row">
                                <span className="h2h-opp">{h.opponent === "computer" ? "Computer" : short(h.opponent)}</span>
                                <span className="h2h-record">
                                    <span className="profile-stat-win">{h.wins}W</span>
                                    {" "}<span className="profile-stat-loss">{h.losses}L</span>
                                    {" "}<span className="profile-stat-draw">{h.draws}D</span>
                                </span>
                            </div>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
}
