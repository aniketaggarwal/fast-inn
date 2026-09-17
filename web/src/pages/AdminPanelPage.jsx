import { useEffect, useState } from "react";
import { api } from "../lib/api";

function HotelsTab() {
  const [hotels, setHotels] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api
      .adminHotels()
      .then((d) => setHotels(d.hotels))
      .catch((err) => setError(err.body?.error || err.message));
  }, []);

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (hotels === null) return <p className="text-sm text-slate-500">Loading…</p>;

  return (
    <div className="overflow-hidden rounded border border-slate-200">
      <table className="w-full text-left text-sm">
        <thead className="bg-slate-50 text-slate-500">
          <tr>
            <th className="px-3 py-2">Name</th>
            <th className="px-3 py-2">City</th>
            <th className="px-3 py-2">Status</th>
            <th className="px-3 py-2">Created</th>
          </tr>
        </thead>
        <tbody>
          {hotels.map((h) => (
            <tr key={h.id} className="border-t border-slate-100">
              <td className="px-3 py-2">{h.name}</td>
              <td className="px-3 py-2">{h.city}</td>
              <td className="px-3 py-2">{h.status}</td>
              <td className="px-3 py-2">{new Date(h.created_at).toLocaleDateString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {hotels.length === 0 && <p className="px-3 py-4 text-sm text-slate-500">No hotels.</p>}
    </div>
  );
}

function AuditTab() {
  const [entries, setEntries] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api
      .adminAudit()
      .then((d) => setEntries(d.entries))
      .catch((err) => setError(err.body?.error || err.message));
  }, []);

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (entries === null) return <p className="text-sm text-slate-500">Loading…</p>;

  return (
    <div className="overflow-hidden rounded border border-slate-200">
      <table className="w-full text-left text-sm">
        <thead className="bg-slate-50 text-slate-500">
          <tr>
            <th className="px-3 py-2">When</th>
            <th className="px-3 py-2">Action</th>
            <th className="px-3 py-2">Entity</th>
            <th className="px-3 py-2">Actor role</th>
            <th className="px-3 py-2">Hotel</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => (
            <tr key={e.id} className="border-t border-slate-100">
              <td className="px-3 py-2 whitespace-nowrap">{new Date(e.at).toLocaleString()}</td>
              <td className="px-3 py-2">{e.action}</td>
              <td className="px-3 py-2">
                {e.entity}
                {e.entity_id && <span className="text-slate-400"> ({e.entity_id.slice(0, 8)}…)</span>}
              </td>
              <td className="px-3 py-2">{e.actor_role || "—"}</td>
              <td className="px-3 py-2">{e.hotel_name || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {entries.length === 0 && <p className="px-3 py-4 text-sm text-slate-500">No audit entries yet.</p>}
    </div>
  );
}

function RegisterTab() {
  const [entries, setEntries] = useState(null);
  const [error, setError] = useState(null);
  const [revokingId, setRevokingId] = useState(null);
  const [confirmingId, setConfirmingId] = useState(null);

  const load = () => {
    api
      .adminRegister()
      .then((d) => setEntries(d.entries))
      .catch((err) => setError(err.body?.error || err.message));
  };

  useEffect(load, []);

  const revoke = async (credentialId) => {
    setRevokingId(credentialId);
    setConfirmingId(null);
    setError(null);
    try {
      await api.issuerRevoke(credentialId, "revoked from admin panel");
    } catch (err) {
      setError(err.body?.error || err.message);
    } finally {
      setRevokingId(null);
    }
  };

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (entries === null) return <p className="text-sm text-slate-500">Loading…</p>;

  return (
    <div className="overflow-hidden rounded border border-slate-200">
      <table className="w-full text-left text-sm">
        <thead className="bg-slate-50 text-slate-500">
          <tr>
            <th className="px-3 py-2">Guest</th>
            <th className="px-3 py-2">Hotel</th>
            <th className="px-3 py-2">ID</th>
            <th className="px-3 py-2">Arrival</th>
            <th className="px-3 py-2"></th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => (
            <tr key={e.id} className="border-t border-slate-100">
              <td className="px-3 py-2">{e.full_name}</td>
              <td className="px-3 py-2">{e.hotel_name}</td>
              <td className="px-3 py-2">
                {e.id_type} ····{e.id_last4} ({e.nationality})
              </td>
              <td className="px-3 py-2">{e.arrival_at ? new Date(e.arrival_at).toLocaleDateString() : "—"}</td>
              <td className="px-3 py-2">
                {!e.credential_id ? (
                  <span className="text-xs text-slate-400">no credential</span>
                ) : confirmingId === e.credential_id ? (
                  <span className="flex items-center gap-1">
                    <button
                      onClick={() => revoke(e.credential_id)}
                      disabled={revokingId === e.credential_id}
                      className="rounded bg-red-700 px-2 py-1 text-xs text-white hover:bg-red-800 disabled:opacity-50"
                    >
                      Confirm revoke
                    </button>
                    <button
                      onClick={() => setConfirmingId(null)}
                      className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
                    >
                      Cancel
                    </button>
                  </span>
                ) : (
                  <button
                    onClick={() => setConfirmingId(e.credential_id)}
                    className="rounded border border-red-300 px-2 py-1 text-xs text-red-700 hover:bg-red-50"
                  >
                    Revoke credential
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {entries.length === 0 && <p className="px-3 py-4 text-sm text-slate-500">No register entries yet.</p>}
    </div>
  );
}

const TABS = [
  { key: "hotels", label: "Hotels", Component: HotelsTab },
  { key: "audit", label: "Audit log", Component: AuditTab },
  { key: "register", label: "Register & revoke", Component: RegisterTab },
];

export function AdminPanelPage() {
  const [active, setActive] = useState("hotels");
  const ActiveTab = TABS.find((t) => t.key === active).Component;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="mb-1 text-2xl font-semibold text-slate-900">Admin panel</h1>
      <p className="mb-6 text-sm text-slate-500">
        Platform-wide visibility across every hotel — hotels, the append-only audit trail, and the guest register
        (Section 10's Milestone 7 done-when: revoke a credential here and the next check-in attempt fails with a
        clear reason).
      </p>

      <div className="mb-4 flex gap-1 border-b border-slate-200">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setActive(t.key)}
            className={`px-3 py-2 text-sm font-medium ${
              active === t.key ? "border-b-2 border-slate-900 text-slate-900" : "text-slate-500 hover:text-slate-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <ActiveTab />
    </div>
  );
}
