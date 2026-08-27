import type { Artwork, ArtworkFrame, ArtworkMat } from "./types";

export const ARTWORK_FRAME_OPTIONS: ReadonlyArray<{
  id: ArtworkFrame;
  label: string;
}> = [
  { id: "black", label: "Thin Black" },
  { id: "white", label: "Thin White" },
  { id: "oak", label: "Natural Wood" },
  { id: "dark-wood", label: "Dark Wood" },
  { id: "metal", label: "Brushed Metal" },
  { id: "none", label: "Frameless" },
];

export const ARTWORK_MAT_OPTIONS: ReadonlyArray<{
  id: ArtworkMat;
  label: string;
}> = [
  { id: "white", label: "Gallery White" },
  { id: "warm-white", label: "Warm White" },
  { id: "black", label: "Black" },
  { id: "none", label: "No Mat" },
];

export type ArtworkPresentationMetrics = {
  imageWidth: number;
  imageHeight: number;
  matBorder: number;
  frameBorder: number;
  outerWidth: number;
  outerHeight: number;
  depth: number;
};

export function artworkPresentationMetrics(
  artwork: Pick<Artwork, "aspect" | "scale" | "frame" | "mat">,
): ArtworkPresentationMetrics {
  const imageHeight = 1.5 * artwork.scale;
  const imageWidth = imageHeight * artwork.aspect;
  const shortestEdge = Math.min(imageWidth, imageHeight);
  const matBorder =
    (artwork.mat ?? "none") === "none"
      ? 0
      : Math.min(0.18, Math.max(0.065, shortestEdge * 0.085));
  const frame = artwork.frame ?? "black";
  const frameBorder =
    frame === "none"
      ? 0.008
      : frame === "oak" || frame === "dark-wood"
        ? Math.min(0.085, Math.max(0.05, shortestEdge * 0.038))
        : Math.min(0.065, Math.max(0.038, shortestEdge * 0.03));
  const depth =
    frame === "none"
      ? 0.026
      : frame === "oak" || frame === "dark-wood"
        ? 0.078
        : 0.052;
  return {
    imageWidth,
    imageHeight,
    matBorder,
    frameBorder,
    outerWidth: imageWidth + (matBorder + frameBorder) * 2,
    outerHeight: imageHeight + (matBorder + frameBorder) * 2,
    depth,
  };
}

export function artworkFrameLabel(frame: ArtworkFrame) {
  return ARTWORK_FRAME_OPTIONS.find((option) => option.id === frame)?.label ?? frame;
}

export function artworkMatLabel(mat: ArtworkMat) {
  return ARTWORK_MAT_OPTIONS.find((option) => option.id === mat)?.label ?? mat;
}
