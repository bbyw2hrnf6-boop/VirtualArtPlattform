export function insertEmojiAtSelection(
  value: string,
  emoji: string,
  selectionStart: number | null | undefined,
  selectionEnd: number | null | undefined,
  maximumLength: number,
) {
  const start = Math.max(0, Math.min(value.length, selectionStart ?? value.length));
  const end = Math.max(start, Math.min(value.length, selectionEnd ?? start));
  const nextValue = `${value.slice(0, start)}${emoji}${value.slice(end)}`;
  if (nextValue.length > maximumLength) return { value, cursor: start, inserted: false };
  return { value: nextValue, cursor: start + emoji.length, inserted: true };
}
