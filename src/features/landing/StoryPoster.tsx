export function StoryPosterImage({ className }: { className?: string }) {
  return <picture className={className} aria-hidden="true">
    <source media="(max-width:700px)" srcSet="./assets/templates/story/opening-mobile.webp" />
    <img src="./assets/templates/story/opening-desktop.webp" alt="" fetchPriority="high" />
  </picture>;
}

/** Real room imagery while the optional cinematic renderer warms up. No loader. */
export function StoryPoster() {
  return <section className="story-placeholder" aria-label="Create an immersive Space">
    <StoryPosterImage />
    <div><p>Immersive 3D presentation platform</p><h1>Give your work a place.</h1>
      <p>Choose a room. Bring your work. Share a space people can enter.</p>
      <a href="#/create">Create a Space ↗</a></div>
  </section>;
}
