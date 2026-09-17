import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { getOrCreateDeviceKey } from "../lib/deviceKey";
import { saveCredential, savePendingSubmission } from "../lib/wallet";
import { LivenessCapture } from "../components/LivenessCapture";

const DOC_TYPES = [
  { value: "AADHAAR", label: "Aadhaar" },
  { value: "PASSPORT", label: "Passport" },
  { value: "DRIVING_LICENSE", label: "Driving Licence" },
];

// Small preview thumbnail + filename for a chosen file, instead of the
// browser's bare "No file chosen" native input text.
function FilePreviewInput({ file, onChange, label }) {
  const [previewUrl, setPreviewUrl] = useState(null);

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  return (
    <label className="flex cursor-pointer items-center gap-3 rounded border border-dashed border-slate-300 p-3 hover:border-slate-400">
      {previewUrl ? (
        <img src={previewUrl} alt="" className="h-14 w-14 rounded object-cover" />
      ) : (
        <div className="flex h-14 w-14 items-center justify-center rounded bg-slate-100 text-slate-400">
          <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.5-4.5a2 2 0 012.8 0L16 16m-2-2l1.5-1.5a2 2 0 012.8 0L20 14M4 6h16v12H4V6z" />
          </svg>
        </div>
      )}
      <div className="text-sm">
        <p className="font-medium text-slate-700">{file ? file.name : `Choose ${label}`}</p>
        <p className="text-slate-400">{file ? "Click to change" : "PNG or JPG"}</p>
      </div>
      <input type="file" accept="image/*" onChange={(e) => onChange(e.target.files?.[0] || null)} className="hidden" />
    </label>
  );
}

function StepBadge({ number, label, done, active }) {
  return (
    <div className="flex items-center gap-2">
      <span
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
          done ? "bg-green-600 text-white" : active ? "bg-slate-900 text-white" : "bg-slate-200 text-slate-500"
        }`}
      >
        {done ? "✓" : number}
      </span>
      <span className={`text-sm font-medium ${active || done ? "text-slate-900" : "text-slate-400"}`}>{label}</span>
    </div>
  );
}

export function GuestKycPage() {
  const navigate = useNavigate();
  const [phone, setPhone] = useState("");
  const [docType, setDocType] = useState("AADHAAR");
  const [docFile, setDocFile] = useState(null);
  const [selfieFile, setSelfieFile] = useState(null);
  const [selfieMode, setSelfieMode] = useState("live"); // "live" | "upload"
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setResult(null);

    if (!docFile || !selfieFile) {
      setError("Please choose both a document image and a selfie.");
      return;
    }
    if (!consent) {
      setError("Consent is required to proceed.");
      return;
    }

    setBusy(true);
    try {
      const presign = await api.kycPresign(docType);
      await Promise.all([
        api.uploadToPresignedUrl(presign.docUploadUrl, docFile),
        api.uploadToPresignedUrl(presign.selfieUploadUrl, selfieFile),
      ]);

      const deviceKey = await getOrCreateDeviceKey();

      const submitResult = await api.kycSubmit({
        phone,
        docType,
        docKey: presign.docKey,
        selfieKey: presign.selfieKey,
        consent: true,
        holderPublicKeyJwk: deviceKey.publicKeyJwk,
      });

      setResult(submitResult);
      if (submitResult.status === "APPROVED") {
        saveCredential(submitResult.credential);
      } else if (submitResult.status === "NEEDS_REVIEW") {
        savePendingSubmission(submitResult.submissionId);
      }
    } catch (err) {
      setError(err.body?.reasons ? `${err.body.error}: ${err.body.reasons.join(", ")}` : err.body?.error || err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-xl px-4 py-8">
      <h1 className="mb-1 text-2xl font-semibold text-slate-900">Verify your identity</h1>
      <p className="mb-4 text-sm text-slate-500">
        One-time verification. This goes straight to the issuer service, not to HotelVerify's booking platform —
        your ID document is deleted right after your credential is issued.{" "}
        <strong>Use a synthetic test document — never a real government ID.</strong>
      </p>

      <div className="mb-6 flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
        <StepBadge number={1} label="Document" done={Boolean(docFile)} active={!docFile} />
        <div className="h-px flex-1 bg-slate-200" />
        <StepBadge number={2} label="Selfie" done={Boolean(selfieFile)} active={Boolean(docFile) && !selfieFile} />
        <div className="h-px flex-1 bg-slate-200" />
        <StepBadge
          number={3}
          label="Consent"
          done={consent}
          active={Boolean(docFile) && Boolean(selfieFile) && !consent}
        />
      </div>

      {result?.status === "APPROVED" && (
        <div className="mb-6 rounded border border-green-200 bg-green-50 p-4">
          <p className="font-medium text-green-800">Verified! Your credential has been issued.</p>
          <button onClick={() => navigate("/wallet")} className="mt-2 text-sm text-green-800 underline">
            View it in your wallet →
          </button>
        </div>
      )}
      {result?.status === "NEEDS_REVIEW" && (
        <div className="mb-6 rounded border border-amber-200 bg-amber-50 p-4">
          <p className="font-medium text-amber-800">
            We couldn't automatically verify this one — it's gone to human review.
          </p>
          <p className="mt-1 text-sm text-amber-700">
            Submission ID: <code>{result.submissionId}</code>. Check back shortly.
          </p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Phone number</label>
          <input
            type="tel"
            required
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="9999999999"
            className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Document type</label>
          <select
            value={docType}
            onChange={(e) => setDocType(e.target.value)}
            className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
          >
            {DOC_TYPES.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Document photo</label>
          <FilePreviewInput file={docFile} onChange={setDocFile} label="document photo" />
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between">
            <label className="block text-sm font-medium text-slate-700">Selfie</label>
            <button
              type="button"
              onClick={() => {
                setSelfieFile(null);
                setSelfieMode((m) => (m === "live" ? "upload" : "live"));
              }}
              className="text-xs text-slate-500 underline"
            >
              {selfieMode === "live" ? "No camera? Upload a photo instead" : "Use live camera instead"}
            </button>
          </div>

          {selfieMode === "live" ? (
            // Section 9.3: a live capture + liveness challenge, checked
            // server-side (issuer/src/pipeline/liveness.js) before this
            // page ever uploads anything as the selfie.
            <LivenessCapture onCaptured={setSelfieFile} />
          ) : (
            <FilePreviewInput file={selfieFile} onChange={setSelfieFile} label="selfie" />
          )}
        </div>

        <label className="flex items-start gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            className="mt-1"
          />
          <span>
            I consent to HotelVerify's issuer service processing my ID document and selfie for the sole purpose of
            issuing a reusable identity credential. The raw document is deleted immediately after issuance.
          </span>
        </label>

        {error && <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

        <button
          type="submit"
          disabled={busy}
          className="flex w-full items-center justify-center gap-2 rounded bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
        >
          {busy && (
            <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
            </svg>
          )}
          {busy ? "Verifying…" : "Submit for verification"}
        </button>
      </form>
    </div>
  );
}
