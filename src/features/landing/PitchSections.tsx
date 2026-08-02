import './scrollGalleryStory.css';

const USE_CASES = [
  ['Artists', 'Turn a focused body of work into a spatial exhibition and share it through one browser link.'],
  ['Galleries', 'Prototype a hang, present a programme, or give remote collectors a stronger sense of scale.'],
  ['Museums', 'Explore digital interpretation and accessible online viewing with a tightly scoped pilot.'],
  ['Brands & agencies', 'Build an art-led launch, cultural story, or client presentation around a custom brief.']
] as const;

const FAQS = [
  ['Do I need Blender or 3D software?', 'No. The current builder creates its rooms in the browser. The Danny Hirsch reference demo uses a separate GLB asset, but a general Blender import pipeline is not part of the MVP yet.'],
  ['What can I publish today?', 'You can choose one of three room templates, upload artwork, arrange the room, preview it, and publish a public browser link. Current MVP links remain live for ten days.'],
  ['Can I make a private or permanent gallery?', 'Not in the current public MVP. Private review links, permanent exhibitions, custom domains, and managed institutional access belong to the pilot roadmap.'],
  ['Who owns the uploaded artwork?', 'Only upload work you have the right to share. Formal rights, retention, privacy, and institutional data terms must be agreed before a production pilot.'],
  ['Which devices are supported?', 'Visitors can enter on modern desktop and mobile browsers. Building works on mobile through a resizable tool sheet; desktop remains the most precise arrangement surface.']
] as const;

export function PitchSections() {
  return (
    <div className="aura-pitch">
      <section className="aura-use-cases" aria-labelledby="aura-use-cases-title">
        <div className="aura-section-heading">
          <p>Made for more than a portfolio</p>
          <h2 id="aura-use-cases-title">One platform.<br /><em>Four perspectives.</em></h2>
          <span>AURA is an early working product. Each use case starts with the same proof: a room you can enter, edit, and share.</span>
        </div>
        <div className="aura-use-case-grid">
          {USE_CASES.map(([title, body], index) => (
            <article key={title}>
              <span>{String(index + 1).padStart(2, '0')}</span>
              <h3>{title}</h3>
              <p>{body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="aura-pilot" aria-labelledby="aura-pilot-title">
        <div>
          <p>Current access</p>
          <h2 id="aura-pilot-title">Try the MVP.<br /><em>Scope the pilot.</em></h2>
        </div>
        <div className="aura-pilot-options">
          <article>
            <span>For artists · Local MVP ready</span>
            <h3>10-day public exhibition</h3>
            <p>Build with three browser-rendered templates, arrange up to the room limit, preview, publish, and share.</p>
            <a href="#/create">Create a gallery <b>↗</b></a>
          </article>
          <article>
            <span>For organisations · Scoped pilot</span>
            <h3>Institution or brand pilot</h3>
            <p>Use the live Danny demo to evaluate visual quality first. Privacy, duration, support, analytics, and custom delivery require a written pilot scope.</p>
            <a href="#/demo">Review the live demo <b>→</b></a>
          </article>
        </div>
      </section>

      <section className="aura-trust" aria-labelledby="aura-trust-title">
        <div>
          <p>Clear by design</p>
          <h2 id="aura-trust-title">What the MVP<br /><em>does today.</em></h2>
        </div>
        <dl>
          <div><dt>Runtime</dt><dd>Procedural Three.js rooms run in the browser. No builder claim depends on a Blender pipeline.</dd></div>
          <div><dt>Publishing</dt><dd>Published galleries are currently public, discoverable, and scheduled to expire after ten days.</dd></div>
          <div><dt>Artwork</dt><dd>Uploads are prepared for the gallery in-browser. Do not use confidential work in the public MVP.</dd></div>
          <div><dt>Pilot readiness</dt><dd>Private links, permanent URLs, rights terms, analytics, and support must be scoped before organisational use.</dd></div>
        </dl>
      </section>

      <section className="aura-faq" id="pilot-faq" aria-labelledby="aura-faq-title">
        <div className="aura-section-heading">
          <p>Before you enter</p>
          <h2 id="aura-faq-title">Good questions.<br /><em>Straight answers.</em></h2>
        </div>
        <div className="aura-faq-list">
          {FAQS.map(([question, answer], index) => (
            <details key={question} open={index === 0}>
              <summary><span>{String(index + 1).padStart(2, '0')} · {question}</span><i aria-hidden="true">+</i></summary>
              <p>{answer}</p>
            </details>
          ))}
        </div>
      </section>
    </div>
  );
}
