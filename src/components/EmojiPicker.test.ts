import { describe, expect, it } from "vitest";
import { insertEmojiAtSelection } from "./emojiInsertion";

describe("emoji insertion", () => {
  it("inserts at the active text selection and returns the next caret", () => {
    expect(insertEmojiAtSelection("New room", "✨", 4, 4, 20)).toEqual({
      value: "New ✨room",
      cursor: 5,
      inserted: true,
    });
  });

  it("replaces a selection without exceeding the field limit", () => {
    expect(insertEmojiAtSelection("hello work", "🎨", 6, 10, 9)).toEqual({
      value: "hello 🎨",
      cursor: 8,
      inserted: true,
    });
    expect(insertEmojiAtSelection("12345", "✨", 5, 5, 5)).toEqual({
      value: "12345",
      cursor: 5,
      inserted: false,
    });
  });
});
