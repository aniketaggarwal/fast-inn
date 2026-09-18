import { Navigate } from "react-router-dom";
import { useAuth } from "../lib/AuthContext";

export function HomePage() {
  const { user } = useAuth();
  // A real booking site's home page is the listings, not a login wall —
  // login is only required at the "Book" action itself.
  if (!user) return <Navigate to="/hotels" replace />;
  if (user.role === "GUEST") return <Navigate to="/hotels" replace />;
  if (user.role === "HOTEL_STAFF" || user.role === "HOTEL_ADMIN") return <Navigate to="/dashboard" replace />;
  if (user.role === "PLATFORM_ADMIN") return <Navigate to="/admin/review" replace />;
  return <Navigate to="/login" replace />;
}
