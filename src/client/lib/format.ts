/** 1 → "1st", 2 → "2nd", 3 → "3rd", 4 → "4th" … */
export function ordinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

/** "3 cards" / "1 card" */
export function cardCount(n: number): string {
  return `${n} card${n === 1 ? "" : "s"}`;
}

/** Join names: "Bob", "Bob and Carol", "Bob, Carol and Dan" */
export function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}
