import { useEffect, useState } from "react";
import { api } from "../lib/api";

const FIELD_NAMES = ["fullName", "dateOfBirth", "idNumber", "nationality"];

const FACE_STATUS_LABELS = {
  id_photo_no_face: "No face found in the ID photo",
  selfie_no_face: "No face found in the selfie",
  id_photo_multiple_faces: "More than one face in the ID photo",
  selfie_multiple_faces: "More than one face in the selfie",
};

// score = max(0, 1 - distance); the pipeline's own match threshold is on
// distance <= 0.6, i.e. score >= 0.4 — kept in sync with
// issuer/src/pipeline/facematch.js's FACE_MATCH_THRESHOLD.
function faceMatchBadge(submission) {
  if (submission.faceMatchStatus !== "ok") {
    return { label: FACE_STATUS_LABELS[submission.faceMatchStatus] || "Not evaluated", tone: "red" };
  }
  const score = submission.faceScore;
  if (score >= 0.4) return { label: `Likely match — score ${score.toFixed(2)}`, tone: "green" };
  if (score >= 0.25) return { label: `Borderline — score ${score.toFixed(2)}`, tone: "amber" };
  return { label: `Likely mismatch — score ${score.toFixed(2)}`, tone: "red" };
}

const BADGE_TONE_CLASSES = {
  green: "bg-green-100 text-green-800",
  amber: "bg-amber-100 text-amber-800",
  red: "bg-red-100 text-red-800",
};

// Always the raw OCR text, never the already-normalized `value` — the
// corrected-fields the reviewer submits go through the same validator OCR
// output does (issuer/src/pipeline/validators.js), which expects the raw
// format (e.g. dateOfBirth as DD/MM/YYYY). Pre-filling with `value` for a
// field that already passed would show its normalized ISO date, which
// then fails re-validation on submit if the reviewer doesn't happen to
// edit it back to the raw format.
function initialFieldValues(ocrJson) {
  const values = {};
  for (const name of FIELD_NAMES) {
    values[name] = ocrJson?.[name]?.rawText ?? "";
  }
  return values;
}

function ZoomableImage({ src, alt, onZoom }) {
  if (!src) return null;
  return (
    <button
      type="button"
      onClick={() => onZoom(src, alt)}
      className="group relative w-1/2 overflow-hidden rounded border"
    >
      <img src={src} alt={alt} className="w-full transition group-hover:opacity-80" />
      <span className="absolute bottom-1 right-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white opacity-0 group-hover:opacity-100">
        Click to zoom
      </span>
    </button>
  );
}

