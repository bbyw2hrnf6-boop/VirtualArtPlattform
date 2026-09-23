import type { RefObject } from 'react';
import { FullscreenButton } from '../../components/FullscreenButton';
import { SpaceShareMenu } from '../../components/SpaceShareMenu';
import { hashApplicationUrl } from '../../services/spaceRoutes';

type ShowcaseId = 'obsidian' | 'sculpture-pavilion' | 'forest-fold-house';

export function ShowcaseActions({ id, title, target }: {
  id: ShowcaseId;
  title: string;
  target: RefObject<HTMLElement | null>;
}) {
  return <div className="showcase-utilities">
    <SpaceShareMenu
      compact
      url={hashApplicationUrl(`/showcase/${id}`, window.location.href)}
      title={title}
      creator="LIEUVA"
      visibility="public"
      source="reference_demo"
    />
    <FullscreenButton target={target} />
  </div>;
}
