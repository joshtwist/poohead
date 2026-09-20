import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import type { Card as CardType } from "../../shared/types.ts";
import { CARD_BASE_H, CARD_BASE_W } from "../lib/layout.ts";
import { CardArt } from "./Card.tsx";

/** Where a card sits: translate/rotate/scale about its centre, plus face. */
export interface Pose {
  x: number;
  y: number;
  rotate: number;
  scale: number;
  opacity: number;
  faceUp: boolean;
  z: number;
}

export interface Placement extends Pose {
  /** Stable identity: `hearts-7` for a known card, `stock-3` etc. for anonymous ones. */
  id: string;
  card?: CardType;
  /** Logical home; a change of zone makes the card "hot" so it flies over everything. */
  zone: string;
  wild?: boolean;
  shadow: string;
  interactive: boolean;
  testId?: string;
  data?: Record<string, string | undefined>;
  onTap?: () => void;
  /** Where a card that has just appeared starts its flight from. */
  enterFrom?: Pose;
  /** Where the card goes when it disappears (else it is removed instantly). */
  exit?: Pose;
}

interface CardLayerProps {
  placements: Placement[];
  /**
   * Exit pose for a card that has just vanished and carries no `exit` of
   * its own (e.g. pile cards after a burn or an opponent's pick-up).
   */
  exitFor?: (prev: Placement) => Pose | null;
}

const FLIGHT = "transform .55s cubic-bezier(.22,1,.36,1), opacity .45s";
const HOT_MS = 600;
const GHOST_MS = 700;

interface Ghost {
  placement: Placement;
  until: number;
}

/**
 * The single physical card layer: every card on the board is one
 * persistent element, absolutely positioned; moving a card means giving
 * it a new target and letting CSS transition the transform. Newly
 * appearing cards start at their `enterFrom` pose (measured first, so the
 * transition has a starting point); vanishing cards animate out via an
 * exit pose before they are removed.
 */
export function CardLayer({ placements, exitFor }: CardLayerProps) {
  const layerRef = useRef<HTMLDivElement>(null);
  const prevRef = useRef<Map<string, Placement> | null>(null);
  const hotRef = useRef<Map<string, number>>(new Map());
  const [ghosts, setGhosts] = useState<Record<string, Ghost>>({});
  const [, force] = useState(0);

  const now = Date.now();
  // Diff against the last COMMITTED snapshot (set in the layout effect), so
  // StrictMode's double render sees the same previous state twice.
  const prev = prevRef.current;
  const isFirst = prev === null;
  const next = new Map<string, Placement>();
  for (const p of placements) next.set(p.id, p);

  // Detect zone changes → hot cards; detect vanished cards → ghosts.
  const newGhosts: Record<string, Ghost> = {};
  const entering = new Set<string>();
  if (!isFirst) {
    for (const p of placements) {
      const was = prev.get(p.id);
      if (!was || was.zone !== p.zone) hotRef.current.set(p.id, now + HOT_MS);
      if (!was && p.enterFrom) entering.add(p.id);
    }
    for (const [id, was] of prev) {
      if (next.has(id)) continue;
      const exit = was.exit ?? exitFor?.(was) ?? null;
      if (exit) newGhosts[id] = { placement: { ...was, ...exit }, until: now + GHOST_MS };
    }
  }

  useLayoutEffect(() => {
    prevRef.current = next;
    if (Object.keys(newGhosts).length) {
      setGhosts((g) => ({ ...g, ...newGhosts }));
    }
    if (entering.size) {
      // Force a style/layout flush so the entry pose is the transition's
      // starting point, then re-render at the real targets.
      void layerRef.current?.offsetWidth;
      force((n) => n + 1);
    }
  });

  // Expire ghosts and hot flags.
  useEffect(() => {
    const times = [
      ...Object.values(ghosts).map((g) => g.until),
      ...hotRef.current.values(),
    ].filter((t) => t > now);
    if (!times.length) return;
    const t = setTimeout(() => {
      const n = Date.now();
      setGhosts((g) => {
        const keep: Record<string, Ghost> = {};
        for (const [id, gh] of Object.entries(g)) if (gh.until > n) keep[id] = gh;
        return keep;
      });
      for (const [id, until] of hotRef.current) if (until <= n) hotRef.current.delete(id);
      force((k) => k + 1);
    }, Math.min(...times) - now + 20);
    return () => clearTimeout(t);
  });

  return (
    <div ref={layerRef} className="absolute inset-0 pointer-events-none" style={{ zIndex: 5 }} data-testid="card-layer">
      {placements.map((p) => {
        const isEntering = entering.has(p.id) && !!p.enterFrom;
        const pose: Pose = isEntering ? { ...p, ...p.enterFrom! } : p;
        const hot = (hotRef.current.get(p.id) ?? 0) > now;
        return (
          <LayerCard
            key={p.id}
            placement={p}
            pose={pose}
            z={pose.z + (hot ? 1000 : 0)}
            instant={isEntering || isFirst}
          />
        );
      })}
      {Object.entries(ghosts).map(([id, g]) =>
        next.has(id) ? null : (
          <LayerCard
            key={`ghost-${id}`}
            placement={{ ...g.placement, interactive: false, testId: undefined, data: undefined }}
            pose={g.placement}
            z={g.placement.z + 1000}
            instant={false}
          />
        ),
      )}
    </div>
  );
}

function LayerCard({
  placement: p,
  pose,
  z,
  instant,
}: {
  placement: Placement;
  pose: Pose;
  z: number;
  instant: boolean;
}) {
  const style: CSSProperties = {
    position: "absolute",
    left: 0,
    top: 0,
    width: CARD_BASE_W,
    height: CARD_BASE_H,
    transform: `translate(${pose.x}px,${pose.y}px) rotate(${pose.rotate}deg) scale(${pose.scale})`,
    zIndex: z,
    opacity: pose.opacity,
    transition: instant ? "none" : FLIGHT,
    cursor: p.interactive ? "pointer" : "default",
    pointerEvents: p.interactive ? "auto" : "none",
    willChange: "transform",
  };
  const dataAttrs: Record<string, string> = {};
  if (p.data) for (const [k, v] of Object.entries(p.data)) if (v !== undefined) dataAttrs[`data-${k}`] = v;
  return (
    <div
      data-testid={p.testId}
      data-card-id={p.id}
      {...dataAttrs}
      style={style}
      onClick={p.interactive && p.onTap ? p.onTap : undefined}
    >
      <CardArt card={p.card} faceUp={pose.faceUp} wild={p.wild} shadow={p.shadow} />
    </div>
  );
}
