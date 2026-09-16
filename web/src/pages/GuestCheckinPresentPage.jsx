import { useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { api } from "../lib/api";
import { loadCredential } from "../lib/wallet";
import { getOrCreateDeviceKey } from "../lib/deviceKey";
import { buildPresentation } from "../lib/presentation";

// Claims guest_register can't exist without (Section 5's schema has them
// NOT NULL) — locked on so check-in can actually succeed. Everything else
// the credential can disclose is a real, unlocked choice: this toggle
// list, not a company policy, is what makes "the hotel never sees your
// DOB" true or false for a given check-in.
const MANDATORY_CLAIMS = ["fullName", "idType", "idLast4", "nationality"];
const OPTIONAL_CLAIMS = ["dateOfBirth", "isAdult"];
const CLAIM_LABELS = {
  fullName: "Full name",
  idType: "ID type",
  idLast4: "ID last 4 digits",
  nationality: "Nationality",
  dateOfBirth: "Date of birth",
  isAdult: "Age 18+ confirmation",
};

export function GuestCheckinPresentPage() {
  const [params] = useSearchParams();
  const sessionId = params.get("sessionId");
  const nonce = params.get("nonce");
  const hotelId = params.get("hotelId");

  const credential = loadCredential();
  const [selectedOptional, setSelectedOptional] = useState(() => new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  if (!sessionId || !nonce || !hotelId) {
    return (
      <div className="mx-auto max-w-md px-4 py-8">
        <p className="text-sm text-red-600">
          This doesn't look like a valid check-in link — scan the QR code at the front desk again.
        </p>
      </div>
    );
  }

  if (!credential) {
    return (
      <div className="mx-auto max-w-md px-4 py-8">
        <h1 className="mb-2 text-2xl font-semibold text-slate-900">Check in</h1>
        <p className="text-sm text-slate-500">
          You don't have a credential yet.{" "}
          <Link to="/kyc" className="underline">
            Verify your identity
          </Link>{" "}
          first, then come back and scan the code again.
        </p>
      </div>
    );
  }

  const availableOptional = OPTIONAL_CLAIMS.filter((name) => credential.disclosures.some((d) => d.name === name));

  const toggle = (name) => {
    setSelectedOptional((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const approve = async () => {
    setBusy(true);
    setError(null);
    try {
      const claimNames = [...MANDATORY_CLAIMS, ...selectedOptional];
      const disclosures = credential.disclosures.filter((d) => claimNames.includes(d.name));

      const deviceKey = await getOrCreateDeviceKey();
      const presentation = await buildPresentation({
        credentialJwt: credential.jwt,
        disclosures,
        privateKey: deviceKey.privateKey,
        nonce,
        hotelId,
      });

      const res = await api.presentCheckin(sessionId, { presentation, hotelId });
      setResult(res);
    } catch (err) {
      setError(err.body?.reason || err.body?.error || err.message);
    } finally {
      setBusy(false);
    }
  };

  if (result?.status === "VERIFIED") {
    return (
      <div className="mx-auto max-w-md px-4 py-8">
        <div className="rounded border border-green-200 bg-green-50 p-6 text-center">
          <p className="text-2xl font-semibold text-green-800">You're checked in!</p>
          <p className="mt-2 text-sm text-green-700">The front desk screen has been updated. You can close this.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md px-4 py-8">
      <h1 className="mb-1 text-2xl font-semibold text-slate-900">Share your credential</h1>
      <p className="mb-6 text-sm text-slate-500">
        Choose what to share for this check-in. Nothing you leave unchecked is sent — the hotel never even learns
        that field exists on your credential.
      </p>

      <div className="mb-4 rounded border border-slate-200 bg-white p-4">
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">Always shared (required for the guest register)</p>
        {MANDATORY_CLAIMS.map((name) => (
          <label key={name} className="flex items-center gap-2 py-1 text-sm text-slate-700">
            <input type="checkbox" checked disabled />
            {CLAIM_LABELS[name] || name}
          </label>
        ))}

        {availableOptional.length > 0 && (
          <>
            <p className="mb-2 mt-4 text-xs font-medium uppercase tracking-wide text-slate-400">Your choice</p>
            {availableOptional.map((name) => (
              <label key={name} className="flex items-center gap-2 py-1 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={selectedOptional.has(name)}
                  onChange={() => toggle(name)}
                />
                {CLAIM_LABELS[name] || name}
              </label>
            ))}
          </>
        )}
      </div>

      {error && <p className="mb-4 text-sm text-red-600">Verification failed: {error}</p>}

      <button
        onClick={approve}
        disabled={busy}
        className="w-full rounded bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
      >
        {busy ? "Verifying…" : "Approve & share"}
      </button>
    </div>
  );
}
