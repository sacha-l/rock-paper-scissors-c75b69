import { useState, useEffect, useRef } from "react";
import type { AppAccount } from "../utils.ts";
import type { Move, Round, RoundResult } from "../types.ts";
import {
    ensureMapping, getContract, withTimeout, asBytes20,
} from "../utils.ts";
import {
    MOVES, MOVE_EMOJI, MOVE_LABEL, determineWinner, pointsForResult, randomMove,
    BEST_OF_OPTIONS, DEFAULT_BEST_OF, isMatchOver,
} from "../game.ts";
import { nextMove, type Difficulty } from "../ai.ts";

const RESULT_TEXT: Record<RoundResult, string> = { win: "You win!", loss: "You lose!", draw: "Draw!" };
const PICK_SECONDS = 10;

export default function SoloGame({ account, onDone }: {
    account: AppAccount;
    onDone: () => void;
}) {
    const [started, setStarted] = useState(false);
    const [bestOf, setBestOf] = useState<number>(DEFAULT_BEST_OF);
    const [difficulty, setDifficulty] = useState<Difficulty>("easy");
    const [timerEnabled, setTimerEnabled] = useState(false);

    const [rounds, setRounds] = useState<Round[]>([]);
    const [currentRound, setCurrentRound] = useState<Round | null>(null);
    const [gameOver, setGameOver] = useState(false);
    const [timer, setTimer] = useState(PICK_SECONDS);
    const [saving, setSaving] = useState(false);
    const [statusMsg, setStatusMsg] = useState("");

    const playerWins = rounds.filter(r => r.result === "win").length;
    const computerWins = rounds.filter(r => r.result === "loss").length;
    const roundNumber = rounds.length + 1;
    const myTurn = started && !currentRound && !gameOver;

    const pickMove = (move: Move) => {
        if (currentRound || gameOver) return;
        const opponentMove = nextMove(rounds.map(r => r.playerMove), difficulty);
        const result = determineWinner(move, opponentMove);
        const round: Round = { playerMove: move, opponentMove, result };
        setCurrentRound(round);

        setTimeout(() => {
            const newRounds = [...rounds, round];
            setRounds(newRounds);
            setCurrentRound(null);
            const w = newRounds.filter(r => r.result === "win").length;
            const l = newRounds.filter(r => r.result === "loss").length;
            if (isMatchOver(w, l, newRounds.length, bestOf)) {
                setGameOver(true);
            }
        }, 1500);
    };

    // Keep a fresh reference so the countdown effect always calls the latest pickMove.
    const pickMoveRef = useRef(pickMove);
    pickMoveRef.current = pickMove;

    // Optional per-pick countdown: auto-plays a random move on expiry.
    useEffect(() => {
        if (!timerEnabled || !myTurn) return;
        setTimer(PICK_SECONDS);
        const interval = setInterval(() => {
            setTimer(t => {
                if (t <= 1) {
                    clearInterval(interval);
                    pickMoveRef.current(randomMove());
                    return 0;
                }
                return t - 1;
            });
        }, 1000);
        return () => clearInterval(interval);
    }, [timerEnabled, myTurn, rounds.length]);

    const overallResult: RoundResult = playerWins > computerWins ? "win" : computerWins > playerWins ? "loss" : "draw";
    const pts = pointsForResult(overallResult);

    const rematch = () => {
        setRounds([]);
        setCurrentRound(null);
        setGameOver(false);
        setStatusMsg("");
    };

    const saveToChain = async () => {
        setSaving(true);
        try {
            const lb = getContract();
            if (!lb) {
                setStatusMsg("Contract not deployed — run `cdm deploy && cdm install`");
                setSaving(false);
                return;
            }

            setStatusMsg("Ensuring account mapping...");
            await ensureMapping(account);

            const regRes = await lb.isRegistered.query(asBytes20(account));
            if (regRes.success && !regRes.value) {
                setStatusMsg("Registering player...");
                await withTimeout(lb.register.tx(), 120_000, "register.tx");
            }

            setStatusMsg("Updating leaderboard...");
            await withTimeout(
                lb.addPoints.tx(BigInt(pts)),
                120_000, "addPoints.tx",
            );

            setStatusMsg("Saved!");
        } catch (err) {
            console.error("Save error:", err);
            setStatusMsg("Failed to save - check console");
        } finally {
            setSaving(false);
        }
    };

    if (!started) {
        return (
            <div className="game-page">
                <h2>Solo</h2>
                <div className="game-config">
                    <div className="config-row">
                        <div className="config-label">Match length</div>
                        <div className="config-options">
                            {BEST_OF_OPTIONS.map(n => (
                                <button
                                    key={n}
                                    className={`btn ${bestOf === n ? "btn-primary" : "btn-ghost"}`}
                                    onClick={() => setBestOf(n)}
                                >
                                    Best of {n}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className="config-row">
                        <div className="config-label">Computer</div>
                        <div className="config-options">
                            <button
                                className={`btn ${difficulty === "easy" ? "btn-primary" : "btn-ghost"}`}
                                onClick={() => setDifficulty("easy")}
                            >
                                Easy
                            </button>
                            <button
                                className={`btn ${difficulty === "hard" ? "btn-primary" : "btn-ghost"}`}
                                onClick={() => setDifficulty("hard")}
                            >
                                Hard
                            </button>
                        </div>
                    </div>
                    <div className="config-row">
                        <div className="config-label">{PICK_SECONDS}s pick timer</div>
                        <div className="config-options">
                            <button
                                className={`btn ${timerEnabled ? "btn-primary" : "btn-ghost"}`}
                                onClick={() => setTimerEnabled(v => !v)}
                            >
                                {timerEnabled ? "On" : "Off"}
                            </button>
                        </div>
                    </div>
                </div>
                <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 16 }}>
                    <button className="btn btn-primary" onClick={() => setStarted(true)}>
                        Start
                    </button>
                    <button className="btn btn-ghost" onClick={onDone}>Home</button>
                </div>
            </div>
        );
    }

    return (
        <div className="game-page">
            <h2>Solo - Best of {bestOf} · {difficulty === "hard" ? "Hard" : "Easy"}</h2>

            <div className="score-display">
                <div>You: <span>{playerWins}</span></div>
                <div>Round <span>{Math.min(roundNumber, bestOf)}</span>/{bestOf}</div>
                <div>CPU: <span>{computerWins}</span></div>
            </div>

            {timerEnabled && myTurn && <div className="timer">{timer}s</div>}

            {currentRound && (
                <div className="round-result">
                    <div className="round-result-moves">
                        <span>{MOVE_EMOJI[currentRound.playerMove]}</span>
                        <span className="round-result-vs">VS</span>
                        <span>{MOVE_EMOJI[currentRound.opponentMove]}</span>
                    </div>
                    <div className={`round-result-text ${currentRound.result}`}>
                        {RESULT_TEXT[currentRound.result]}
                    </div>
                </div>
            )}

            {!gameOver && !currentRound && (
                <div className="move-picker">
                    {MOVES.map(m => (
                        <div key={m}>
                            <button className="move-btn" onClick={() => pickMove(m)}>
                                {MOVE_EMOJI[m]}
                            </button>
                            <div className="move-label">{MOVE_LABEL[m]}</div>
                        </div>
                    ))}
                </div>
            )}

            {gameOver && (
                <div className="round-result">
                    <div className={`round-result-text ${overallResult}`} style={{ fontSize: 24, marginBottom: 8 }}>
                        {overallResult === "win" ? "You won the match!" :
                         overallResult === "loss" ? "You lost the match!" : "Match drawn!"}
                    </div>
                    <div style={{ fontSize: 14, color: "var(--text2)", marginBottom: 16 }}>
                        {playerWins} - {computerWins} ({pts > 0 ? `+${pts}` : pts} pts)
                    </div>

                    <div className="history-card-rounds" style={{ justifyContent: "center", marginBottom: 16 }}>
                        {rounds.map((r, i) => (
                            <span key={i} className="round-badge">
                                {MOVE_EMOJI[r.playerMove]} vs {MOVE_EMOJI[r.opponentMove]}
                            </span>
                        ))}
                    </div>

                    {statusMsg && <div className="status">{statusMsg}</div>}

                    <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
                        <button className="btn btn-primary" onClick={saveToChain} disabled={saving}>
                            {saving ? "Saving..." : "Save to Chain"}
                        </button>
                        <button className="btn btn-ghost" onClick={rematch} disabled={saving}>
                            Rematch
                        </button>
                        <button className="btn btn-ghost" onClick={onDone}>
                            Home
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
