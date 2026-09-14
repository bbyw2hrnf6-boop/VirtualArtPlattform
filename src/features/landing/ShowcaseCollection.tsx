type ShowcaseItem = {
  id: "art-exhibitions" | "sculpture-3d" | "architecture";
  meta: string;
  title: string;
  description: string;
  sceneHref?: string;
};

const SHOWCASES: readonly ShowcaseItem[] = [
  {
    id: "art-exhibitions",
    meta: "01 / Art & culture",
    title: "Art exhibitions",
    description: "Curated worlds for art and stories.",
  },
  {
    id: "sculpture-3d",
    meta: "02 / Objects & form",
    title: "Sculpture & 3D",
    description: "Give objects a space of their own.",
  },
  {
    id: "architecture",
    meta: "03 / Spaces & living",
    title: "Architecture",
    description: "Walk through spaces before they exist.",
  },
] as const;

export function ShowcaseCollection({ onOpenStudio }: { onOpenStudio: () => void }) {
  return (
    <section className="showcase-collection" aria-labelledby="showcase-collection-title">
      <header className="showcase-collection__intro">
        <p className="eyebrow">Explore LIEUVA</p>
        <h2 id="showcase-collection-title">
          <span>See what’s possible.</span>
          <em>Art. Objects. Architecture.</em>
        </h2>
        <p>Discover immersive exhibitions, sculptural collections and architectural spaces.</p>
      </header>

      <div className="showcase-collection__grid">
        {SHOWCASES.map((showcase) => {
          const studio = showcase.id === "art-exhibitions";
          const actionLabel = studio ? "Create your own in Studio" : "Available on request";
          return <article className="showcase-card" key={showcase.id}>
            <a className={`showcase-card__media showcase-card__media--${showcase.id}`} href={showcase.sceneHref}>
              <span className="showcase-card__composition" aria-hidden="true"><i /><i /><i /></span>
              <span className="showcase-card__status">{showcase.sceneHref ? `Enter ${showcase.title} ↗` : "Showcase coming soon"}</span>
            </a>
            <p className="showcase-card__meta">{showcase.meta}</p>
            <h3>{showcase.title}</h3>
            <p className="showcase-card__description">{showcase.description}</p>
            <a
              className={`showcase-card__action${studio ? " showcase-card__action--studio" : ""}`}
              href={studio ? "#/create" : "#bespoke-projects"}
              aria-label={`${actionLabel}: ${showcase.title}`}
              onClick={studio ? (event) => { event.preventDefault(); onOpenStudio(); } : undefined}
            >
              {actionLabel}
            </a>
          </article>;
        })}
      </div>

      <aside className="bespoke-projects" id="bespoke-projects" aria-labelledby="bespoke-projects-title">
        <div className="bespoke-projects__copy">
          <p className="eyebrow">Bespoke by LIEUVA</p>
          <h3 id="bespoke-projects-title">Your space. Reimagined in 3D.</h3>
          <p>From custom exhibitions to architectural walkthroughs. Real galleries, rooms and buildings recreated as immersive 3D spaces.</p>
        </div>
        <div className="bespoke-projects__contact">
          <span className="bespoke-projects__contact-pending">Discuss your project</span>
          <small>Contact route coming soon</small>
        </div>
      </aside>
    </section>
  );
}
