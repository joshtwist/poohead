import type { RuleSetId } from "../../shared/rules.ts";
import { RULE_SETS, RULE_SET_IDS } from "../../shared/rules.ts";

interface RulesPickerProps {
  value: RuleSetId;
  onChange?: (id: RuleSetId) => void;
  /** Non-hosts see the picker read-only. */
  disabled?: boolean;
}

/** One-line pitch per rule set (the design copy). */
const PITCH: Record<RuleSetId, string> = {
  millybims: "Wild 7s send it lower. 8s are invisible.",
  ukpub: "3s invisible, 7s go lower, 8s skip a player.",
  standard: "2 resets, 10 burns. Nothing fancy.",
};

/** Three rule cards in a row; the selected one glows lime. */
export function RulesPicker({ value, onChange, disabled = false }: RulesPickerProps) {
  return (
    <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="House rules">
      {RULE_SET_IDS.map((id) => {
        const rs = RULE_SETS[id];
        const selected = id === value;
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={selected}
            data-testid={`rules-${id}`}
            data-selected={selected ? "true" : undefined}
            disabled={disabled}
            onClick={() => onChange?.(id)}
            className={`text-left rounded-2xl flex flex-col gap-1 text-cream transition-[transform,background] duration-150 ${
              disabled ? "cursor-default" : "cursor-pointer hover:-translate-y-0.5"
            }`}
            style={{
              padding: "12px 12px 10px",
              minHeight: "clamp(78px,20cqw,100px)",
              border: `2px solid ${selected ? "#D4FF4F" : "rgba(255,247,232,.14)"}`,
              background: selected ? "rgba(212,255,79,.12)" : "rgba(255,247,232,.06)",
            }}
          >
            <div
              className="font-display font-extrabold"
              style={{ fontSize: "clamp(14px,3.8cqw,17px)", color: selected ? "#D4FF4F" : "#FFF7E8", letterSpacing: "-.01em" }}
            >
              {rs.name}
            </div>
            <div className="font-bold text-muted" style={{ fontSize: "clamp(11px,2.9cqw,13px)", lineHeight: 1.3 }}>
              {PITCH[id]}
            </div>
          </button>
        );
      })}
    </div>
  );
}
