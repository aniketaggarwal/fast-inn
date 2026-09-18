import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../lib/AuthContext";
import { HotelBanner } from "../components/HotelBanner";
import { StarRating } from "../components/StarRating";
import { AmenityIcon, MapPinIcon, ShieldCheckIcon } from "../components/icons";

function defaultDate(daysFromNow) {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString().slice(0, 10);
}

export function GuestHotelDetailPage() {
  const { hotelId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [hotel, setHotel] = useState(null);
  const [hotelError, setHotelError] = useState(null);
  const [from, setFrom] = useState(defaultDate(1));
  const [to, setTo] = useState(defaultDate(2));
  const [rooms, setRooms] = useState(null);
  const [error, setError] = useState(null);
  const [bookingRoomId, setBookingRoomId] = useState(null);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    setHotel(null);
    setHotelError(null);
    api
      .getHotel(hotelId)
      .then((data) => setHotel(data.hotel))
      .catch((err) => setHotelError(err.body?.error || err.message));
  }, [hotelId]);

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

  // Runs on mount / hotelId change only — from/to intentionally aren't
  // deps here, `search` re-reads their latest values itself when the form
  // is submitted instead.
  useEffect(() => {
    search();
  }, [hotelId]);

  const book = async (roomId) => {
    if (!user) {
      navigate("/login", { state: { from: `/hotels/${hotelId}` } });
      return;
    }
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

  if (hotelError) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8">
        <p className="text-sm text-red-600">{hotelError}</p>
        <Link to="/hotels" className="mt-2 inline-block text-sm text-brand-700 underline">
          ← Back to hotels
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <button onClick={() => navigate("/hotels")} className="mb-4 text-sm text-slate-500 hover:text-slate-700">
        ← Back to hotels
      </button>

      {hotel ? (
        <>
          <HotelBanner name={hotel.name} className="h-40 rounded-lg" />
          <div className="mt-4 flex items-start justify-between gap-2">
            <div>
              <h1 className="text-2xl font-semibold text-slate-900">{hotel.name}</h1>
              <p className="mt-0.5 flex items-center gap-1 text-sm text-slate-500">
                <MapPinIcon className="h-4 w-4" />
                {hotel.address || hotel.city}
              </p>
            </div>
            <StarRating rating={hotel.star_rating} className="mt-1" />
          </div>
          {hotel.description && <p className="mt-3 text-sm text-slate-600">{hotel.description}</p>}
          {hotel.amenities?.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-4">
              {hotel.amenities.map((a) => (
                <span key={a} className="flex items-center gap-1.5 text-sm text-slate-600">
                  <AmenityIcon name={a} className="h-4 w-4 text-brand-600" />
                  {a}
                </span>
              ))}
            </div>
          )}
          <div className="mt-4 flex items-center gap-1.5 rounded border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
            <ShieldCheckIcon className="h-4 w-4" />
            Check in here with a face scan — no ID photocopy left at the desk.
          </div>
        </>
      ) : (
        <div className="h-40 animate-pulse rounded-lg bg-slate-200" />
      )}

      <h2 className="mb-4 mt-8 text-lg font-semibold text-slate-900">Rooms</h2>

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
        <button type="submit" className="rounded bg-brand-600 px-4 py-2 text-sm text-white hover:bg-brand-700">
          Check availability
        </button>
      </form>

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}
      {message && <p className="mb-4 text-sm text-green-700">{message}</p>}
      {!user && (
        <p className="mb-4 rounded border border-brand-200 bg-brand-50 px-3 py-2 text-sm text-brand-800">
          <Link to="/login" state={{ from: `/hotels/${hotelId}` }} className="font-medium underline">
            Log in
          </Link>{" "}
          to book a room.
        </p>
      )}

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
                <div className="text-sm text-slate-500">₹{Number(room.base_price).toLocaleString("en-IN")} / night</div>
              </div>
              {room.available ? (
                <button
                  onClick={() => book(room.id)}
                  disabled={bookingRoomId === room.id}
                  className="rounded bg-brand-600 px-4 py-2 text-sm text-white hover:bg-brand-700 disabled:opacity-50"
                >
                  {bookingRoomId === room.id ? "Booking…" : "Book"}
                </button>
              ) : (
                <span className="rounded bg-slate-100 px-3 py-1.5 text-sm text-slate-500">Unavailable</span>
              )}
            </div>
          ))}
          {rooms.length === 0 && (
            <p className="rounded border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
              This hotel has no rooms configured yet.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
