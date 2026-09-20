import { motion, AnimatePresence } from "framer-motion";

interface ErrorToastProps {
  message: string | null;
}

export function ErrorToast({ message }: ErrorToastProps) {
  return (
    <AnimatePresence>
      {message && (
        <motion.div
          initial={{ y: -50, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -50, opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed top-4 left-1/2 -translate-x-1/2 z-[60] bg-pink text-cream px-4 py-3 rounded-2xl flex items-center gap-2 max-w-[90vw] font-extrabold text-sm"
          style={{ boxShadow: "0 6px 0 #B0246B, 0 12px 20px rgba(0,0,0,.3)" }}
        >
          <span aria-hidden>⚠️</span>
          <span>{message}</span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
