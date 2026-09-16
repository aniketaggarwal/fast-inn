import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { getOrCreateDeviceKey } from "../lib/deviceKey";
import { saveCredential, savePendingSubmission } from "../lib/wallet";

const DOC_TYPES = [
  { value: "AADHAAR", label: "Aadhaar" },
  { value: "PASSPORT", label: "Passport" },
  { value: "DRIVING_LICENSE", label: "Driving Licence" },
];

export function GuestKycPage() {
  const navigate = useNavigate();
  const [phone, setPhone] = useState("");
  const [docType, setDocType] = useState("AADHAAR");
  const [docFile, setDocFile] = useState(null);
  const [selfieFile, setSelfieFile] = useState(null);
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
      <p className="mb-6 text-sm text-slate-500">
        One-time verification. This goes straight to the issuer service, not to HotelVerify's booking platform —
        your ID document is deleted right after your credential is issued.{" "}
        <strong>Use a synthetic test document — never a real government ID.</strong>
      </p>

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
          <input
            type="file"
            accept="image/*"
            required
            onChange={(e) => setDocFile(e.target.files?.[0] || null)}
            className="w-full text-sm"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Selfie</label>
          <input
            type="file"
            accept="image/*"
            required
            onChange={(e) => setSelfieFile(e.target.files?.[0] || null)}
            className="w-full text-sm"
          />
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

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
        >
          {busy ? "Verifying…" : "Submit for verification"}
        </button>
      </form>
    </div>
  );
}
