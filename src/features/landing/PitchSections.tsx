import './pitchSections.css';

const CREATOR_VALUE = [
  ['Scale people understand', 'Let visitors experience distance, sequence, and relationships that disappear inside a flat image grid.'],
  ['A visit, not a slide deck', 'Guide attention through a room while leaving people free to pause, look closer, and move at their own pace.'],
  ['One link to return to', 'Publish a presentation that opens in the browser and can be shared with collaborators, clients, or an audience.']
] as const;

const FAQS = [
  ['Do I need Blender or 3D software?', 'No. LIEUVA Studio creates each template Space directly in the browser. Choose a room, arrange your work, preview the visit, and publish from one workflow.'],
  ['What can I publish today?', 'You can build and Walk Preview without an account. A verified email or Google account lets you publish with public, unlisted, or private access.'],
  ['How does private access work?', 'The Owner invites verified accounts as Viewers or Editors. Viewers can enter private Spaces; Editors can update content under the same share URL. Only the Owner manages access and deletion. Permanent hosting and billing are not active.'],
  ['Where are work files stored?', 'Published images and covers use Firebase Storage. Space data and access roles use Firestore. Only upload work you have the right to share.'],
  ['Which devices are supported?', 'Visitors can enter on modern desktop and mobile browsers. LIEUVA Studio works on mobile through a resizable tool sheet; desktop remains the most precise arrangement surface.']
] as const;

export function PitchSections() {
  return (
    <div className="aura-pitch">
      <section className="aura-use-cases" aria-labelledby="aura-use-cases-title">
        <div className="aura-section-heading">
          <p>Why creators use space</p>
          <h2 id="aura-use-cases-title">More than an image grid.<br /><em>Work people can enter.</em></h2>
          <span>LIEUVA gives visual work a sense of place while keeping the path from first upload to shareable Space direct.</span>
        </div>
        <div className="aura-use-case-grid">
          {CREATOR_VALUE.map(([title, body], index) => (
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
            <span>Studio access · Available now</span>
            <h3>Build before signing in</h3>
            <p>Build, arrange, and Walk Preview without an account. Your local draft stays with you until you are ready to publish.</p>
            <a href="#/create">Create a Space <b>↗</b></a>
          </article>
          <article>
            <span>Publishing access · Available now</span>
            <h3>Control who enters</h3>
            <p>Use a verified email or Google account to publish public, unlisted, or private Spaces, update live Spaces, and invite Viewers or Editors.</p>
            <a href="#/create">Open Studio <b>→</b></a>
          </article>
          <article className="is-coming" aria-disabled="true">
            <span>Professional plans · In development</span>
            <h3>Creator &amp; team</h3>
            <p>Long-term hosting, richer collaboration history, custom domains, analytics, and managed support are prepared for a later paid release.</p>
            <button disabled>Billing not active</button>
          </article>
        </div>
      </section>

      <section className="aura-trust" aria-labelledby="aura-trust-title">
        <div>
          <p>Clear by design</p>
          <h2 id="aura-trust-title">What LIEUVA<br /><em>does today.</em></h2>
        </div>
        <dl>
          <div><dt>Studio</dt><dd>Browser-native spatial tools keep room selection, artwork placement, lighting, preview and publishing in one workflow.</dd></div>
          <div><dt>Publishing</dt><dd>Building and Walk Preview need no account. Publishing and role-based access require a verified account.</dd></div>
          <div><dt>Content</dt><dd>Published artwork and covers live in Firebase Storage; Space configuration and access live in Firestore.</dd></div>
          <div><dt>Roadmap</dt><dd>Billing, permanent hosting, simultaneous co-editing, creator analytics, and custom domains are still in development.</dd></div>
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
