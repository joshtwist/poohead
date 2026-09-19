import { motion, AnimatePresence } from "framer-motion";
import type { Banner } from "../hooks/useGameEvents.ts";

/**
 * Short-lived pill announcing what just happened (burn, pick-up, skip,
 * someone going out…). Overlaid on the table so it costs no layout.
 */
export function EventBanner({ banner }: { banner: Banner | null }) {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-[38%] flex justify-center z-40 px-4">
      <AnimatePresence mode="wait">
        {banner && (
          <motion.div
            key={banner.key}
            data-testid="event-banner"
            data-kind={banner.kind}
            initial={{ opacity: 0, y: 12, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, scale: 0.95, transition: { duration: 0.2 } }}
            transition={{ type: "spring", stiffness: 380, damping: 26 }}
            className={`px-4 py-2 rounded-2xl shadow-xl text-sm tablet:text-base font-semibold text-center max-w-[92vw] border ${
              banner.tone === "gold"
                ? "bg-gold text-slate-900 border-amber-300"
                : banner.tone === "poo"
                  ? "bg-poo text-white border-poo-light"
                  : "bg-slate-900/90 text-white border-white/10"
            }`}
          >
            {banner.text}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
