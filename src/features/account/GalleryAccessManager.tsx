import { useEffect, useState } from "react";
import type { GalleryMember, GalleryRole } from "../../services/galleryAccess";
import { galleryRepository } from "../../services/galleryRepository";

export function GalleryAccessManager({
  galleryId,
  ownerEmail,
  initiallyOpen = false,
}: {
  galleryId: string;
  ownerEmail?: string;
  initiallyOpen?: boolean;
}) {
  const [members, setMembers] = useState<GalleryMember[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Exclude<GalleryRole, "owner">>("viewer");
  const [status, setStatus] = useState<"loading" | "ready" | "saving">(
    "loading",
  );
  const [error, setError] = useState<string>();

  useEffect(() => {
    let active = true;
    void galleryRepository
      .listMembers(galleryId)
      .then((next) => {
        if (!active) return;
        setMembers(next);
        setStatus("ready");
      })
      .catch((caught) => {
        if (!active) return;
        setError(caught instanceof Error ? caught.message : "Access could not be loaded.");
        setStatus("ready");
      });
    return () => {
      active = false;
    };
  }, [galleryId]);

  const addMember = async () => {
    if (!email.trim() || status === "saving") return;
    setStatus("saving");
    setError(undefined);
    try {
      await galleryRepository.setMember(galleryId, email, role);
      setMembers(await galleryRepository.listMembers(galleryId));
      setEmail("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Access could not be saved.");
    } finally {
      setStatus("ready");
    }
  };

  return (
    <details className="gallery-access" open={initiallyOpen}>
      <summary>Manage access</summary>
      <div className="gallery-access__body">
        <div className="gallery-access__owner">
          <span>Owner</span>
          <strong>{ownerEmail || "Current account"}</strong>
        </div>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void addMember();
          }}
        >
          <label>
            Member email
            <input
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="name@example.com"
            />
          </label>
          <label>
            Role
            <select value={role} onChange={(event) => setRole(event.target.value as typeof role)}>
              <option value="viewer">Viewer</option>
              <option value="editor">Editor</option>
            </select>
          </label>
          <button disabled={status !== "ready"}>Add</button>
        </form>
        <p className="gallery-access__note">
          Viewers can enter private rooms. Editors can also update room content
          under the same live URL. Only the owner manages access and deletion.
        </p>
        {status === "loading" ? (
          <p className="gallery-access__status">Loading access…</p>
        ) : (
          <ul>
            {members.map((member) => (
              <li key={member.email}>
                <span><strong>{member.email}</strong>{member.role}</span>
                <button
                  type="button"
                  disabled={status === "saving"}
                  onClick={() => {
                    setStatus("saving");
                    setError(undefined);
                    void galleryRepository
                      .removeMember(galleryId, member.email)
                      .then(() => setMembers((current) => current.filter((item) => item.email !== member.email)))
                      .catch((caught) => setError(caught instanceof Error ? caught.message : "Access could not be removed."))
                      .finally(() => setStatus("ready"));
                  }}
                >Remove</button>
              </li>
            ))}
          </ul>
        )}
        {error && <p className="gallery-access__error" role="alert">{error}</p>}
      </div>
    </details>
  );
}
