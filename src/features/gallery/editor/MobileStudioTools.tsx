import type { RefObject } from 'react';

import { STUDIO_TOOL_LABELS, type StudioTool } from './mobileStudioToolsModel';
const TOOLS = ['artwork', 'walls', 'floor', 'lighting', 'more'] as const;
const PATHS = [
  'M3 3h18v18H3z M3 16l5-5 4 4 3-3 6 6 M8 7h.01',
  'M3 7l9-4 9 4v12l-9 3-9-3z M3 7l9 4 9-4 M12 11v11',
  'M2 9l10-5 10 5-10 5z M2 14l10 5 10-5',
  'M12 1v3 M12 20v3 M1 12h3 M20 12h3 M4 4l2 2 M18 18l2 2 M4 20l2-2 M18 6l2-2 M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
  'M4 6h16 M4 12h16 M4 18h16',
];

export function MobileStudioTools({ active, onChoose, buttons }: {
  active: StudioTool | null;
  onChoose: (tool: StudioTool) => void;
  buttons: RefObject<Partial<Record<StudioTool, HTMLButtonElement | null>>>;
}) {
  return <nav className="studio-tool-dock" aria-label="Studio tools">{TOOLS.map((tool, index) => {
    const selected = active === tool || (tool === 'more' && (active === 'ceiling' || active === 'objects'));
    return <button key={tool} type="button" ref={node => { buttons.current[tool] = node; }}
      aria-label={`Edit ${STUDIO_TOOL_LABELS[tool].toLowerCase()}`} aria-expanded={selected}
      aria-controls="studio-tool-panel" onClick={() => onChoose(tool)}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={PATHS[index]} /></svg>
      <span>{STUDIO_TOOL_LABELS[tool]}</span>
    </button>;
  })}</nav>;
}
