export const HABIT_PALETTE: readonly string[] = [
  '#FF453A', '#FF9F0A', '#FFD60A', '#A3F53B', '#30D158', '#00C7BE',
  '#32D7FA', '#0A84FF', '#5E5CE6', '#BF5AF2', '#FF375F', '#AC8E68',
];

export function nextColor(used: readonly string[]): string {
  const taken = new Set(used.map((c) => c.toUpperCase()));
  return HABIT_PALETTE.find((c) => !taken.has(c)) ?? HABIT_PALETTE[used.length % HABIT_PALETTE.length];
}
