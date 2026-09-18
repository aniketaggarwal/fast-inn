import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { HotelBanner } from "../components/HotelBanner";
import { StarRating } from "../components/StarRating";
import { AmenityIcon, MapPinIcon, ShieldCheckIcon } from "../components/icons";

function HotelCard({ hotel }) {
  const shownAmenities = (hotel.amenities || []).slice(0, 3);
  return (
    <Link
      to={`/hotels/${hotel.id}`}
      className="group flex flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md sm:flex-row"
    >
      <HotelBanner name={hotel.name} className="h-36 sm:h-auto sm:w-56 sm:rounded-l-lg sm:rounded-tr-none" />
      <div className="flex flex-1 flex-col justify-between p-4">
        <div>
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-semibold text-slate-900 group-hover:text-brand-700">{hotel.name}</h3>
            <StarRating rating={hotel.star_rating} />
          </div>
          <p className="mt-0.5 flex items-center gap-1 text-sm text-slate-500">
            <MapPinIcon className="h-3.5 w-3.5" />
            {hotel.city}
          </p>
          {hotel.description && <p className="mt-2 text-sm text-slate-600 line-clamp-2">{hotel.description}</p>}
          {shownAmenities.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-3">
              {shownAmenities.map((a) => (
                <span key={a} className="flex items-center gap-1 text-xs text-slate-500">
                  <AmenityIcon name={a} className="h-3.5 w-3.5" />
                  {a}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="mt-3 flex items-end justify-between">
          <span className="flex items-center gap-1 text-xs text-green-700">
            <ShieldCheckIcon className="h-3.5 w-3.5" />
            Verified check-in with face match
          </span>
          {hotel.from_price && (
            <div className="text-right">
              <div className="text-xs text-slate-400">From</div>
              <div className="font-semibold text-slate-900">
                ₹{Number(hotel.from_price).toLocaleString("en-IN")}
                <span className="text-xs font-normal text-slate-400"> / night</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}

function HotelCardSkeleton() {
  return (
    <div className="flex animate-pulse flex-col overflow-hidden rounded-lg border border-slate-200 bg-white sm:flex-row">
      <div className="h-36 bg-slate-200 sm:h-auto sm:w-56" />
      <div className="flex-1 space-y-3 p-4">
        <div className="h-4 w-1/2 rounded bg-slate-200" />
        <div className="h-3 w-1/3 rounded bg-slate-200" />
        <div className="h-3 w-full rounded bg-slate-200" />
        <div className="h-3 w-2/3 rounded bg-slate-200" />
      </div>
    </div>
  );
}

export function GuestHotelsPage() {
  const [hotels, setHotels] = useState([]);
  const [city, setCity] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = async (cityFilter) => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.listHotels(cityFilter);
      setHotels(data.hotels);
    } catch (err) {
      setError(err.body?.error || err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <div>
      <div className="bg-gradient-to-br from-brand-800 to-brand-600 px-4 py-12 text-white">
        <div className="mx-auto max-w-4xl">
          <h1 className="text-3xl font-bold sm:text-4xl">Find your next stay</h1>
          <p className="mt-2 text-brand-100">
            Book instantly, verify with a face scan at check-in — no ID copies left at the front desk.
          </p>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              load(city);
            }}
            className="mt-6 flex gap-2 rounded-lg bg-white p-2 shadow-lg"
          >
            <input
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="Where are you going? Try Goa, Mumbai, Jaipur…"
              className="flex-1 rounded px-3 py-2 text-sm text-slate-900 focus:outline-none"
            />
            <button
              type="submit"
              className="rounded bg-brand-600 px-5 py-2 text-sm font-medium text-white hover:bg-brand-700"
            >
              Search
            </button>
          </form>
        </div>
      </div>

      <div className="mx-auto max-w-4xl px-4 py-8">
        {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

        <div className="space-y-4">
          {loading &&
            Array.from({ length: 4 }).map((_, i) => <HotelCardSkeleton key={i} />)}
          {!loading && hotels.map((hotel) => <HotelCard key={hotel.id} hotel={hotel} />)}
          {!loading && hotels.length === 0 && !error && (
            <div className="rounded border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
              No hotels found{city ? ` in "${city}"` : ""}. Try a different city, or{" "}
              <button onClick={() => { setCity(""); load(); }} className="text-brand-700 underline">
                clear the search
              </button>
              .
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
