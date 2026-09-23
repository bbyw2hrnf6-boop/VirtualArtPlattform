type ShowcaseItem = {
  id: "art-exhibitions" | "sculpture-3d" | "architecture";
  meta: string;
  title: string;
  description: string;
  sceneHref?: string;
  sceneName?: string;
  cover?: string;
  alt?: string;
};

const SHOWCASES: readonly ShowcaseItem[] = [
  {
    id: "art-exhibitions",
    sceneHref: "#/showcase/obsidian",
    sceneName: "Obsidian", cover: "/assets/showcases/obsidian/cover.webp",
    alt: "Obsidian: three connected galleries in walnut, stone and warm light",
    meta: "01 / Art & culture",
    title: "Art exhibitions",
    description: "Bespoke exhibition worlds shaped around art, story and atmosphere.",
  },
  {
    id: "sculpture-3d",
    sceneHref: "#/showcase/sculpture-pavilion", sceneName: "Sculpture Pavilion",
    cover: "/assets/showcases/sculpture-pavilion/cover.webp?v=2",
    alt: "Sculpture Pavilion: original sculptural forms beneath an elliptical skylight",
    meta: "02 / Objects & form",
    title: "Sculpture & 3D",
    description: "Custom digital showrooms for sculpture, objects and three-dimensional work.",
  },
  {
    id: "architecture",
    sceneHref: "#/showcase/forest-fold-house", sceneName: "Forest Fold House",
    cover: "/assets/showcases/forest-fold-house/cover.webp?v=3",
    alt: "Forest Fold House: two planted stone wings and one glass bridge above a woodland watercourt",
    meta: "03 / Spaces & living",
    title: "Architecture",
    description: "Real or imagined rooms, homes and buildings rebuilt as walkable digital experiences.",
  },
] as const;

export function ShowcaseCollection() {
  return (
    <section className="showcase-collection" aria-labelledby="showcase-collection-title">
      <header className="showcase-collection__intro">
        <p className="eyebrow">Beyond the Studio</p>
        <h2 id="showcase-collection-title">
          <span>See what’s possible.</span>
          <em>Art. Objects. Architecture.</em>
        </h2>
        <p>Enter Obsidian, Sculpture Pavilion and Forest Fold House. Discover what individually authored worlds can become.</p>
      </header>

      <div className="showcase-collection__grid">
        {SHOWCASES.map((showcase) => {
          const actionLabel = showcase.sceneHref ? `Explore ${showcase.sceneName}` : "Bespoke project on request";
          return <article className="showcase-card" key={showcase.id}>
            <a className={`showcase-card__media showcase-card__media--${showcase.id}`} href={showcase.sceneHref}>
              {showcase.sceneHref ? <img src={showcase.cover} alt={showcase.alt} loading="lazy" style={{ position:"absolute", inset:0, width:"100%", height:"100%", objectFit:"cover" }} /> : <span className="showcase-card__composition" aria-hidden="true"><i /><i /><i /></span>}
              <span className="showcase-card__status">{showcase.sceneHref ? `Enter ${showcase.sceneName} ↗` : "Showcase coming soon"}</span>
            </a>
            <p className="showcase-card__meta">{showcase.meta}</p>
            <h3>{showcase.title}</h3>
            <p className="showcase-card__description">{showcase.description}</p>
            <a
              className={`showcase-card__action${showcase.sceneHref ? " showcase-card__action--available" : ""}`}
              href={showcase.sceneHref ?? "#bespoke-projects"}
              aria-label={`${actionLabel}: ${showcase.title}`}
            >
              {actionLabel}
            </a>
          </article>;
        })}
      </div>

      <aside className="bespoke-projects" id="bespoke-projects" aria-labelledby="bespoke-projects-title">
        <div className="bespoke-projects__copy">
          <p className="eyebrow">Custom 3D experiences</p>
          <h3 id="bespoke-projects-title">From real rooms to digital worlds.</h3>
          <p>From a room scan, photographs or plans, I recreate galleries, interiors, homes and buildings as custom, walkable 3D experiences. Each project is built individually and available on request.</p>
        </div>
        <div className="bespoke-projects__contact">
          <span className="bespoke-projects__contact-pending">Discuss a bespoke project</span>
          <small>Contact route coming soon</small>
        </div>
      </aside>
    </section>
  );
}
