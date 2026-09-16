import { Navigate } from "react-router-dom";
import { useAuth } from "../lib/AuthContext";

export function HomePage() {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (user.role === "GUEST") return <Navigate to="/hotels" replace />;
  if (user.role === "HOTEL_STAFF" || user.role === "HOTEL_ADMIN") return <Navigate to="/dashboard" replace />;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-semibold text-slate-900">Platform admin</h1>
      <p className="mt-2 text-sm text-slate-500">
        The admin panel (onboard hotels, revoke credentials, audit log) lands in Milestone 7. Nothing here yet.
      </p>
    </div>
  );
}
