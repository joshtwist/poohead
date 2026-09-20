import type { Banner } from "../hooks/useGameEvents.ts";

/**
 * The big display-type banner ("BURN!", "Oof.") that slams in over the
 * table, plus its sub-line. Lives in the FX layer so it costs no layout.
 */
export function EventBanner({ banner }: { banner: Banner | null }) {
  if (!banner) return null;
  return (
    <div
      key={banner.key}
      data-testid="event-banner"
      data-kind={banner.kind}
      className="anim-banner-in absolute left-1/2 top-[44%] text-center pointer-events-none"
      style={{ transform: "translate(-50%,-50%)" }}
    >
      <div
        className="font-display font-extrabold whitespace-nowrap"
        style={{
          fontSize: "clamp(46px,14cqw,84px)",
          lineHeight: 0.9,
          letterSpacing: "-.05em",
          color: banner.color,
          textShadow: "0 6px 0 rgba(0,0,0,.3), 0 20px 40px rgba(0,0,0,.4)",
        }}
      >
        {banner.text}
      </div>
      {banner.sub && (
        <div
          className="mt-2 font-black text-cream whitespace-nowrap"
          style={{ fontSize: "clamp(13px,3.6cqw,19px)", textShadow: "0 2px 0 rgba(0,0,0,.4)" }}
        >
          {banner.sub}
        </div>
      )}
    </div>
  );
}
