import { useEffect, useState } from "react";
import { api } from "../lib/api";

// Section 8: "Auto-populate the register from verified check-ins. Show
// that the register contains idLast4, never the full number." — this
// page only ever has id_last4 to render in the first place (see
// api/src/routes/hotelRegister.js's own comment on why).
export function HotelRegisterPage() {
  const [entries, setEntries] = useState(null);
  const [error, setError] = useState(null);
  const [exporting, setExporting] = useState(false);

  const load = async () => {
    setError(null);
    try {
      const data = await api.hotelRegister();
      setEntries(data.entries);
    } catch (err) {
      setError(err.body?.error || err.message);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const exportFormC = async () => {
    setExporting(true);
    setError(null);
    try {
      const blob = await api.downloadFormCCsv();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "form-c.csv";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.body?.error || err.message);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-1 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-900">Guest register</h1>
        <button
          onClick={exportFormC}
          disabled={exporting}
          className="rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
        >
          {exporting ? "Exporting…" : "Export Form C (CSV) →"}
        </button>
      </div>
      <p className="mb-6 text-sm text-slate-500">
        Auto-populated from verified check-ins. Foreign nationals (Form C required) are flagged.
      </p>

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}
      {entries === null && <p className="text-sm text-slate-500">Loading…</p>}
      {entries?.length === 0 && (
        <p className="rounded border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">No entries yet.</p>
      )}

      {entries?.length > 0 && (
        <div className="overflow-hidden rounded border border-slate-200">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">ID</th>
                <th className="px-3 py-2">Nationality</th>
                <th className="px-3 py-2">Arrival</th>
                <th className="px-3 py-2">Departure</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id} className="border-t border-slate-100">
                  <td className="px-3 py-2">{e.full_name}</td>
                  <td className="px-3 py-2">
                    {e.id_type} ····{e.id_last4}
                  </td>
                  <td className="px-3 py-2">
                    {e.nationality}
                    {e.form_c_required && (
                      <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                        Form C
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2">{e.arrival_at ? new Date(e.arrival_at).toLocaleString() : "—"}</td>
                  <td className="px-3 py-2">{e.departure_at ? new Date(e.departure_at).toLocaleString() : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
