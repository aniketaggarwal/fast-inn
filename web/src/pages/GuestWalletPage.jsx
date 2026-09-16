import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import {
  loadCredential,
  saveCredential,
  loadPendingSubmission,
  clearPendingSubmission,
} from "../lib/wallet";

const HIDDEN_CLAIM_KEYS = new Set(["photoThumb", "idDocHash"]);

function PendingSubmissionCheck({ submissionId, onResolved }) {
  const [checking, setChecking] = useState(false);
  const [message, setMessage] = useState(null);

  const check = async () => {
    setChecking(true);
    setMessage(null);
    try {
      const status = await api.kycStatus(submissionId);
      if (status.status === "APPROVED") {
        saveCredential(status.credential);
        clearPendingSubmission();
        onResolved();
      } else if (status.status === "REJECTED") {
        clearPendingSubmission();
        setMessage(`Verification was rejected${status.reviewNote ? `: ${status.reviewNote}` : "."}`);
      } else {
        setMessage("Still under review — check back again shortly.");
      }
    } catch (err) {
      setMessage(err.body?.error || err.message);
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="mb-6 rounded border border-amber-200 bg-amber-50 p-4">
      <p className="font-medium text-amber-800">You have a verification under review.</p>
      <p className="mt-1 text-sm text-amber-700">
        Submission ID: <code>{submissionId}</code>
      </p>
      <button
        onClick={check}
        disabled={checking}
        className="mt-2 rounded bg-amber-800 px-3 py-1.5 text-sm text-white hover:bg-amber-900 disabled:opacity-50"
      >
        {checking ? "Checking…" : "Check status"}
      </button>
      {message && <p className="mt-2 text-sm text-amber-800">{message}</p>}
    </div>
  );
}

export function GuestWalletPage() {
  const [credential, setCredential] = useState(loadCredential);
  const pendingSubmissionId = !credential ? loadPendingSubmission() : null;

  if (!credential) {
    return (
      <div className="mx-auto max-w-xl px-4 py-8">
        <h1 className="mb-2 text-2xl font-semibold text-slate-900">Wallet</h1>
        {pendingSubmissionId && (
          <PendingSubmissionCheck
            submissionId={pendingSubmissionId}
            onResolved={() => setCredential(loadCredential())}
          />
        )}
        <p className="text-sm text-slate-500">
          No credential yet.{" "}
          <Link to="/kyc" className="underline">
            Verify your identity
          </Link>{" "}
          to get one.
        </p>
      </div>
    );
  }

  const claims = credential.disclosures.filter((d) => !HIDDEN_CLAIM_KEYS.has(d.name));
  const photo = credential.disclosures.find((d) => d.name === "photoThumb");

  return (
    <div className="mx-auto max-w-xl px-4 py-8">
      <h1 className="mb-1 text-2xl font-semibold text-slate-900">Your credential</h1>
      <p className="mb-6 text-sm text-slate-500">
        Issued by HotelVerify's issuer service. Expires {new Date(credential.expiresAt).toLocaleDateString()}. At
        check-in, you'll choose which of these claims to share — a hotel never sees this full list, and never sees
        your original ID document.
      </p>

      <div className="rounded border border-slate-200 bg-white p-4">
        {photo && (
          <img
            src={`data:image/jpeg;base64,${photo.value}`}
            alt="Selfie thumbnail"
            className="mb-4 h-16 w-16 rounded object-cover"
          />
        )}
        <dl className="space-y-2 text-sm">
          {claims.map((claim) => (
            <div key={claim.name} className="flex justify-between border-b border-slate-100 py-1 last:border-0">
              <dt className="text-slate-500">{claim.name}</dt>
              <dd className="font-medium text-slate-900">{String(claim.value)}</dd>
            </div>
          ))}
        </dl>
      </div>

      <p className="mt-4 text-xs text-slate-400">
        Credential ID: <code>{credential.id}</code>
      </p>
    </div>
  );
}
