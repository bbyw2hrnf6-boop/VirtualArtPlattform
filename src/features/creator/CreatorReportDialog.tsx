import { useRef, useState, type FormEvent } from "react";
import { useDialogFocus } from "../../hooks/useDialogFocus";

export type CreatorReportReason = "spam" | "harassment" | "rights" | "unsafe" | "other";

const REPORT_REASONS: Array<{ value: CreatorReportReason; label: string; detail: string }> = [
  { value: "spam", label: "Spam or deception", detail: "Repeated promotion, scams, or misleading activity." },
  { value: "harassment", label: "Harassment or threats", detail: "Targeted abuse, intimidation, or threatening language." },
  { value: "rights", label: "Rights or privacy", detail: "Copyright, ownership, impersonation, or personal-data concern." },
  { value: "unsafe", label: "Unsafe content", detail: "Content that may create an immediate safety concern." },
  { value: "other", label: "Another concern", detail: "A concern that does not fit the categories above." },
];

export function CreatorReportDialog({
  creator,
  busy,
  error,
  onClose,
  onSubmit,
}: {
  creator: string;
  busy: boolean;
  error?: string;
  onClose: () => void;
  onSubmit: (reason: CreatorReportReason) => void;
}) {
  const dialog = useRef<HTMLElement>(null);
  const [reason, setReason] = useState<CreatorReportReason>();
  useDialogFocus(dialog, onClose);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (reason && !busy) onSubmit(reason);
  };

  return (
    <div
      className="creator-report-backdrop"
      onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}
    >
      <section
        ref={dialog}
        className="creator-report-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="creator-report-title"
        tabIndex={-1}
      >
        <button type="button" className="creator-report-dialog__close" aria-label="Close report dialog" disabled={busy} onClick={onClose}>×</button>
        <p className="eyebrow">Safety and reporting</p>
        <h2 id="creator-report-title">Report this post.</h2>
        <p>Choose the closest reason for the post from @{creator}. A LIEUVA operator will review the exact post and your account will not be shown to the Creator.</p>
        <form onSubmit={submit}>
          <fieldset disabled={busy}>
            <legend>Reason for report</legend>
            {REPORT_REASONS.map((option) => (
              <label key={option.value}>
                <input
                  type="radio"
                  name="creator-report-reason"
                  value={option.value}
                  checked={reason === option.value}
                  onChange={() => setReason(option.value)}
                />
                <span><strong>{option.label}</strong><small>{option.detail}</small></span>
              </label>
            ))}
          </fieldset>
          <div className="creator-report-dialog__actions">
            <button type="button" disabled={busy} onClick={onClose}>Cancel</button>
            <button type="submit" disabled={!reason || busy}>{busy ? "Sending…" : "Send report"}</button>
          </div>
          {error ? <p className="creator-report-dialog__error" role="alert">{error}</p> : null}
        </form>
      </section>
    </div>
  );
}
