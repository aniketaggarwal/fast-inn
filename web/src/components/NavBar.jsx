import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/AuthContext";
import { BedIcon } from "./icons";

const linkClass = "text-slate-600 hover:text-slate-900";

export function NavBar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <nav className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-y-2 px-4 py-3">
        <Link to="/" className="flex items-center gap-1.5 text-lg font-bold text-slate-900">
          <BedIcon className="h-5 w-5 text-brand-600" />
          HotelVerify
        </Link>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          {/* Browsing hotels needs no login — matches how the routes
              themselves are public (App.jsx, api/src/routes/hotels.js). */}
          {(!user || user.role === "GUEST") && (
            <Link to="/hotels" className={linkClass}>
              Browse hotels
            </Link>
          )}
          {user?.role === "GUEST" && (
            <>
              <Link to="/bookings" className={linkClass}>
                My bookings
              </Link>
              <Link to="/kyc" className={linkClass}>
                Verify identity
              </Link>
              <Link to="/wallet" className={linkClass}>
                Wallet
              </Link>
              <Link to="/my-data" className={linkClass}>
                My data
              </Link>
            </>
          )}
          {(user?.role === "HOTEL_STAFF" || user?.role === "HOTEL_ADMIN") && (
            <>
              <Link to="/dashboard" className={linkClass}>
                Dashboard
              </Link>
              <Link to="/hotel/register" className={linkClass}>
                Register
              </Link>
            </>
          )}
          {user?.role === "PLATFORM_ADMIN" && (
            <>
              <Link to="/admin/review" className={linkClass}>
                KYC review
              </Link>
              <Link to="/admin/panel" className={linkClass}>
                Admin panel
              </Link>
            </>
          )}
          {user ? (
            <>
              <span className="text-slate-500">
                {user.email} <span className="text-slate-400">({user.role})</span>
              </span>
              <button
                onClick={handleLogout}
                className="rounded bg-slate-900 px-3 py-1.5 text-white hover:bg-slate-700"
              >
                Log out
              </button>
            </>
          ) : (
            <Link to="/login" className="rounded bg-brand-600 px-3 py-1.5 text-white hover:bg-brand-700">
              Log in
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
}
