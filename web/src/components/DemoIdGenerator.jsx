import { useEffect, useState } from "react";
import { api } from "../lib/api";

function toDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Only renders when the issuer reports demo mode (`npm run demo`). Nobody
// demoing on a phone has a synthetic Aadhaar card to photograph, so this
// makes one — the exact template the OCR pipeline reads — using the
// guest's own selfie as the ID photo. The card then goes through the real
// KYC pipeline like any upload: quality gate, OCR, checksum, face match.
export function DemoIdGenerator({ docType, selfieFile, onGenerated }) {
  const [enabled, setEnabled] = useState(false);
  const [fullName, setFullName] = useState("Demo Guest");
  const [dob, setDob] = useState("1998-04-21");
  const [nationality, setNationality] = useState("IN");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    api
      .demoStatus()
      .then((d) => setEnabled(Boolean(d.enabled)))
      .catch(() => setEnabled(false));
  }, []);

  if (!enabled) return null;

  const generate = async () => {
    setBusy(true);
    setError(null);
    try {
      const blob = await api.demoIdCard({
        docType,
        fullName,
        dateOfBirth: dob,
        nationality,
        faceImage: await toDataUrl(selfieFile),
      });
      onGenerated(new File([blob], "demo-id.png", { type: "image/png" }));
    } catch (err) {
      setError(err.body?.error || err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-2 rounded-lg border border-brand-200 bg-brand-50 p-3 text-sm">
      <p className="font-medium text-brand-900">Demo mode — no ID card handy?</p>
      <p className="mt-0.5 text-xs text-brand-800">
        With your selfie captured above, generate a synthetic test ID carrying your photo — it fills the Document photo
        field. It still goes through the real quality check, OCR, checksum and face match.
      </p>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <input
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder="Full name"
          className="col-span-2 rounded border border-slate-300 px-2 py-1.5"
        />
        <input type="date" value={dob} onChange={(e) => setDob(e.target.value)} className="rounded border border-slate-300 px-2 py-1.5" />
        <select value={nationality} onChange={(e) => setNationality(e.target.value)} className="rounded border border-slate-300 px-2 py-1.5">
          <option value="IN">India (IN)</option>
          <option value="US">United States (US) — triggers Form C</option>
          <option value="GB">United Kingdom (GB) — triggers Form C</option>
        </select>
      </div>
      <button
        type="button"
        onClick={generate}
        disabled={busy || !selfieFile}
        className="mt-2 w-full rounded bg-brand-600 px-3 py-2 font-medium text-white hover:bg-brand-700 disabled:opacity-50"
      >
        {busy ? "Generating…" : selfieFile ? "Generate test ID with my selfie" : "Capture a selfie first"}
      </button>
      {error && <p className="mt-2 text-xs text-red-700">{error}</p>}
    </div>
  );
}
