import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "../lib/api";

const POLL_INTERVAL_MS = 2000;

export function StaffCheckinSessionPage() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const [session, setSession] = useState(null);
  const [error, setError] = useState(null);
  const [completing, setCompleting] = useState(false);
  const pollRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    const poll = async () => {
      try {
        const data = await api.getCheckinSession(sessionId);
        if (!cancelled) setSession(data);
        if (data.status === "PENDING") {
          pollRef.current = setTimeout(poll, POLL_INTERVAL_MS);
        }
      } catch (err) {
        if (!cancelled) setError(err.body?.error || err.message);
      }
    };
    poll();

    return () => {
      cancelled = true;
      clearTimeout(pollRef.current);
    };
  }, [sessionId]);

  const complete = async () => {
    setCompleting(true);
    setError(null);
    try {
      await api.completeCheckin(sessionId);
      navigate("/dashboard");
    } catch (err) {
      setError(err.body?.error || err.message);
    } finally {
      setCompleting(false);
    }
  };

  if (!session) {
    return <p className="mx-auto max-w-md px-4 py-8 text-sm text-slate-500">{error || "Loading…"}</p>;
  }

  return (
    <div className="mx-auto max-w-md px-4 py-8">
      <button onClick={() => navigate("/dashboard")} className="mb-4 text-sm text-slate-500 underline">
        ← Back to dashboard
      </button>

      {session.status === "PENDING" && (
        <>
          <h1 className="mb-1 text-2xl font-semibold text-slate-900">Scan to check in</h1>
          <p className="mb-6 text-sm text-slate-500">
            Guest scans this with their HotelVerify wallet, picks which claims to share, and approves. This code
            expires 90 seconds after creation and can only be used once.
          </p>
          <div className="flex justify-center rounded border border-slate-200 bg-white p-6">
            <img src={session.qrImageDataUrl} alt="Check-in QR code" className="h-64 w-64" />
          </div>
          {session.qrUrl && (
            <p className="mt-3 break-all text-center text-xs text-slate-400">{session.qrUrl}</p>
          )}
        </>
      )}

      {session.status === "VERIFIED" && (
        <div className="rounded border border-green-200 bg-green-50 p-6 text-center">
          <p className="text-2xl font-semibold text-green-800">VERIFIED ✓</p>
          <dl className="mt-4 space-y-1 text-left text-sm">
            {Object.entries(session.verifiedClaims || {}).map(([name, value]) => (
              <div key={name} className="flex justify-between border-b border-green-100 py-1 last:border-0">
                <dt className="text-green-700">{name}</dt>
                <dd className="font-medium text-green-900">{String(value)}</dd>
              </div>
            ))}
          </dl>
          <button
            onClick={complete}
            disabled={completing}
            className="mt-4 w-full rounded bg-green-700 px-3 py-2 text-sm font-medium text-white hover:bg-green-800 disabled:opacity-50"
          >
            {completing ? "Completing…" : "Complete check-in"}
          </button>
        </div>
      )}

      {session.status === "COMPLETED" && (
        <p className="rounded border border-slate-200 bg-slate-50 p-6 text-center text-slate-700">
          This check-in is already complete.
        </p>
      )}

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
    </div>
  );
}