function SubmissionCard({ submission, onDecided, onZoom }) {
  const [fields, setFields] = useState(() => initialFieldValues(submission.ocrJson));
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [confirmingReject, setConfirmingReject] = useState(false);
  const badge = faceMatchBadge(submission);

  const decide = async (decision) => {
    setConfirmingReject(false);
    setBusy(true);
    setError(null);
    try {
      await api.issuerDecide(submission.id, {
        decision,
        note,
        ...(decision === "APPROVE" ? { correctedFields: fields } : {}),
      });
      onDecided(submission.id);
    } catch (err) {
      setError(err.body?.error || err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <span className="font-medium text-slate-900">{submission.docType}</span>
          <span className="ml-2 text-xs text-slate-400">
            {submission.createdAt && new Date(submission.createdAt).toLocaleString()}
          </span>
        </div>
        <span className="text-xs text-slate-400">OCR confidence {submission.ocrConfidence?.toFixed(1)}</span>
      </div>

      <div className="mb-3 flex gap-2">
        <ZoomableImage src={submission.docImageUrl} alt="Submitted document" onZoom={onZoom} />
        <ZoomableImage src={submission.selfieImageUrl} alt="Submitted selfie" onZoom={onZoom} />
      </div>

      <div className="mb-3">
        <span className={`inline-block rounded-full px-2.5 py-1 text-xs font-medium ${BADGE_TONE_CLASSES[badge.tone]}`}>
          {badge.label}
        </span>
      </div>

      <div className="space-y-2">
        {FIELD_NAMES.map((name) => {
          const field = submission.ocrJson?.[name];
          return (
            <div key={name}>
              <label className="mb-0.5 flex items-center justify-between text-xs text-slate-500">
                <span>{field?.label || name}</span>
                {field && !field.passed && (
                  <span className="text-amber-600">flagged: {field.failureReason}</span>
                )}
              </label>
              <input
                value={fields[name]}
                onChange={(e) => setFields((f) => ({ ...f, [name]: e.target.value }))}
                className={`w-full rounded border px-2 py-1 text-sm ${
                  field && !field.passed ? "border-amber-400 bg-amber-50" : "border-slate-300"
                }`}
              />
            </div>
          );
        })}
      </div>

      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Review note (optional)"
        className="mt-3 w-full rounded border border-slate-300 px-2 py-1 text-sm"
        rows={2}
      />

      {error && <div className="mt-2 rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700">{error}</div>}

      {confirmingReject ? (
        <div className="mt-3 rounded border border-red-200 bg-red-50 p-3">
          <p className="mb-2 text-sm text-red-800">Reject this submission? This cannot be undone.</p>
          <div className="flex gap-2">
            <button
              onClick={() => decide("REJECT")}
              disabled={busy}
              className="flex-1 rounded bg-red-700 px-3 py-2 text-sm font-medium text-white hover:bg-red-800 disabled:opacity-50"
            >
              {busy ? "Working…" : "Yes, reject"}
            </button>
            <button
              onClick={() => setConfirmingReject(false)}
              disabled={busy}
              className="flex-1 rounded border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex gap-2">
          <button
            onClick={() => decide("APPROVE")}
            disabled={busy}
            className="flex-1 rounded bg-green-700 px-3 py-2 text-sm font-medium text-white hover:bg-green-800 disabled:opacity-50"
          >
            {busy ? "Working…" : "Approve"}
          </button>
          <button
            onClick={() => setConfirmingReject(true)}
            disabled={busy}
            className="flex-1 rounded bg-red-700 px-3 py-2 text-sm font-medium text-white hover:bg-red-800 disabled:opacity-50"
          >
            Reject
          </button>
        </div>
      )}
    </div>
  );
}

function Lightbox({ src, alt, onClose }) {
  if (!src) return null;
  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
    >
      <img src={src} alt={alt} className="max-h-full max-w-full rounded shadow-lg" />
      <button
        onClick={onClose}
        className="absolute right-4 top-4 rounded-full bg-white/90 px-3 py-1 text-sm font-medium text-slate-900"
      >
        Close ✕
      </button>
    </div>
  );
}

export function AdminReviewPage() {
  const [submissions, setSubmissions] = useState(null);
  const [error, setError] = useState(null);
  const [zoomed, setZoomed] = useState(null);

  const load = async () => {
    setError(null);
    try {
      const data = await api.issuerReviewQueue();
      setSubmissions(data.submissions);
    } catch (err) {
      setError(err.body?.error || err.message);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleDecided = (submissionId) => {
    setSubmissions((prev) => prev.filter((s) => s.id !== submissionId));
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-1 text-2xl font-semibold text-slate-900">KYC review queue</h1>
      <p className="mb-6 text-sm text-slate-500">
        Submissions the pipeline couldn't auto-approve — low OCR confidence, a failed checksum, a face-match issue,
        or a duplicate document flag. Correct the fields if needed, then approve or reject.
      </p>

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}
      {submissions === null && <p className="text-sm text-slate-500">Loading…</p>}
      {submissions?.length === 0 && (
        <p className="rounded border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
          Nothing pending review.
        </p>
      )}

      <div className="space-y-4">
        {submissions?.map((s) => (
          <SubmissionCard
            key={s.id}
            submission={s}
            onDecided={handleDecided}
            onZoom={(src, alt) => setZoomed({ src, alt })}
          />
        ))}
      </div>

      <Lightbox src={zoomed?.src} alt={zoomed?.alt} onClose={() => setZoomed(null)} />
    </div>
  );
}
