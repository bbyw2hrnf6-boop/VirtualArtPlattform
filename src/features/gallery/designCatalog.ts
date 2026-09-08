import type { DecorPlacement, DecorId, FloorFinish, WallFinish } from "./types";

export const WALL_OPTIONS: [WallFinish, string, string][] = [
  ["chalk", "linear-gradient(135deg,#f1eee6,#cfcac0)", "plaster"],
  ["warm", "linear-gradient(135deg,#c99478,#8f5545)", "clay limewash"],
  ["light-concrete", "linear-gradient(135deg,#d6d6d4,#aeb0b0)", "light concrete"],
  ["charcoal", "linear-gradient(135deg,#3a3c39,#202220)", "dark concrete"],
  ["microcement", "linear-gradient(135deg,#a9a398,#777970)", "greige microcement"],
  ["limestone", "linear-gradient(135deg,#e4bb72,#b67832)", "gold sandstone"],
  ["oak-slats", "repeating-linear-gradient(90deg,#b58d5c 0 8px,#1f1b17 9px 12px)", "light oak slats"],
  ["black-slats", "repeating-linear-gradient(90deg,#272827 0 8px,#050606 9px 12px)", "black oak slats"],
  ["marble-wall", "linear-gradient(135deg,#f0eee8 38%,#9b9d99 40%,#e3e0d8 43%)", "white marble"],
  ["dark-stone", "linear-gradient(135deg,#15241f,#445148 52%,#202a25)", "green stone"],
              
  ["travertine", "#d7cbb6", "roman travertine"],
  ["linen", "#c8c0b3", "woven linen"],
  ["sage", "#8c9b88", "sage plaster"],
  ["ink-blue", "#344752", "ink blue paint"],
  ["dusty-rose", "#b98f89", "rose limewash"],
  ["sand", "#c7b697", "sand plaster"],
];

export const FLOOR_OPTIONS: [FloorFinish, string, string][] = [
  ["concrete", "linear-gradient(135deg,#777672,#a7a39a)", "mineral concrete"],
  ["dark-concrete", "linear-gradient(135deg,#303231,#595b58)", "dark polished concrete"],
  ["microcement", "linear-gradient(135deg,#b8aa95,#8e8272)", "warm microcement"],
  ["slate", "linear-gradient(135deg,#171918,#444845 48%,#222422)", "black slate"],
  ["travertine-floor", "repeating-linear-gradient(0deg,#d8c8aa 0 3px,#e9ddc8 4px 9px)", "beige travertine"],
  ["marble", "linear-gradient(135deg,#ece9e1 35%,#8c8f8c 37%,#e2ded4 40%)", "white marble"],
  ["black-marble", "linear-gradient(135deg,#111 35%,#b8b8b3 37%,#191919 40%)", "black marble"],
  ["walnut", "repeating-linear-gradient(0deg,#392116 0 8px,#6b4028 9px 16px)", "walnut"],
  ["oak", "repeating-linear-gradient(90deg,#c59a66 0 12px,#d6b17f 13px 25px)", "natural oak"],
  ["terrazzo", "radial-gradient(circle at 20% 25%,#777 0 2px,transparent 3px),radial-gradient(circle at 65% 70%,#b78f76 0 2px,#d8d4ca 3px)", "light terrazzo"],
              
  ["dark-oak", "#443329", "smoked oak"],
  ["cork", "#aa8153", "natural cork"],
  ["terracotta", "#a65f43", "terracotta tile"],
  ["basalt-terrazzo", "radial-gradient(circle at 30% 40%,#d2b999 0 2px,#303536 3px)", "basalt terrazzo"],
  ["parquet", "repeating-conic-gradient(#b58b61 0 25%,#88613e 0 50%) 0/16px 16px", "basketweave oak"],
];

export const DECOR_CATALOG: Array<{ id: DecorId; name: string; size: string }> = [
  { id: "olive", name: "Olive tree", size: "1.8 m high · 1.25 m footprint" },
  {
    id: "snake-plant",
    name: "Snake plant",
    size: "1.0 m high · 0.78 m footprint",
  },
  { id: "arc-lamp", name: "Arc lamp", size: "2.75 m high · 2.05 × 0.9 m" },
  { id: "pedestal", name: "Pedestal", size: "1.27 m high · 1.05 m square" },
  { id: "leather-bench", name: "Leather bench", size: "2.45 × 0.92 m footprint" },
  {
    id: "stone-sculpture",
    name: "Stone study",
    size: "1.7 m high · 1.2 m footprint",
  },
  { id: "monstera", name: "Monstera", size: "Broad leaves · 1.55 m footprint" },
  { id: "floor-vase", name: "Branch vase", size: "Ceramic · 0.85 m footprint" },
  { id: "wood-stool", name: "Walnut stool", size: "Three legs · 0.72 m footprint" },
  { id: "rope-barrier", name: "Rope barrier", size: "Brass · 2.25 × 0.58 m" },
  { id: "lounge-chair", name: "Lounge chair", size: "Bouclé · 1.12 m square" },
  { id: "stone-table", name: "Stone table", size: "Low table · 1.40 × 0.90 m" },
  { id: "light-column", name: "Light column", size: "Opal glass · 0.64 m footprint" },
];

// Older saved variants remain readable, but are not offered as extra copies.
export function catalogObject(decor: DecorPlacement[], type: DecorId) {
  return decor.find(item => item.type === type ||
    (item.type === "ficus" && type === "monstera") ||
    (item.type === "gallery-bench" && type === "leather-bench"));
}
