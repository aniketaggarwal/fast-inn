import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";

export function HotelDashboardPage() {
  const navigate = useNavigate();
  const [rooms, setRooms] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [startingId, setStartingId] = useState(null);
  const [checkingOutId, setCheckingOutId] = useState(null);

  const load = async () => {
    try {
      const [roomsData, bookingsData] = await Promise.all([api.hotelRooms(), api.hotelBookings()]);
      setRooms(roomsData.rooms);
      setBookings(bookingsData.bookings);
    } catch (err) {
      setError(err.body?.error || err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const startCheckin = async (bookingId) => {
    setStartingId(bookingId);
    setError(null);
    try {
      const session = await api.startCheckin(bookingId);
      navigate(`/checkin/session/${session.sessionId}`);
    } catch (err) {
      setError(err.body?.error || err.message);
      setStartingId(null);
    }
  };

  const checkout = async (bookingId) => {
    setCheckingOutId(bookingId);
    setError(null);
    try {
      await api.hotelCheckout(bookingId);
      await load();
    } catch (err) {
      setError(err.body?.error || err.message);
    } finally {
      setCheckingOutId(null);
    }
  };

  if (loading) return <p className="mx-auto max-w-4xl px-4 py-8 text-sm text-slate-500">Loading…</p>;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-900">Hotel dashboard</h1>
        <button
          onClick={() => navigate("/hotel/register")}
          className="rounded border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Guest register & Form C →
        </button>
      </div>
      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      <section className="mb-8">
        <h2 className="mb-3 text-lg font-medium text-slate-900">Rooms</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {rooms.map((room) => (
            <div key={room.id} className="rounded border border-slate-200 p-3">
              <div className="font-medium text-slate-900">Room {room.room_number}</div>
              <div className="text-sm text-slate-500">{room.room_type}</div>
              <div className="text-sm text-slate-500">₹{room.base_price} / night</div>
            </div>
          ))}
          {rooms.length === 0 && <p className="text-sm text-slate-500">No rooms.</p>}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-medium text-slate-900">Bookings</h2>
        <div className="overflow-hidden rounded border border-slate-200">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-3 py-2">Guest</th>
                <th className="px-3 py-2">Room</th>
                <th className="px-3 py-2">Dates</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Amount</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {bookings.map((b) => (
                <tr key={b.id} className="border-t border-slate-100">
                  <td className="px-3 py-2">{b.guest_email}</td>
                  <td className="px-3 py-2">
                    {b.room_number} ({b.room_type})
                  </td>
                  <td className="px-3 py-2">
                    {b.check_in} → {b.check_out}
                  </td>
                  <td className="px-3 py-2">{b.status}</td>
                  <td className="px-3 py-2">₹{b.total_amount}</td>
                  <td className="px-3 py-2">
                    {b.status === "RESERVED" && (
                      <button
                        onClick={() => startCheckin(b.id)}
                        disabled={startingId === b.id}
                        className="rounded bg-slate-900 px-2 py-1 text-xs text-white hover:bg-slate-700 disabled:opacity-50"
                      >
                        {startingId === b.id ? "Starting…" : "Check in"}
                      </button>
                    )}
                    {b.status === "CHECKED_IN" && (
                      <button
                        onClick={() => checkout(b.id)}
                        disabled={checkingOutId === b.id}
                        className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                      >
                        {checkingOutId === b.id ? "Checking out…" : "Check out"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {bookings.length === 0 && <p className="px-3 py-4 text-sm text-slate-500">No bookings yet.</p>}
        </div>
      </section>
    </div>
  );
}
