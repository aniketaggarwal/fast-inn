import { useEffect, useState } from "react";
import { api } from "../lib/api";

export function HotelDashboardPage() {
  const [rooms, setRooms] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [roomsData, bookingsData] = await Promise.all([api.hotelRooms(), api.hotelBookings()]);
        setRooms(roomsData.rooms);
        setBookings(bookingsData.bookings);
      } catch (err) {
        setError(err.body?.error || err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <p className="mx-auto max-w-4xl px-4 py-8 text-sm text-slate-500">Loading…</p>;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-semibold text-slate-900">Hotel dashboard</h1>
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
