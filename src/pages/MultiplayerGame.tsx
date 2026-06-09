import { useState, useEffect, useRef } from "react";
import type { AppAccount } from "../utils.ts";
import { StatementStoreClient } from "@parity/product-sdk-statement-store";
import type { Move, Round, GameData, PlayerData, RoundResult } from "../types.ts";
import {
    uploadToBulletin, ensureMapping, getContract, withTimeout,
    IPFS_GATEWAY, short, asBytes20,
} from "../utils.ts";
import { MOVES, MOVE_EMOJI, MOVE_LABEL, determineWinner, pointsForResult, isMatchOver } from "../game.ts";

const PHASE_TIMEOUT = 30;

type GameMessage =
    | { type: "join"; peerId: string; timestamp: number; bestOf?: number }
    | { type: "commit"; round: number; hash: string; peerId: string; timestamp: number }
    | { type: "reveal"; round: number; move: Move; salt: string; peerId: string; timestamp: number }
    | { type: "rematch"; peerId: string; timestamp: number };

async function hashCommit(move: Move, salt: string): Promise<string> {
    const data = new TextEncoder().encode(move + salt);
    const hash = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, "0")).join("");
}

export default function MultiplayerGame({ account, roomCode, isCreator, bestOf, onDone }: {
    account: AppAccount;
    roomCode: string;
    isCreator: boolean;
    bestOf: number;
    onDone: () => void;
}) {
    const myId = account.h160Address;

    const [phase, setPhase] = useState<"connecting" | "pick" | "waiting-commit" | "waiting-reveal" | "round-result" | "game-over">("connecting");
    // Match length: the creator knows it up front; the joiner adopts it from the creator's join message.
    const [matchBestOf, setMatchBestOf] = useState<number | null>(isCreator ? bestOf : null);
    const [round, setRound] = useState(1);
    const [rounds, setRounds] = useState<Round[]>([]);
    const [currentRoundResult, setCurrentRoundResult] = useState<Round | null>(null);
    const [timer, setTimer] = useState(PHASE_TIMEOUT);
    const [saving, setSaving] = useState(false);
    const [statusMsg, setStatusMsg] = useState("");
    const [pickedMove, setPickedMove] = useState<Move | null>(null);

    const clientRef = useRef<StatementStoreClient | null>(null);
    const myMoveRef = useRef<Move | null>(null);
    const mySaltRef = useRef<string>("");
    const opponentCommitRef = useRef<string | null>(null);
    const roundRef = useRef(1);
    const phaseRef = useRef<string>("connecting");
    const roundsRef = useRef<Round[]>([]);
    const opponentIdRef = useRef<string | null>(null);
    const seenRef = useRef<Set<string>>(new Set());
    const bestOfRef = useRef<number>(isCreator ? bestOf : 0);
    const [rematchMe, setRematchMe] = useState(false);
    const [rematchOpp, setRematchOpp] = useState(false);
    const rematchMeRef = useRef(false);
    const rematchOppRef = useRef(false);

    useEffect(() => { phaseRef.current = phase; }, [phase]);
    useEffect(() => { roundRef.current = round; }, [round]);
    useEffect(() => { roundsRef.current = rounds; }, [rounds]);

    useEffect(() => {
        if (phase !== "pick" && phase !== "waiting-commit" && phase !== "waiting-reveal") return;
        setTimer(PHASE_TIMEOUT);
        const interval = setInterval(() => {
            setTimer(t => {
                if (t <= 1) { clearInterval(interval); return 0; }
                return t - 1;
            });
        }, 1000);
        return () => clearInterval(interval);
    }, [phase, round]);

    function processRoundResult(myMove: Move, opponentMove: Move) {
        const result = determineWinner(myMove, opponentMove);
        const roundData: Round = { playerMove: myMove, opponentMove, result };
        setCurrentRoundResult(roundData);
        const newRounds = [...roundsRef.current, roundData];
        setRounds(newRounds);
        roundsRef.current = newRounds;

        const w = newRounds.filter(r => r.result === "win").length;
        const l = newRounds.filter(r => r.result === "loss").length;

        setPhase("round-result");

        setTimeout(() => {
            if (isMatchOver(w, l, newRounds.length, bestOfRef.current)) {
                setPhase("game-over");
            } else {
                const nextRound = newRounds.length + 1;
                setRound(nextRound);
                roundRef.current = nextRound;
                myMoveRef.current = null;
                mySaltRef.current = "";
                opponentCommitRef.current = null;
                setPickedMove(null);
                setCurrentRoundResult(null);
                setPhase("pick");
            }
        }, 2000);
    }

    // Reset to a fresh match (same room, same bestOf) once both players agree.
    function startRematch() {
        const fresh: Round[] = [];
        setRounds(fresh);
        roundsRef.current = fresh;
        setRound(1);
        roundRef.current = 1;
        myMoveRef.current = null;
        mySaltRef.current = "";
        opponentCommitRef.current = null;
        setPickedMove(null);
        setCurrentRoundResult(null);
        setStatusMsg("");
        rematchMeRef.current = false;
        rematchOppRef.current = false;
        setRematchMe(false);
        setRematchOpp(false);
        setPhase("pick");
        phaseRef.current = "pick";
    }

    function handleMessage(msg: GameMessage) {
        const dedupKey = `${msg.type}-${(msg as any).round ?? 0}-${msg.peerId}-${msg.timestamp}`;
        if (seenRef.current.has(dedupKey)) return;
        seenRef.current.add(dedupKey);

        if (msg.type === "join" && msg.peerId !== myId) {
            opponentIdRef.current = msg.peerId;
            // Joiner adopts the creator's match length and only then starts picking.
            if (!isCreator && typeof msg.bestOf === "number" && bestOfRef.current === 0) {
                bestOfRef.current = msg.bestOf;
                setMatchBestOf(msg.bestOf);
                if (phaseRef.current === "connecting") {
                    setPhase("pick");
                    phaseRef.current = "pick";
                }
            }
        }

        if (msg.type === "rematch" && msg.peerId !== myId) {
            rematchOppRef.current = true;
            setRematchOpp(true);
            if (rematchMeRef.current) startRematch();
        }

        if (msg.type === "commit" && msg.peerId !== myId) {
            opponentCommitRef.current = msg.hash;

            if (phaseRef.current === "waiting-commit" && clientRef.current) {
                setPhase("waiting-reveal");
                phaseRef.current = "waiting-reveal";

                if (myMoveRef.current && mySaltRef.current) {
                    clientRef.current.publish<GameMessage>(
                        { type: "reveal", round: roundRef.current, move: myMoveRef.current,
                          salt: mySaltRef.current, peerId: myId, timestamp: Date.now() },
                        { channel: `${roomCode}/reveal/${roundRef.current}/${myId}`, topic2: roomCode },
                    );
                }
            }
        }

        if (msg.type === "reveal" && msg.peerId !== myId) {
            const myMove = myMoveRef.current;
            const theirCommit = opponentCommitRef.current;
            if (!myMove || !theirCommit) return;

            hashCommit(msg.move, msg.salt).then(expectedHash => {
                if (expectedHash !== theirCommit) {
                    setStatusMsg("Opponent cheated!");
                    return;
                }
                processRoundResult(myMove, msg.move);
            });
        }
    }

    useEffect(() => {
        let destroyed = false;

        (async () => {
            try {
                const client = new StatementStoreClient({
                    appName: "rps-game",
                    defaultTtlSeconds: 600,
                });
                clientRef.current = client;

                await client.connect({
                    mode: "host",
                    accountId: account.productAccountId,
                });

                client.subscribe<GameMessage>((statement) => {
                    if (destroyed) return;
                    const msg = statement.data;
                    if (msg.peerId === myId) return;
                    handleMessage(msg);
                }, { topic2: roomCode });

                await client.publish<GameMessage>(
                    { type: "join", peerId: myId, timestamp: Date.now(), bestOf: isCreator ? bestOf : undefined },
                    { channel: `${roomCode}/presence/${myId}`, topic2: roomCode },
                );

                // Creator already knows the match length; the joiner waits for the creator's
                // join message (handled in handleMessage) before leaving the connecting phase.
                if (!destroyed && isCreator) {
                    setPhase("pick");
                    phaseRef.current = "pick";
                }
            } catch (err) {
                console.error("[MPGame] Error:", err);
                setStatusMsg("Connection failed");
            }
        })();

        return () => {
            destroyed = true;
            clientRef.current?.destroy();
            clientRef.current = null;
        };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const pickMove = async (move: Move) => {
        if (phaseRef.current !== "pick" || !clientRef.current) return;

        const salt = crypto.randomUUID();
        const hash = await hashCommit(move, salt);

        myMoveRef.current = move;
        mySaltRef.current = salt;
        setPickedMove(move);

        await clientRef.current.publish<GameMessage>(
            { type: "commit", round: roundRef.current, hash, peerId: myId, timestamp: Date.now() },
            { channel: `${roomCode}/commit/${roundRef.current}/${myId}`, topic2: roomCode },
        );

        if (opponentCommitRef.current) {
            setPhase("waiting-reveal");
            phaseRef.current = "waiting-reveal";
            await clientRef.current.publish<GameMessage>(
                { type: "reveal", round: roundRef.current, move, salt, peerId: myId, timestamp: Date.now() },
                { channel: `${roomCode}/reveal/${roundRef.current}/${myId}`, topic2: roomCode },
            );
        } else {
            setPhase("waiting-commit");
            phaseRef.current = "waiting-commit";
        }
    };

    const playerWins = rounds.filter(r => r.result === "win").length;
    const opponentWins = rounds.filter(r => r.result === "loss").length;
    const overallResult: RoundResult = playerWins > opponentWins ? "win" : opponentWins > playerWins ? "loss" : "draw";
    const pts = pointsForResult(overallResult);

    const saveToChain = async () => {
        setSaving(true);
        try {
            const lb = getContract();
            if (!lb) {
                setStatusMsg("Contract not deployed — run `cdm deploy && cdm install`");
                setSaving(false);
                return;
            }

            let playerData: PlayerData = {
                player: myId, totalGames: 0, wins: 0, losses: 0, draws: 0, points: 0, games: [],
            };
            try {
                const cidRes = await lb.getPlayerCid.query(asBytes20(myId));
                if (cidRes.success && cidRes.value) {
                    const resp = await fetch(IPFS_GATEWAY + cidRes.value);
                    if (resp.ok) playerData = await resp.json();
                }
            } catch { /* first time */ }

            const game: GameData = {
                id: playerData.games.length + 1, mode: "multiplayer",
                opponent: opponentIdRef.current ?? "unknown", roomCode,
                bestOf: bestOfRef.current, rounds,
                result: overallResult, pointsChange: pts,
                timestamp: Math.floor(Date.now() / 1000),
            };
            playerData.games.push(game);
            playerData.totalGames++;
            if (overallResult === "win") playerData.wins++;
            else if (overallResult === "loss") playerData.losses++;
            else playerData.draws++;
            playerData.points += pts;

            setStatusMsg("Uploading to Bulletin...");
            const newCid = await uploadToBulletin(account, new TextEncoder().encode(JSON.stringify(playerData)));
            await ensureMapping(account);

            const regRes = await lb.isRegistered.query(asBytes20(myId));
            if (regRes.success && !regRes.value) {
                setStatusMsg("Registering...");
                await withTimeout(lb.register.tx(), 120_000, "register");
            }
            setStatusMsg("Updating leaderboard...");
            await withTimeout(lb.updateResult.tx(newCid, BigInt(pts)), 120_000, "update");
            setStatusMsg("Saved!");
        } catch (err) {
            console.error("[MPGame] Save error:", err);
            setStatusMsg("Failed - check console");
        } finally { setSaving(false); }
    };

    const requestRematch = () => {
        if (rematchMeRef.current) return;
        rematchMeRef.current = true;
        setRematchMe(true);
        clientRef.current?.publish<GameMessage>(
            { type: "rematch", peerId: myId, timestamp: Date.now() },
            { channel: `${roomCode}/rematch/${myId}/${Date.now()}`, topic2: roomCode },
        );
        if (rematchOppRef.current) startRematch();
    };

    const displayBestOf = matchBestOf ?? bestOf;

    if (phase === "connecting") {
        return <div className="spinner">{isCreator ? "Connecting to game room..." : "Connecting — waiting for host settings..."}</div>;
    }

    return (
        <div className="mp-game">
            <h2>Room: {roomCode} · Best of {displayBestOf}</h2>
            <div className="phase-label">
                {phase === "pick" && `Round ${round} - Pick your move`}
                {phase === "waiting-commit" && "Waiting for opponent's move..."}
                {phase === "waiting-reveal" && "Revealing moves..."}
                {phase === "round-result" && "Round result"}
                {phase === "game-over" && "Game Over"}
            </div>

            <div className="score-display">
                <div>You: <span>{playerWins}</span></div>
                <div>Round <span>{Math.min(round, displayBestOf)}</span>/{displayBestOf}</div>
                <div>Opponent: <span>{opponentWins}</span></div>
            </div>

            {(phase === "pick" || phase === "waiting-commit") && <div className="timer">{timer}s</div>}

            {phase === "pick" && (
                <div className="move-picker">
                    {MOVES.map(m => (
                        <div key={m}>
                            <button className="move-btn" onClick={() => pickMove(m)}>{MOVE_EMOJI[m]}</button>
                            <div className="move-label">{MOVE_LABEL[m]}</div>
                        </div>
                    ))}
                </div>
            )}

            {phase === "waiting-commit" && (
                <div className="waiting-opponent">
                    <div style={{ fontSize: 48, marginBottom: 8 }}>{pickedMove ? MOVE_EMOJI[pickedMove] : ""}</div>
                    <div>You picked {pickedMove}. Waiting for opponent...</div>
                </div>
            )}

            {phase === "waiting-reveal" && <div className="waiting-opponent">Revealing moves...</div>}

            {phase === "round-result" && currentRoundResult && (
                <div className="round-result">
                    <div className="round-result-moves">
                        <span>{MOVE_EMOJI[currentRoundResult.playerMove]}</span>
                        <span className="round-result-vs">VS</span>
                        <span>{MOVE_EMOJI[currentRoundResult.opponentMove]}</span>
                    </div>
                    <div className={`round-result-text ${currentRoundResult.result}`}>
                        {currentRoundResult.result === "win" ? "You win this round!" :
                         currentRoundResult.result === "loss" ? "You lose this round!" : "Draw!"}
                    </div>
                </div>
            )}

            {phase === "game-over" && (
                <div className="round-result">
                    <div className={`round-result-text ${overallResult}`} style={{ fontSize: 24, marginBottom: 8 }}>
                        {overallResult === "win" ? "You won the match!" :
                         overallResult === "loss" ? "You lost the match!" : "Match drawn!"}
                    </div>
                    <div style={{ fontSize: 14, color: "var(--text2)", marginBottom: 8 }}>
                        vs {opponentIdRef.current ? short(opponentIdRef.current) : "opponent"}
                    </div>
                    <div style={{ fontSize: 14, color: "var(--text2)", marginBottom: 16 }}>
                        {playerWins} - {opponentWins} ({pts > 0 ? `+${pts}` : pts} pts)
                    </div>
                    <div className="history-card-rounds" style={{ justifyContent: "center", marginBottom: 16 }}>
                        {rounds.map((r, i) => (
                            <span key={i} className="round-badge">{MOVE_EMOJI[r.playerMove]} vs {MOVE_EMOJI[r.opponentMove]}</span>
                        ))}
                    </div>
                    {statusMsg && <div className="status">{statusMsg}</div>}
                    {rematchOpp && !rematchMe && (
                        <div style={{ fontSize: 13, color: "var(--text2)", marginBottom: 8 }}>
                            Opponent wants a rematch
                        </div>
                    )}
                    <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
                        <button className="btn btn-primary" onClick={saveToChain} disabled={saving}>
                            {saving ? "Saving..." : "Save to Chain"}
                        </button>
                        <button className="btn btn-ghost" onClick={requestRematch} disabled={saving || rematchMe}>
                            {rematchMe ? "Waiting for opponent..." : "Rematch"}
                        </button>
                        <button className="btn btn-ghost" onClick={onDone}>Home</button>
                    </div>
                </div>
            )}

            {statusMsg && phase !== "game-over" && <div className="status">{statusMsg}</div>}
        </div>
    );
}
