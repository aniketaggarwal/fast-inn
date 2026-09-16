import { useEffect, useState } from "react";
import { api } from "../lib/api";

export function GuestBookingsPage() {
  const [bookings, setBookings] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [cancellingId, setCancellingId] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const data = await api.myBookings();
      setBookings(data.bookings);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const cancel = async (id) => {
    setCancellingId(id);
    try {
      await api.cancelBooking(id);
      await load();
    } catch (err) {
      setError(err.body?.error || err.message);
    } finally {
      setCancellingId(null);
    }
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="mb-4 text-2xl font-semibold text-slate-900">My bookings</h1>

      {loading && <p className="text-sm text-slate-500">Loading…</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="space-y-3">
        {bookings.map((b) => (
          <div key={b.id} className="rounded border border-slate-200 p-4">
            <div className="flex items-start justify-between">
              <div>
                <div className="font-medium text-slate-900">
                  {b.hotel_name} · {b.hotel_city}
                </div>
                <div className="text-sm text-slate-500">
                  Room {b.room_number} ({b.room_type}) · {b.check_in} → {b.check_out}
                </div>
                <div className="text-sm text-slate-500">₹{b.total_amount}</div>
              </div>
              <div className="flex flex-col items-end gap-2">
                <span
                  className={`rounded px-2 py-0.5 text-xs font-medium ${
                    b.status === "RESERVED"
                      ? "bg-green-100 text-green-800"
                      : b.status === "CANCELLED"
                        ? "bg-slate-100 text-slate-500"
                        : "bg-blue-100 text-blue-800"
                  }`}
                >
                  {b.status}
                </span>
                {b.status === "RESERVED" && (
                  <button
                    onClick={() => cancel(b.id)}
                    disabled={cancellingId === b.id}
                    className="text-sm text-red-600 underline disabled:opacity-50"
                  >
                    {cancellingId === b.id ? "Cancelling…" : "Cancel"}
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
        {!loading && bookings.length === 0 && <p className="text-sm text-slate-500">No bookings yet.</p>}
      </div>
    </div>
  );
}
