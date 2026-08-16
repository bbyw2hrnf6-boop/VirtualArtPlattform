import './pitchSections.css';

const USE_CASES = [
  ['Artists', 'Turn a focused body of work into a spatial exhibition and share it through one browser link.'],
  ['Galleries', 'Prototype a hang, present a programme, or give remote collectors a stronger sense of scale.'],
  ['Museums', 'Explore digital interpretation and accessible online viewing with a tightly scoped pilot.'],
  ['Brands & agencies', 'Build an art-led launch, cultural story, or client presentation around a custom brief.']
] as const;

const FAQS = [
  ['Do I need Blender or 3D software?', 'No. The current builder creates its rooms in the browser. The Danny Hirsch reference demo uses a separate GLB asset, but a general Blender import pipeline is not part of the MVP yet.'],
  ['What can I publish today?', 'You can build and Walk Preview without an account. Publishing requires a verified email or Google account, with public, unlisted, or private access during the preview.'],
  ['How does private access work?', 'The owner invites verified accounts as viewers or editors. Viewers can enter private rooms; Editors can update room content under the same share URL. Only the Owner manages access and deletion. Permanent hosting and billing are not active.'],
  ['Where are artwork files stored?', 'Published artwork and covers use Firebase Storage. Room data and access roles use Firestore. Only upload work you have the right to share.'],
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
          <h2 id="aura-pilot-title">Start simply.<br /><em>Grow when ready.</em></h2>
        </div>
        <div className="aura-pilot-options">
          <article>
            <span>Light Preview · Free now</span>
            <h3>Build before signing in</h3>
            <p>Build, arrange, and Walk Preview without an account. Your local draft stays with you until you are ready to publish.</p>
            <a href="#/create">Create a gallery <b>↗</b></a>
          </article>
          <article>
            <span>Light Preview account · Free now</span>
            <h3>Control who enters</h3>
            <p>Use a verified email or Google account to publish public, unlisted, or private rooms, update live rooms, and invite Viewers or Editors.</p>
            <a href="#/create">Build with an account <b>→</b></a>
          </article>
          <article className="is-coming" aria-disabled="true">
            <span>Paid plans · Coming later</span>
            <h3>Artist & institution</h3>
            <p>Long-term hosting, richer collaboration history, custom domains, analytics, and managed support are prepared for a later paid release.</p>
            <button disabled>Billing not active</button>
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
          <div><dt>Publishing</dt><dd>Building and Walk Preview need no account. Publishing and role-based access require a verified account.</dd></div>
          <div><dt>Artwork</dt><dd>Published artwork and covers live in Firebase Storage; room configuration and access live in Firestore.</dd></div>
          <div><dt>Limits</dt><dd>Billing, permanent hosting, simultaneous co-editing, analytics, and custom domains are not active yet.</dd></div>
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
