import { useRef } from "react";

const EMOJI_CHOICES = [
  ["✨", "Sparkles"], ["🎨", "Palette"], ["🖼️", "Framed picture"], ["🏛️", "Museum"],
  ["💡", "Idea"], ["🔍", "Looking closely"], ["🧩", "Piece"], ["🛠️", "Work in progress"],
  ["👏", "Applause"], ["❤️", "Heart"], ["🔥", "Fire"], ["🙌", "Celebration"],
  ["😊", "Smile"], ["🤍", "White heart"], ["👀", "Looking"], ["💬", "Conversation"],
] as const;

export function EmojiPicker({
  label = "Add emoji",
  disabled = false,
  onSelect,
}: {
  label?: string;
  disabled?: boolean;
  onSelect: (emoji: string) => void;
}) {
  const details = useRef<HTMLDetailsElement>(null);
  return (
    <details ref={details} style={{ position: "absolute", right: 10, bottom: 10, color: "inherit" }}>
      <summary aria-label={label} aria-disabled={disabled} onClick={(event) => { if (disabled) event.preventDefault(); }} style={{ display: "grid", width: 38, height: 38, placeItems: "center", border: "1px solid", borderRadius: "50%", listStyle: "none", cursor: disabled ? "not-allowed" : "pointer", fontSize: 19, opacity: disabled ? .4 : 1 }}>
        <span aria-hidden="true">☺</span>
      </summary>
      <div role="group" aria-label="Choose an emoji" style={{ position: "absolute", zIndex: 80, right: 0, bottom: 44, display: "grid", width: 208, gridTemplateColumns: "repeat(4,1fr)", padding: 8, border: "1px solid #aaa89f", background: "#fffdf8", color: "#171814" }}>
        {EMOJI_CHOICES.map(([emoji, name]) => (
          <button
            type="button"
            aria-label={`Insert ${name}`}
            title={name}
            key={emoji}
            style={{ height: 40, border: 0, background: "transparent", fontSize: 21, cursor: "pointer" }}
            onClick={() => {
              onSelect(emoji);
              if (details.current) details.current.open = false;
            }}
          >{emoji}</button>
        ))}
      </div>
    </details>
  );
}
