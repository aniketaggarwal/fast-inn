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
import { StaffCheckinSessionPage } from "./pages/StaffCheckinSessionPage";
import { GuestCheckinPresentPage } from "./pages/GuestCheckinPresentPage";
import { HotelRegisterPage } from "./pages/HotelRegisterPage";
import { GuestMyDataPage } from "./pages/GuestMyDataPage";
import { AdminPanelPage } from "./pages/AdminPanelPage";

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <div className="min-h-screen bg-slate-50">
          <NavBar />
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/login" element={<LoginPage />} />
            {/* Public — a real booking site lets you browse before you sign
                in; login is only required at the "Book" action itself
                (GuestHotelDetailPage prompts for it inline). */}
            <Route path="/hotels" element={<GuestHotelsPage />} />
            <Route path="/hotels/:hotelId" element={<GuestHotelDetailPage />} />
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
              path="/my-data"
              element={
                <ProtectedRoute roles={["GUEST"]}>
                  <GuestMyDataPage />
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
              path="/hotel/register"
              element={
                <ProtectedRoute roles={["HOTEL_STAFF", "HOTEL_ADMIN"]}>
                  <HotelRegisterPage />
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
            <Route
              path="/admin/panel"
              element={
                <ProtectedRoute roles={["PLATFORM_ADMIN"]}>
                  <AdminPanelPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/checkin/session/:sessionId"
              element={
                <ProtectedRoute roles={["HOTEL_STAFF", "HOTEL_ADMIN"]}>
                  <StaffCheckinSessionPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/checkin/present"
              element={
                <ProtectedRoute roles={["GUEST"]}>
                  <GuestCheckinPresentPage />
                </ProtectedRoute>
              }
            />
          </Routes>
        </div>
      </BrowserRouter>
    </AuthProvider>
  );
}
