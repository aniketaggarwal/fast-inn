import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./lib/AuthContext";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { NavBar } from "./components/NavBar";
import { HomePage } from "./pages/HomePage";
import { LoginPage } from "./pages/LoginPage";
import { GuestHotelsPage } from "./pages/GuestHotelsPage";
import { GuestHotelDetailPage } from "./pages/GuestHotelDetailPage";
import { GuestBookingsPage } from "./pages/GuestBookingsPage";
import { HotelDashboardPage } from "./pages/HotelDashboardPage";

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <div className="min-h-screen bg-slate-50">
          <NavBar />
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route
              path="/hotels"
              element={
                <ProtectedRoute roles={["GUEST"]}>
                  <GuestHotelsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/hotels/:hotelId"
              element={
                <ProtectedRoute roles={["GUEST"]}>
                  <GuestHotelDetailPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/bookings"
              element={
                <ProtectedRoute roles={["GUEST"]}>
                  <GuestBookingsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute roles={["HOTEL_STAFF", "HOTEL_ADMIN"]}>
                  <HotelDashboardPage />
                </ProtectedRoute>
              }
            />
          </Routes>
        </div>
      </BrowserRouter>
    </AuthProvider>
  );
}
