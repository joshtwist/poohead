import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { Card as CardType } from "../../shared/types.ts";
import { CARD_BASE_H, CARD_BASE_W } from "../lib/layout.ts";
import { CARD_SHADOW, CardArt } from "./Card.tsx";

/** A♠ 10♣ 7♥ 2♦ and a face-down K♠, fanned. */
const HERO: { card: CardType; faceUp: boolean; wild: boolean }[] = [
  { card: { suit: "spades", rank: "A" }, faceUp: true, wild: false },
  { card: { suit: "clubs", rank: "10" }, faceUp: true, wild: true },
  { card: { suit: "hearts", rank: "7" }, faceUp: true, wild: true },
  { card: { suit: "diamonds", rank: "2" }, faceUp: true, wild: true },
  { card: { suit: "spades", rank: "K" }, faceUp: false, wild: false },
];

/**
 * The decorative fan on the home page and in the lobby. Sized by its
 * container (one card wide); the other cards spread from the centre with
 * `t × 11°` of rotation, `t × 0.42w` sideways and a shallow `t² × 0.045h` arc.
 */
export function HeroFan({ style, className = "" }: { style?: CSSProperties; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const sc = size.w / CARD_BASE_W;
  return (
    <div ref={ref} className={`relative ${className}`} style={style} aria-hidden>
      {size.w > 0 &&
        HERO.map((h, i) => {
          const t = i - 2;
          const x = size.w / 2 - CARD_BASE_W / 2 + t * size.w * 0.42;
          const y = size.h / 2 - CARD_BASE_H / 2 + t * t * size.h * 0.045;
          return (
            <div
              key={i}
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                width: CARD_BASE_W,
                height: CARD_BASE_H,
                transform: `translate(${x}px,${y}px) rotate(${t * 11}deg) scale(${sc})`,
                zIndex: 10 + i,
              }}
            >
              <CardArt card={h.card} faceUp={h.faceUp} wild={h.wild} shadow={CARD_SHADOW.rest} />
            </div>
          );
        })}
    </div>
  );
}
