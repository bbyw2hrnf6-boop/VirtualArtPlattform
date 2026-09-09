/** One visual preparation contract from route loading through GPU readiness. */
export function SpaceLoading({ title = 'Preparing your Space', detail = 'Opening your room…', progress, ready = false }: {
  title?: string; detail?: string; progress?: number; ready?: boolean;
}) {
  return <div className={`space-arrival space-arrival--page${ready ? ' is-ready' : ''}`} role="status" aria-live="polite" aria-hidden={ready}>
    <p>LIEUVA / PREPARING YOUR SPACE</p><strong>{title}</strong>
    <progress max={100} value={progress} aria-label="Space preparation progress" />
    <span>{detail}</span>
  </div>;
}
