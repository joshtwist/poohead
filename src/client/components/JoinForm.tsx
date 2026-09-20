import { useState } from "react";
import type { PlayerIcon } from "../../shared/types.ts";
import type { ClientMessage } from "../../shared/protocol.ts";
import { IconPicker } from "./IconPicker.tsx";

interface JoinFormProps {
  playerId: string;
  send: (msg: ClientMessage) => void;
  takenIcons?: PlayerIcon[];
}

export function JoinForm({ playerId, send, takenIcons = [] }: JoinFormProps) {
  const [name, setName] = useState("");
  const [icon, setIcon] = useState<PlayerIcon | null>(null);
  const [joining, setJoining] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !icon || joining) return;
    setJoining(true);
    send({ type: "join", playerId, name: name.trim(), icon });
  }

  const canSubmit = name.trim().length > 0 && icon !== null && !joining;

  return (
    <div className="cq relative flex-1 min-h-0 overflow-y-auto no-scrollbar">
      <div className="dot-grid absolute inset-0 pointer-events-none" />
      <form
        onSubmit={handleSubmit}
        className="relative min-h-full flex flex-col justify-center max-w-[460px] mx-auto"
        style={{ padding: "clamp(28px,7cqw,56px) clamp(20px,6cqw,44px)", gap: "clamp(18px,4.5cqw,28px)" }}
      >
        <div>
          <h1
            className="font-display font-extrabold"
            style={{ fontSize: "clamp(36px,10cqw,58px)", lineHeight: 0.95, letterSpacing: "-.04em" }}
          >
            Pull up a chair
          </h1>
          <p className="mt-1.5 font-extrabold text-lime" style={{ fontSize: "clamp(14px,3.8cqw,18px)" }}>
            Pick a name and a face.
          </p>
        </div>

        <label className="flex flex-col gap-2">
          <span className="text-xs font-black tracking-[.1em] uppercase text-muted">Your name</span>
          <input
            id="player-name"
            data-testid="name-input"
            type="text"
            maxLength={12}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="What do they call you?"
            autoComplete="off"
            className="w-full rounded-[18px] px-4 text-cream placeholder:text-cream/35 font-display font-bold outline-none focus:border-lime"
            style={{
              height: "clamp(52px,13cqw,64px)",
              fontSize: "clamp(18px,4.6cqw,22px)",
              background: "rgba(255,247,232,.1)",
              border: "2px solid rgba(255,247,232,.16)",
            }}
          />
        </label>

        <div className="flex flex-col gap-2">
          <span className="text-xs font-black tracking-[.1em] uppercase text-muted">Your face</span>
          <IconPicker selected={icon} onSelect={setIcon} disabledIcons={takenIcons} />
        </div>

        <button
          type="submit"
          data-testid="join-btn"
          disabled={!canSubmit}
          className="btn-lime w-full rounded-[22px] border-0 cursor-pointer"
          style={{ height: "clamp(58px,14cqw,72px)", fontSize: "clamp(19px,5cqw,26px)" }}
        >
          {joining ? "Taking a seat…" : "Take a seat"}
        </button>
      </form>
    </div>
  );
}
