import { EMPTY_DRAFT, type GalleryDraft } from "../types";
import {
  validateDraftPlacements,
  type PlacementIssue,
} from "./placementValidation";

export interface PublishReviewIssue {
  id: string;
  severity: "error" | "warning";
  title: string;
  detail: string;
  targetId?: string;
}

function placementReviewIssue(
  issue: PlacementIssue,
  index: number,
): PublishReviewIssue {
  return {
    id: `geometry-${issue.target}-${issue.targetId}-${issue.code}-${index}`,
    severity: "error",
    title:
      issue.target === "artwork"
        ? "Invalid artwork placement"
        : "Invalid object placement",
    detail: issue.message,
    targetId: issue.targetId,
  };
}

export function reviewGalleryForPublish(
  draft: GalleryDraft,
): PublishReviewIssue[] {
  const issues: PublishReviewIssue[] = [];
  const title = draft.title.trim();
  const artist = draft.artist.trim();
  const visibleArtworks = draft.artworks.filter((artwork) => !artwork.hidden);
  if (!title || title === EMPTY_DRAFT.title)
    issues.push({
      id: "title",
      severity: "error",
      title: "Exhibition title needed",
      detail: "Replace the placeholder with the title visitors should see.",
    });
  if (!artist || artist === EMPTY_DRAFT.artist)
    issues.push({
      id: "artist",
      severity: "error",
      title: "Artist name needed",
      detail: "Replace “Your name” before publishing.",
    });
  if (!visibleArtworks.length)
    issues.push({
      id: "artworks",
      severity: "error",
      title: "Visible artwork needed",
      detail: "Show at least one artwork for this exhibition.",
    });
  visibleArtworks.forEach((artwork, index) => {
    if (!artwork.src)
      issues.push({
        id: `source-${artwork.id}`,
        severity: "error",
        title: `Artwork ${index + 1} has no image`,
        detail: "Upload the image again before publishing.",
        targetId: artwork.id,
      });
    if (!artwork.title.trim())
      issues.push({
        id: `artwork-title-${artwork.id}`,
        severity: "error",
        title: `Artwork ${index + 1} needs a title`,
        detail: "Add a visitor-facing artwork title.",
        targetId: artwork.id,
      });
    if (!artwork.year?.trim())
      issues.push({
        id: `year-${artwork.id}`,
        severity: "warning",
        title: `Year missing for “${artwork.title || `Artwork ${index + 1}`}”`,
        detail: "A year helps visitors understand the work.",
        targetId: artwork.id,
      });
    if (!artwork.description?.trim())
      issues.push({
        id: `description-${artwork.id}`,
        severity: "warning",
        title: `Note missing for “${artwork.title || `Artwork ${index + 1}`}”`,
        detail: "A short note improves the visitor experience.",
        targetId: artwork.id,
      });
  });
  issues.push(
    ...validateDraftPlacements({ ...draft, artworks: visibleArtworks }).map(
      placementReviewIssue,
    ),
  );
  return issues;
}
