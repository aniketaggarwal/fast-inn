import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../lib/AuthContext";

// Section 8's DPDP-alignment screen: what was shared, with whom, when —
// plus withdraw-consent and delete-account. Deliberately shows only claim
// *names* (fullName, idLast4, ...), never the values themselves — this is
// an audit trail of disclosures, not another copy of the guest's PII.
export function GuestMyDataPage() {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const [consents, setConsents] = useState(null);
  const [error, setError] = useState(null);
  const [withdrawingId, setWithdrawingId] = useState(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const load = async () => {
    setError(null);
    try {
      const data = await api.myConsents();
      setConsents(data.consents);
    } catch (err) {
      setError(err.body?.error || err.message);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const withdraw = async (consentId) => {
    setWithdrawingId(consentId);
    setError(null);
    try {
      await api.withdrawConsent(consentId);
      await load();
    } catch (err) {
      setError(err.body?.error || err.message);
    } finally {
      setWithdrawingId(null);
    }
  };

  const deleteAccount = async () => {
    setDeleting(true);
    setError(null);
    try {
      await api.deleteAccount();
      logout();
      navigate("/login");
    } catch (err) {
      setError(err.body?.error || err.message);
      setDeleting(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-1 text-2xl font-semibold text-slate-900">My data</h1>
      <p className="mb-6 text-sm text-slate-500">
        What you've shared with hotels through HotelVerify, when, and for what purpose. You can withdraw consent for
        a past disclosure, or delete your account entirely.
      </p>

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}
      {consents === null && <p className="text-sm text-slate-500">Loading…</p>}
      {consents?.length === 0 && (
        <p className="mb-8 rounded border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
          Nothing shared yet.
        </p>
      )}

      <div className="mb-8 space-y-3">
        {consents?.map((c) => (
          <div key={c.id} className="rounded border border-slate-200 bg-white p-4">
            <div className="mb-1 flex items-center justify-between">
              <span className="font-medium text-slate-900">
                {c.hotel_name} <span className="font-normal text-slate-400">({c.hotel_city})</span>
              </span>
              <span className="text-xs text-slate-400">{new Date(c.granted_at).toLocaleString()}</span>
            </div>
            <p className="mb-2 text-sm text-slate-600">Purpose: {c.purpose}</p>
            <div className="mb-2 flex flex-wrap gap-1">
              {c.claims_disclosed_json.map((claim) => (
                <span key={claim} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
                  {claim}
                </span>
              ))}
            </div>
            {c.withdrawn_at ? (
              <p className="text-xs text-slate-400">Withdrawn {new Date(c.withdrawn_at).toLocaleString()}</p>
            ) : (
              <button
                onClick={() => withdraw(c.id)}
                disabled={withdrawingId === c.id}
                className="text-xs font-medium text-red-700 underline disabled:opacity-50"
              >
                {withdrawingId === c.id ? "Withdrawing…" : "Withdraw consent"}
              </button>
            )}
          </div>
        ))}
      </div>

      <div className="rounded border border-red-200 bg-red-50 p-4">
        <h2 className="mb-1 text-sm font-semibold text-red-900">Delete account</h2>
        <p className="mb-3 text-sm text-red-700">
          Removes your login and personal account data. Hotels' statutory guest register entries (required by Indian
          law) are not deleted by this — see the README's compliance disclaimer.
        </p>
        {confirmingDelete ? (
          <div className="flex gap-2">
            <button
              onClick={deleteAccount}
              disabled={deleting}
              className="rounded bg-red-700 px-3 py-2 text-sm font-medium text-white hover:bg-red-800 disabled:opacity-50"
            >
              {deleting ? "Deleting…" : "Yes, delete my account"}
            </button>
            <button
              onClick={() => setConfirmingDelete(false)}
              disabled={deleting}
              className="rounded border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-white"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmingDelete(true)}
            className="rounded bg-red-700 px-3 py-2 text-sm font-medium text-white hover:bg-red-800"
          >
            Delete my account
          </button>
        )}
      </div>
    </div>
  );
}
