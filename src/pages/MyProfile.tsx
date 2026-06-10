import { useState, useEffect } from "react";
import type { AppAccount } from "../utils.ts";
import { getContract, short, asBytes20 } from "../utils.ts";

export default function MyProfile({ account }: {
    account: AppAccount;
}) {
    const [points, setPoints] = useState<number | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const lb = getContract();
                if (!lb) { setLoading(false); return; }

                const regRes = await lb.isRegistered.query(asBytes20(account));
                if (!regRes.success || !regRes.value || cancelled) {
                    setLoading(false);
                    return;
                }

                const ptsRes = await lb.getPlayerPoints.query(asBytes20(account));
                if (!cancelled) setPoints(ptsRes.success ? Number(ptsRes.value) : 0);
            } catch (err) {
                console.error("[Profile] Error:", err);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [account.h160Address]);

    if (loading) {
        return <div className="profile-card"><div className="spinner">Loading profile...</div></div>;
    }

    if (points === null) {
        return (
            <div className="profile-card">
                <div className="profile-header">
                    <div className="profile-address">{short(account.h160Address)}</div>
                </div>
                <div className="profile-empty">No games yet — play your first match!</div>
            </div>
        );
    }

    return (
        <div className="profile-card">
            <div className="profile-header">
                <div>
                    <div className="profile-address">{short(account.h160Address)}</div>
                    <div className="profile-points">
                        {points > 0 ? `+${points}` : points} pts
                    </div>
                </div>
            </div>
        </div>
    );
}
