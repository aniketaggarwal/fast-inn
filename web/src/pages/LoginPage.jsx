import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../lib/AuthContext";
import { api } from "../lib/api";

const DEMO_ACCOUNTS = [
  { label: "Guest", email: "guest1@hotelverify.test" },
  { label: "Hotel staff", email: "staff.ramaiah@hotelverify.test" },
  { label: "Admin", email: "admin@hotelverify.test" },
];

export function LoginPage() {
  const { login, register } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [demo, setDemo] = useState(false);

  useEffect(() => {
    api.health().then((h) => setDemo(Boolean(h.demo))).catch(() => {});
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const user = mode === "login" ? await login(email, password) : await register(email, password);
      // Sent here from "log in to book" on a hotel page — go back there
      // instead of always landing on the plain hotel list.
      const returnTo = location.state?.from;
      if (user.role === "GUEST" && returnTo) {
        navigate(returnTo);
      } else {
        navigate(user.role === "GUEST" ? "/hotels" : "/dashboard");
      }
    } catch (err) {
      setError(err.body?.error || err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto mt-16 max-w-sm px-4">
      <h1 className="mb-1 text-2xl font-semibold text-slate-900">
        {mode === "login" ? "Log in" : "Create a guest account"}
      </h1>
      <p className="mb-6 text-sm text-slate-500">
        {mode === "login"
          ? "Guests, hotel staff, and admins all log in here."
          : "Self-registration always creates a GUEST account. Staff and admin accounts are provisioned separately."}
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Email</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Password</label>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
          />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
        >
          {busy ? "Please wait…" : mode === "login" ? "Log in" : "Register"}
        </button>
      </form>

      {demo && mode === "login" && (
        <div className="mt-6 rounded-lg border border-brand-200 bg-brand-50 p-3">
          <p className="text-xs font-medium text-brand-900">Demo accounts — tap to fill</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {DEMO_ACCOUNTS.map((a) => (
              <button
                key={a.email}
                type="button"
                onClick={() => {
                  setEmail(a.email);
                  setPassword("Password123!");
                }}
                className="rounded-full border border-brand-300 bg-white px-3 py-1 text-xs font-medium text-brand-800 hover:bg-brand-100"
              >
                {a.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <button
        onClick={() => setMode(mode === "login" ? "register" : "login")}
        className="mt-4 text-sm text-slate-500 underline"
      >
        {mode === "login" ? "New guest? Create an account" : "Already have an account? Log in"}
      </button>
    </div>
  );
}
