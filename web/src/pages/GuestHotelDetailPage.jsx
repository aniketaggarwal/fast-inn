import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "../lib/api";

function defaultDate(daysFromNow) {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString().slice(0, 10);
}

export function GuestHotelDetailPage() {
  const { hotelId } = useParams();
  const navigate = useNavigate();
  const [from, setFrom] = useState(defaultDate(1));
  const [to, setTo] = useState(defaultDate(2));
  const [rooms, setRooms] = useState(null);
  const [error, setError] = useState(null);
  const [bookingRoomId, setBookingRoomId] = useState(null);
  const [message, setMessage] = useState(null);

  const search = async (e) => {
    e?.preventDefault();
    setError(null);
    setMessage(null);
    try {
      const data = await api.availability(hotelId, from, to);
      setRooms(data.rooms);
    } catch (err) {
      setError(err.body?.error || err.message);
    }
  };

  const book = async (roomId) => {
    setBookingRoomId(roomId);
    setError(null);
    setMessage(null);
    try {
      await api.createBooking(hotelId, roomId, from, to);
      setMessage("Booked! Check My bookings to see it.");
      search();
    } catch (err) {
      setError(err.body?.error || err.message);
    } finally {
      setBookingRoomId(null);
    }
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <button onClick={() => navigate("/hotels")} className="mb-4 text-sm text-slate-500 underline">
        ← Back to hotels
      </button>
      <h1 className="mb-4 text-2xl font-semibold text-slate-900">Room availability</h1>

      <form onSubmit={search} className="mb-6 flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Check-in</label>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="rounded border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Check-out</label>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="rounded border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <button type="submit" className="rounded bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-700">
          Check availability
        </button>
      </form>

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}
      {message && <p className="mb-4 text-sm text-green-700">{message}</p>}

      {rooms && (
        <div className="space-y-3">
          {rooms.map((room) => (
            <div
              key={room.id}
              className="flex items-center justify-between rounded border border-slate-200 p-4"
            >
              <div>
                <div className="font-medium text-slate-900">
                  Room {room.room_number} · {room.room_type}
                </div>
                <div className="text-sm text-slate-500">₹{room.base_price} / night</div>
              </div>
              {room.available ? (
                <button
                  onClick={() => book(room.id)}
                  disabled={bookingRoomId === room.id}
                  className="rounded bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-700 disabled:opacity-50"
                >
                  {bookingRoomId === room.id ? "Booking…" : "Book"}
                </button>
              ) : (
                <span className="rounded bg-slate-100 px-3 py-1.5 text-sm text-slate-500">Unavailable</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
