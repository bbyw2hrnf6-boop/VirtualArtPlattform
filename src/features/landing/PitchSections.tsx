import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import {
  discoverCoverSource,
  galleryRepository,
  type GalleryRecord,
} from '../../services/galleryRepository';
import {
  creatorImageUrl,
  loadPublicCreatorDirectory,
  type PublicCreatorDirectoryEntry,
} from '../../services/creatorProfile';
import { creatorCanonicalUrl, spacePath } from '../../services/spaceRoutes';
import './pitchSections.css';

const FAQS = [
  ['Do I need Blender or 3D software?', 'No. LIEUVA Studio creates each template Space directly in the browser. Choose a room, arrange your work, preview the visit, and publish from one workflow.'],
  ['What can I publish today?', 'You can build and Walk Preview without an account. A verified email or Google account lets you publish with public, unlisted, or private access.'],
  ['How does private access work?', 'The Owner invites verified accounts as Viewers or Editors. Viewers can enter private Spaces; Editors can update content under the same share URL. Only the Owner manages access and deletion. Permanent hosting and billing are not active.'],
  ['Where are work files stored?', 'Published images and covers use Firebase Storage. Space data and access roles use Firestore. Only upload work you have the right to share.'],
  ['Which devices are supported?', 'Visitors can enter on modern desktop and mobile browsers. LIEUVA Studio works on mobile through a resizable tool sheet; desktop remains the most precise arrangement surface.']
] as const;

export function PitchSections() {
  const [spaces, setSpaces] = useState<GalleryRecord[]>([]);
  const [creators, setCreators] = useState<PublicCreatorDirectoryEntry[]>([]);
  const [directoryStatus, setDirectoryStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const showcase = useRef<HTMLElement>(null);
  const requested = useRef(false);

  const loadShowcase = useCallback(() => {
    if (requested.current) return;
    requested.current = true;
    setDirectoryStatus('loading');
    void Promise.all([galleryRepository.discover(), loadPublicCreatorDirectory()])
      .then(([publishedSpaces, directory]) => {
        setSpaces(publishedSpaces.slice(0, 3));
        setCreators(directory.creators.filter((creator) => !creator.demo).slice(0, 8));
        setDirectoryStatus('ready');
      })
      .catch(() => {
        requested.current = false;
        setDirectoryStatus('error');
      });
  }, []);

  useEffect(() => {
    const target = showcase.current;
    if (!target || requested.current) return undefined;
    if (!('IntersectionObserver' in window)) {
      const frame = requestAnimationFrame(loadShowcase);
      return () => cancelAnimationFrame(frame);
    }
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      loadShowcase();
    }, { rootMargin: '500px 0px' });
    observer.observe(target);
    return () => observer.disconnect();
  }, [loadShowcase]);

  return (
    <div className="aura-pitch">
      <section ref={showcase} className="follow-work" aria-labelledby="follow-work-title">
        <div className="follow-work__hero">
          <div className="follow-work__copy">
            <p>Live on LIEUVA</p>
            <h2 id="follow-work-title">Follow the work.</h2>
            <span>Enter published Spaces first. Then meet the creators building new ways to present art, design and ideas.</span>
            <div className="follow-work__actions">
              <a href="#discover-spaces">Explore Spaces <b aria-hidden="true">↗</b></a>
              <a href="#/create">Create a Space <b aria-hidden="true">→</b></a>
            </div>
            <ol aria-label="LIEUVA product journey">
              <li><b>01</b> Space</li>
              <li><b>02</b> Creator</li>
              <li><b>03</b> Community</li>
            </ol>
          </div>

          <div className={`follow-work__spaces follow-work__spaces--${directoryStatus}`} aria-live="polite">
            {(directoryStatus === 'idle' || directoryStatus === 'loading') && (
              <div className="follow-work__loading" role="status"><span>Opening public Spaces…</span></div>
            )}
            {directoryStatus === 'error' && (
              <div className="follow-work__empty" role="status">
                <strong>The public rooms are taking a pause.</strong>
                <button type="button" onClick={loadShowcase}>Try again →</button>
              </div>
            )}
            {directoryStatus === 'ready' && !spaces.length && (
              <div className="follow-work__empty" role="status">
                <strong>The next public Space starts here.</strong>
                <a href="#/create">Open the Studio →</a>
              </div>
            )}
            {spaces.map((space, index) => {
              const image = discoverCoverSource(space) ?? `./assets/templates/${space.templateId}-preview.webp`;
              return (
                <a
                  className="follow-work__space"
                  href={spacePath(space.id)}
                  key={space.id}
                  style={{ '--space-order': index } as CSSProperties}
                  aria-label={`Enter ${space.title} by ${space.artist}`}
                >
                  <img
                    src={image}
                    alt={`${space.title} room view`}
                    loading="lazy"
                    decoding="async"
                    onError={(event) => {
                      if (event.currentTarget.dataset.fallback === 'true') return;
                      event.currentTarget.dataset.fallback = 'true';
                      event.currentTarget.src = `./assets/templates/${space.templateId}-preview.webp`;
                    }}
                  />
                  <span><small>Published Space</small><strong>{space.title}</strong><em>{space.artist}</em></span>
                  <b aria-hidden="true">↗</b>
                </a>
              );
            })}
          </div>
        </div>

        <div className="follow-work__creators">
          <header>
            <div><p>Featured creators</p><h3>Meet the people<br />behind the Spaces.</h3></div>
            <a href="/creators#creator-directory">View Creator Hub <span aria-hidden="true">→</span></a>
          </header>
          {directoryStatus === 'ready' && creators.length ? (
            <div className="follow-work__creator-list">
              {creators.map((creator) => (
                <a href={creatorCanonicalUrl(creator.handle)} key={creator.handle}>
                  <span>
                    {creator.imagePresent
                      ? <img src={creatorImageUrl(creator.handle)} alt="" loading="lazy" decoding="async" />
                      : creator.displayName.slice(0, 1).toUpperCase()}
                  </span>
                  <strong>{creator.displayName}</strong>
                  <small>@{creator.handle}</small>
                </a>
              ))}
            </div>
          ) : directoryStatus === 'ready' ? (
            <p className="follow-work__creator-empty">Public Creator profiles will appear here as their work goes live.</p>
          ) : null}
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
