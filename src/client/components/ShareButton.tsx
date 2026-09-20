import { useState } from "react";

interface ShareButtonProps {
  gameId: string;
}

/** Outlined glass button: native share sheet where there is one, else copies the link. */
export function ShareButton({ gameId }: ShareButtonProps) {
  const [copied, setCopied] = useState(false);
  const url = typeof window !== "undefined" ? `${window.location.origin}/${gameId}` : "";

  async function handleShare() {
    // Prefer the native share sheet on mobile. Title + url only, so
    // messaging apps don't prepend a sentence to the link.
    if (navigator.share) {
      try {
        await navigator.share({ title: "Join my 💩head game!", url });
        return;
      } catch {
        // Cancelled -- fall through to the clipboard
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard not available -- best-effort no-op
    }
  }

  return (
    <button
      onClick={handleShare}
      data-testid="share-btn"
      className="w-full rounded-[18px] flex items-center justify-center gap-2.5 font-display font-bold text-cream cursor-pointer transition-colors duration-150 hover:bg-cream/16"
      style={{
        height: "clamp(48px,12cqw,58px)",
        border: "2px solid rgba(255,247,232,.25)",
        background: "rgba(255,247,232,.08)",
        fontSize: "clamp(15px,4cqw,18px)",
      }}
    >
      <span className="text-lg" aria-hidden>
        🔗
      </span>
      {copied ? "Copied! Send it round." : "Copy invite link"}
    </button>
  );
}
