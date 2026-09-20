import { PLAYER_ICONS } from "../../shared/types.ts";
import type { PlayerIcon } from "../../shared/types.ts";
import { ICON_EMOJI, PICKER_COLORS } from "../lib/icons.ts";

interface IconPickerProps {
  selected: PlayerIcon | null;
  onSelect: (icon: PlayerIcon) => void;
  disabledIcons?: PlayerIcon[];
}

/** Emoji faces on coloured discs; the chosen one gets the lime ring. */
export function IconPicker({ selected, onSelect, disabledIcons = [] }: IconPickerProps) {
  return (
    <div className="grid grid-cols-5 gap-2.5 justify-items-center">
      {PLAYER_ICONS.map((icon, i) => {
        const isSelected = selected === icon;
        const isDisabled = disabledIcons.includes(icon);
        return (
          <button
            key={icon}
            type="button"
            data-testid={`icon-${icon}`}
            onClick={() => !isDisabled && onSelect(icon)}
            disabled={isDisabled}
            title={isDisabled ? "Taken" : undefined}
            aria-label={isDisabled ? `${icon} (taken)` : icon}
            className={`relative rounded-full flex items-center justify-center transition-transform duration-150 ${
              isDisabled ? "cursor-not-allowed" : "cursor-pointer hover:scale-105"
            }`}
            style={{
              width: "clamp(48px,12cqw,60px)",
              height: "clamp(48px,12cqw,60px)",
              fontSize: "clamp(24px,6cqw,30px)",
              background: isDisabled ? "rgba(255,247,232,.08)" : PICKER_COLORS[i % PICKER_COLORS.length],
              border: isDisabled ? "2px dashed rgba(255,247,232,.25)" : "none",
              opacity: isDisabled ? 0.55 : 1,
              filter: isDisabled ? "grayscale(1)" : "none",
              boxShadow: isSelected
                ? "inset 0 -3px 0 rgba(0,0,0,.18), 0 0 0 3px #2B1743, 0 0 0 6px #D4FF4F"
                : "inset 0 -3px 0 rgba(0,0,0,.18)",
              transform: isSelected ? "scale(1.1)" : undefined,
            }}
          >
            {ICON_EMOJI[icon]}
          </button>
        );
      })}
    </div>
  );
}
