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
import { GuestKycPage } from "./pages/GuestKycPage";
import { GuestWalletPage } from "./pages/GuestWalletPage";
import { AdminReviewPage } from "./pages/AdminReviewPage";

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
              path="/kyc"
              element={
                <ProtectedRoute roles={["GUEST"]}>
                  <GuestKycPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/wallet"
              element={
                <ProtectedRoute roles={["GUEST"]}>
                  <GuestWalletPage />
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
            <Route
              path="/admin/review"
              element={
                <ProtectedRoute roles={["PLATFORM_ADMIN"]}>
                  <AdminReviewPage />
                </ProtectedRoute>
              }
            />
          </Routes>
        </div>
      </BrowserRouter>
    </AuthProvider>
  );
}
