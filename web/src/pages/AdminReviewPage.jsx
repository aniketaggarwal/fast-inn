import { useEffect, useState } from "react";
import { api } from "../lib/api";

const FIELD_NAMES = ["fullName", "dateOfBirth", "idNumber", "nationality"];

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

function SubmissionCard({ submission, onDecided }) {
  const [fields, setFields] = useState(() => initialFieldValues(submission.ocrJson));
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const decide = async (decision) => {
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
    <div className="rounded border border-slate-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="font-medium text-slate-900">{submission.docType}</span>
        <span className="text-xs text-slate-400">confidence {submission.ocrConfidence?.toFixed(1)}</span>
      </div>

      {submission.docImageUrl && (
        <img src={submission.docImageUrl} alt="Submitted document" className="mb-3 w-full rounded border" />
      )}

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

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      <div className="mt-3 flex gap-2">
        <button
          onClick={() => decide("APPROVE")}
          disabled={busy}
          className="flex-1 rounded bg-green-700 px-3 py-2 text-sm font-medium text-white hover:bg-green-800 disabled:opacity-50"
        >
          Approve
        </button>
        <button
          onClick={() => decide("REJECT")}
          disabled={busy}
          className="flex-1 rounded bg-red-700 px-3 py-2 text-sm font-medium text-white hover:bg-red-800 disabled:opacity-50"
        >
          Reject
        </button>
      </div>
    </div>
  );
}

export function AdminReviewPage() {
  const [submissions, setSubmissions] = useState(null);
  const [error, setError] = useState(null);

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
        Submissions the pipeline couldn't auto-approve — low OCR confidence, a failed checksum, or a duplicate
        document flag. Correct the fields if needed, then approve or reject.
      </p>

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}
      {submissions === null && <p className="text-sm text-slate-500">Loading…</p>}
      {submissions?.length === 0 && <p className="text-sm text-slate-500">Nothing pending review.</p>}

      <div className="space-y-4">
        {submissions?.map((s) => (
          <SubmissionCard key={s.id} submission={s} onDecided={handleDecided} />
        ))}
      </div>
    </div>
  );
}
