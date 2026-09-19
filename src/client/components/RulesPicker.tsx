import { useState } from "react";
import { Check, ChevronDown, ChevronUp } from "lucide-react";
import type { RuleSetId } from "../../shared/rules.ts";
import { RULE_SETS, RULE_SET_IDS } from "../../shared/rules.ts";

interface RulesPickerProps {
  value: RuleSetId;
  onChange?: (id: RuleSetId) => void;
  /** Non-hosts see the picker read-only. */
  disabled?: boolean;
}

/** Three radio cards, one per rule set, with an expandable rules list. */
export function RulesPicker({ value, onChange, disabled = false }: RulesPickerProps) {
  const [open, setOpen] = useState(false);
  const active = RULE_SETS[value];

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2" role="radiogroup" aria-label="Rules">
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
              className={`text-left rounded-xl p-3 border transition-colors duration-150 ${
                disabled ? "cursor-default" : "cursor-pointer"
              } ${
                selected
                  ? "bg-gold/15 border-gold/60"
                  : "bg-slate-900/60 border-slate-700 hover:border-slate-500"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className={`font-semibold ${selected ? "text-gold" : "text-white"}`}>
                  {rs.name}
                </span>
                {selected && <Check className="w-4 h-4 text-gold flex-shrink-0" strokeWidth={3} />}
              </div>
              <div className="text-xs text-slate-400 mt-1 leading-snug">{rs.blurb}</div>
            </button>
          );
        })}
      </div>

      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="self-start text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1 cursor-pointer px-1 py-1"
        data-testid="rules-details-toggle"
      >
        {open ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        {open ? "Hide" : "Show"} {active.name} rules
      </button>
      {open && (
        <ul className="text-sm text-slate-300 flex flex-col gap-1.5 pl-4 list-disc" data-testid="rules-details">
          {active.details.map((d) => (
            <li key={d}>{d}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
