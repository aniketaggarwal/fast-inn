import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";

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
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="mb-4 text-2xl font-semibold text-slate-900">Hotels</h1>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          load(city);
        }}
        className="mb-6 flex gap-2"
      >
        <input
          value={city}
          onChange={(e) => setCity(e.target.value)}
          placeholder="Filter by city…"
          className="flex-1 rounded border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
        />
        <button type="submit" className="rounded bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-700">
          Search
        </button>
      </form>

      {loading && <p className="text-sm text-slate-500">Loading…</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="space-y-3">
        {hotels.map((hotel) => (
          <Link
            key={hotel.id}
            to={`/hotels/${hotel.id}`}
            className="block rounded border border-slate-200 p-4 hover:border-slate-400"
          >
            <div className="font-medium text-slate-900">{hotel.name}</div>
            <div className="text-sm text-slate-500">{hotel.city}</div>
          </Link>
        ))}
        {!loading && hotels.length === 0 && <p className="text-sm text-slate-500">No hotels found.</p>}
      </div>
    </div>
  );
}
