import './pitchSections.css';

const FAQS = [
  ['Do I need Blender or 3D software?', 'No. LIEUVA Studio creates each template Space directly in the browser. Choose a room, arrange your work, preview the visit, and publish from one workflow.'],
  ['Can I publish without signing up?', 'Yes. Publish a public Space as a guest, without a Creator profile. It can appear in Explore for up to 7 days from first publication. The direct link remains available during the 365-day hosting preview. Quality and safety checks still apply.'],
  ['How do I keep control of a guest Space?', 'Guest control belongs to this browser’s anonymous session. Create and verify a new account here before signing out or clearing site data. Signing into an existing account does not transfer guest Spaces. Updates need a verified account and do not restart the 7-day Explore window.'],
  ['How does private access work?', 'The Owner invites verified accounts as Viewers or Editors. Viewers can enter private Spaces; Editors can update content under the same share URL. Only the Owner manages access and deletion. Permanent hosting and billing are not active.'],
  ['Where are work files stored?', 'Published images and covers use Firebase Storage. Space data and access roles use Firestore. Only upload work you have the right to share.'],
  ['Which devices are supported?', 'Visitors can enter on modern desktop and mobile browsers. LIEUVA Studio works on mobile through a resizable tool sheet; desktop remains the most precise arrangement surface.']
] as const;

export function PitchSections() {
  return (
    <div className="aura-pitch">
      <section className="aura-pilot" aria-labelledby="aura-pilot-title">
        <div>
          <p>Current access</p>
          <h2 id="aura-pilot-title">Start simply.<br /><em>Grow when ready.</em></h2>
        </div>
        <div className="aura-pilot-options">
          <article>
            <span>Guest publishing · 7 days in Explore</span>
            <h3>Your work. Out in the world.</h3>
            <p>Build and publish a public room without signing up. No Creator profile, up to 7 days in Explore, and a share link that stays live afterward during the hosting preview.</p>
            <a href="#/create">Create as a guest <b>↗</b></a>
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
