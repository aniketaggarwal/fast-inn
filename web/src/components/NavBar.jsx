import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/AuthContext";

export function NavBar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <nav className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
        <Link to="/" className="text-lg font-semibold text-slate-900">
          HotelVerify
        </Link>
        <div className="flex items-center gap-4 text-sm">
          {user?.role === "GUEST" && (
            <>
              <Link to="/hotels" className="text-slate-600 hover:text-slate-900">
                Browse hotels
              </Link>
              <Link to="/bookings" className="text-slate-600 hover:text-slate-900">
                My bookings
              </Link>
            </>
          )}
          {(user?.role === "HOTEL_STAFF" || user?.role === "HOTEL_ADMIN") && (
            <Link to="/dashboard" className="text-slate-600 hover:text-slate-900">
              Dashboard
            </Link>
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
            <Link to="/login" className="rounded bg-slate-900 px-3 py-1.5 text-white hover:bg-slate-700">
              Log in
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
}
