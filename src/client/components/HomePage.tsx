import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { HeroFan } from "./HeroFan.tsx";

export function HomePage() {
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);

  async function handleCreate() {
    if (creating) return;
    setCreating(true);
    try {
      const res = await fetch("/api/game", { method: "POST" });
      if (!res.ok) throw new Error("Failed to create game");
      const data = await res.json();
      navigate(`/${data.gameId}`);
    } catch {
      setCreating(false);
    }
  }

  return (
    <div className="cq relative flex-1 min-h-0 overflow-y-auto no-scrollbar">
      <div className="dot-grid absolute inset-0 pointer-events-none" />
      <div
        className="relative min-h-full flex flex-col items-center justify-between text-center"
        style={{ padding: "clamp(70px,16cqw,120px) clamp(20px,6cqw,44px) clamp(56px,10cqw,72px)" }}
      >
        <div className="flex flex-col items-center" style={{ gap: "clamp(8px,2cqw,14px)" }}>
          <h1
            className="font-display font-extrabold text-cream"
            style={{
              fontSize: "clamp(58px,17cqw,104px)",
              lineHeight: 0.9,
              letterSpacing: "-.045em",
              textShadow: "0 6px 0 rgba(0,0,0,.25)",
            }}
          >
            <span className="anim-wiggle" aria-hidden>
              💩
            </span>
            <span>head</span>
          </h1>
          <p
            className="font-display font-semibold text-lime whitespace-nowrap"
            style={{ fontSize: "clamp(16px,4.3cqw,24px)", letterSpacing: "-.01em" }}
          >
            Shed your cards. Don't be the <span className="whitespace-nowrap">💩head.</span>
          </p>
        </div>

        <HeroFan style={{ width: "min(21cqw,124px)", height: "min(29.3cqw,173px)" }} />

        <div className="flex flex-col gap-3.5 w-full max-w-[420px]">
          <button
            data-testid="create-game-btn"
            onClick={handleCreate}
            disabled={creating}
            className="btn-lime w-full rounded-[22px] border-0 cursor-pointer"
            style={{ height: "clamp(58px,14cqw,72px)", fontSize: "clamp(19px,5cqw,26px)", letterSpacing: "-.01em" }}
          >
            {creating ? "Setting the table…" : "Start a game"}
          </button>
          <p className="text-muted font-bold" style={{ fontSize: "clamp(13px,3.4cqw,16px)" }}>
            2–5 players · no accounts · just a link
          </p>
        </div>
      </div>
    </div>
  );
}
