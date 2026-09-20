export type ActionModel =
  | {
      kind: "swap";
      ready: boolean;
      readyCount: number;
      total: number;
      isHost: boolean;
      canForceStart: boolean;
      onReady: () => void;
      onForceStart: () => void;
      hint: string;
    }
  | {
      kind: "play";
      playLabel: string;
      playDisabled: boolean;
      onPlay: () => void;
      pickupLabel: string;
      /** Nothing playable: the pick-up is the only move (pink, pulsing). */
      pickupPrimary: boolean;
      /** First tap armed the pick-up ("Really?"). */
      pickupArmed: boolean;
      canPickUp: boolean;
      onPickUp: () => void;
      selectAll: { label: string; onSelect: () => void } | null;
      hint: string;
    }
  | {
      kind: "flip";
      flipDisabled: boolean;
      onFlip: () => void;
      pickupLabel: string;
      canPickUp: boolean;
      onPickUp: () => void;
      hint: string;
    }
  | { kind: "waiting"; text: string; emoji: string; hint?: string }
  | { kind: "out"; text: string; emoji: string };

interface ActionBarProps {
  model: ActionModel;
}

const BTN = "btn-action h-full min-w-0 border-0 cursor-pointer";
const BTN_PAD = { padding: "0 clamp(12px,3.5cqw,22px)", fontSize: "clamp(16px,4.4cqw,21px)" } as const;

/**
 * Fixed-height bar of contextual actions. Every game verb lives here so
 * the cards themselves only ever need a single tap to select.
 */
export function ActionBar({ model }: ActionBarProps) {
  const hint = model.kind === "out" ? "" : model.kind === "waiting" ? (model.hint ?? "") : model.hint;

  return (
    <div
      data-testid="action-bar"
      data-kind={model.kind}
      className="flex-shrink-0 flex flex-col items-center gap-1.5 mt-1"
    >
      <div className="flex gap-2 w-full max-w-[560px]" style={{ height: "clamp(52px,13cqw,64px)" }}>
        {model.kind === "swap" && (
          <>
            <button
              data-testid="ready-btn"
              onClick={model.onReady}
              disabled={model.ready}
              className={`${BTN} ${model.ready ? "secondary" : "primary"} flex-1`}
              style={BTN_PAD}
            >
              {model.ready ? `Ready · ${model.readyCount}/${model.total}` : "Ready"}
            </button>
            {model.isHost && model.ready && (
              <button
                data-testid="force-start-btn"
                onClick={model.onForceStart}
                disabled={!model.canForceStart}
                className={`${BTN} secondary`}
                style={{ ...BTN_PAD, flex: 0.8 }}
                title="Start without waiting for players who have dropped"
              >
                Start now
              </button>
            )}
          </>
        )}

        {model.kind === "play" && (
          <>
            {model.selectAll && (
              <button
                data-testid="select-all-chip"
                onClick={model.selectAll.onSelect}
                className={`${BTN} secondary`}
                style={{ ...BTN_PAD, flex: 0.9, fontSize: "clamp(13px,3.6cqw,17px)" }}
              >
                {model.selectAll.label}
              </button>
            )}
            <button
              data-testid="play-btn"
              onClick={model.onPlay}
              disabled={model.playDisabled}
              className={`${BTN} primary`}
              style={{ ...BTN_PAD, flex: 2 }}
            >
              {model.playLabel}
            </button>
            <button
              data-testid="pickup-btn"
              data-armed={model.pickupArmed ? "true" : undefined}
              onClick={model.onPickUp}
              disabled={!model.canPickUp}
              className={`${BTN} ${model.pickupPrimary || model.pickupArmed ? "danger" : "secondary"} ${
                model.pickupPrimary ? "pulse-pink" : ""
              }`}
              style={{ ...BTN_PAD, flex: model.pickupPrimary ? 1.4 : 1 }}
            >
              {model.pickupArmed ? "Really?" : model.pickupLabel}
            </button>
          </>
        )}

        {model.kind === "flip" && (
          <>
            <button
              data-testid="flip-btn"
              onClick={model.onFlip}
              disabled={model.flipDisabled}
              className={`${BTN} primary`}
              style={{ ...BTN_PAD, flex: 2 }}
            >
              Flip
            </button>
            <button
              data-testid="pickup-btn"
              onClick={model.onPickUp}
              disabled={!model.canPickUp}
              className={`${BTN} secondary`}
              style={{ ...BTN_PAD, flex: 1 }}
            >
              {model.pickupLabel}
            </button>
          </>
        )}

        {(model.kind === "waiting" || model.kind === "out") && (
          <div
            className="flex-1 flex items-center justify-center gap-2 text-muted font-extrabold"
            style={{ fontSize: "clamp(14px,3.6cqw,17px)" }}
            data-testid={model.kind === "out" ? "out-text" : "waiting-text"}
          >
            <span className="anim-floaty">{model.emoji}</span>
            {model.text}
          </div>
        )}
      </div>
      <div
        className="h-4 text-muted font-bold text-center whitespace-nowrap overflow-hidden text-ellipsis max-w-full"
        style={{ fontSize: "clamp(11px,3cqw,13px)" }}
        data-testid="action-hint"
      >
        {hint}
      </div>
    </div>
  );
}
