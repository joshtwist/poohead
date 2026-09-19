import { motion } from "framer-motion";
import { Check, Hand, Play, RotateCcw, Zap } from "lucide-react";
import type { Layout } from "../lib/layout.ts";

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
      pickupPrimary: boolean;
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
  | { kind: "waiting"; text: string; hint?: string }
  | { kind: "out"; text: string };

interface ActionBarProps {
  model: ActionModel;
  layout: Layout;
}

const PRIMARY =
  "bg-gold hover:bg-amber-400 active:bg-amber-500 text-slate-900 font-bold shadow-lg disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none";
const SECONDARY =
  "bg-slate-800/80 hover:bg-slate-700 active:bg-slate-900 border border-slate-600/60 text-white font-semibold disabled:opacity-40 disabled:cursor-not-allowed";
const DANGER =
  "bg-poo hover:bg-poo-light active:bg-poo text-white font-bold shadow-lg disabled:opacity-40 disabled:cursor-not-allowed";

/**
 * Fixed-height bar of contextual actions. Every game verb lives here so
 * the cards themselves only ever need a single tap to select.
 */
export function ActionBar({ model, layout }: ActionBarProps) {
  const h = layout.barBtn;
  const btnBase = `rounded-xl px-4 flex items-center justify-center gap-2 cursor-pointer transition-colors duration-150 text-[15px] tablet:text-base`;
  const hint =
    model.kind === "out" ? null : model.kind === "waiting" ? model.hint ?? null : model.hint;

  return (
    <div
      data-testid="action-bar"
      data-kind={model.kind}
      className="flex-shrink-0 flex flex-col items-center gap-1 px-3 pt-1 pb-2 compact:pb-1"
      style={{ minHeight: h + 28 }}
    >
      <div className="flex items-center justify-center gap-2 w-full max-w-[560px]">
        {model.kind === "swap" && (
          <>
            <button
              data-testid="ready-btn"
              onClick={model.onReady}
              disabled={model.ready}
              className={`${btnBase} ${model.ready ? SECONDARY : PRIMARY} flex-1`}
              style={{ height: h }}
            >
              <Check className="w-5 h-5" strokeWidth={2.5} />
              {model.ready ? `Ready (${model.readyCount}/${model.total})` : "Ready"}
            </button>
            {model.isHost && model.ready && (
              <button
                data-testid="force-start-btn"
                onClick={model.onForceStart}
                disabled={!model.canForceStart}
                className={`${btnBase} ${SECONDARY}`}
                style={{ height: h }}
                title="Start without waiting for players who have dropped"
              >
                <Play className="w-4 h-4" fill="currentColor" />
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
                className={`${btnBase} ${SECONDARY} text-sm px-3`}
                style={{ height: h }}
              >
                {model.selectAll.label}
              </button>
            )}
            <button
              data-testid="play-btn"
              onClick={model.onPlay}
              disabled={model.playDisabled}
              className={`${btnBase} ${PRIMARY} flex-1`}
              style={{ height: h }}
            >
              <Play className="w-5 h-5" fill="currentColor" />
              {model.playLabel}
            </button>
            <motion.button
              data-testid="pickup-btn"
              data-armed={model.pickupArmed ? "true" : undefined}
              onClick={model.onPickUp}
              disabled={!model.canPickUp}
              animate={model.pickupPrimary ? { scale: [1, 1.04, 1] } : { scale: 1 }}
              transition={model.pickupPrimary ? { duration: 1.2, repeat: Infinity } : undefined}
              className={`${btnBase} ${model.pickupPrimary || model.pickupArmed ? DANGER : SECONDARY} ${
                model.pickupPrimary ? "flex-1" : ""
              }`}
              style={{ height: h }}
            >
              <Hand className="w-5 h-5" />
              {model.pickupArmed ? "Really pick up?" : model.pickupLabel}
            </motion.button>
          </>
        )}

        {model.kind === "flip" && (
          <>
            <button
              data-testid="flip-btn"
              onClick={model.onFlip}
              disabled={model.flipDisabled}
              className={`${btnBase} ${PRIMARY} flex-1`}
              style={{ height: h }}
            >
              <Zap className="w-5 h-5" fill="currentColor" />
              Flip
            </button>
            <button
              data-testid="pickup-btn"
              onClick={model.onPickUp}
              disabled={!model.canPickUp}
              className={`${btnBase} ${SECONDARY}`}
              style={{ height: h }}
            >
              <Hand className="w-5 h-5" />
              {model.pickupLabel}
            </button>
          </>
        )}

        {model.kind === "waiting" && (
          <div
            className="flex items-center gap-2 text-slate-300/90 text-sm compact:text-xs"
            style={{ height: h }}
            data-testid="waiting-text"
          >
            <RotateCcw className="w-4 h-4 opacity-60" />
            {model.text}
          </div>
        )}

        {model.kind === "out" && (
          <div
            className="flex items-center gap-2 text-gold text-sm font-semibold"
            style={{ height: h }}
            data-testid="out-text"
          >
            {model.text}
          </div>
        )}
      </div>
      <div
        className="h-4 text-[11px] tablet:text-xs text-slate-300/70 text-center px-2 truncate w-full max-w-[560px]"
        data-testid="action-hint"
      >
        {hint ?? ""}
      </div>
    </div>
  );
}
