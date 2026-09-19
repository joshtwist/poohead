import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "./Card.tsx";

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
    <div className="flex flex-1 min-h-0 flex-col items-center justify-center px-6 overflow-y-auto">
      <div className="flex flex-col items-center gap-8 max-w-sm w-full py-8">
        {/* Logo area */}
        <div className="flex flex-col items-center gap-4">
          <div className="w-20 h-20 rounded-2xl bg-felt-light flex items-center justify-center shadow-lg text-5xl">
            <span aria-hidden>💩</span>
          </div>
          <h1 className="text-4xl font-bold tracking-tight">
            <span aria-hidden>💩</span>head
          </h1>
          <p className="text-slate-300 text-center text-lg">
            Shed your cards. Don't be the 💩head.
          </p>
        </div>

        {/* Card table visual */}
        <div className="w-full rounded-2xl bg-felt-light/30 border border-felt-light/40 p-8 flex flex-col items-center gap-6">
          <div className="flex gap-2 items-end">
            <Card faceDown size="sm" />
            <Card card={{ suit: "spades", rank: "2" }} size="sm" wild />
            <Card card={{ suit: "hearts", rank: "7" }} size="sm" />
            <Card card={{ suit: "clubs", rank: "10" }} size="sm" wild />
            <Card faceDown size="sm" />
          </div>

          <button
            data-testid="create-game-btn"
            onClick={handleCreate}
            disabled={creating}
            className="w-full py-4 px-6 bg-gold hover:bg-amber-400 active:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed text-slate-900 font-bold text-lg rounded-xl transition-colors duration-200 shadow-lg cursor-pointer"
          >
            {creating ? "Creating..." : "Create New Game"}
          </button>

          <p className="text-slate-400 text-sm text-center">
            2–5 players · phone, tablet or laptop · no accounts, just a link
          </p>
        </div>

        <p className="text-slate-500 text-xs text-center max-w-xs">
          Also known as Shithead, Karma or Palace. Three rule sets to pick from in the lobby.
        </p>
      </div>
    </div>
  );
}
