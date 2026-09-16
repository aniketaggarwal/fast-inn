import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './store/authContext';

// Pages
import LandingPage    from './pages/LandingPage';
import LoginPage      from './pages/LoginPage';
import RegisterPage   from './pages/RegisterPage';
import GuestDashboard from './pages/GuestDashboard';
import HotelDashboard from './pages/HotelDashboard';
import AdminPanel     from './pages/AdminPanel';
import BookingFlow    from './pages/BookingFlow';

// Common
import ProtectedRoute from './components/Common/ProtectedRoute';

function LoadingScreen() {
  return (
    <div className="min-h-screen bg-gradient-navy flex items-center justify-center">
      <div className="flex flex-col items-center gap-4 animate-fade-in">
        <div className="w-16 h-16 rounded-2xl bg-gradient-brand flex items-center justify-center shadow-glow-lg animate-pulse-glow">
          <span className="text-3xl">🏨</span>
        </div>
        <div className="spinner w-8 h-8" />
        <p className="text-white/60 text-sm">Loading HotelVerify...</p>
      </div>
    </div>
  );
}

function RoleDashboard() {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (user.role === 'admin')       return <Navigate to="/admin" replace />;
  if (user.role === 'hotel_staff') return <Navigate to="/hotel" replace />;
  return <Navigate to="/guest" replace />;
}

export default function App() {
  const { isLoading } = useAuth();

  if (isLoading) return <LoadingScreen />;

  return (
    <Routes>
      {/* Public */}
      <Route path="/"         element={<LandingPage />} />
      <Route path="/login"    element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />

      {/* Role-based redirect */}
      <Route path="/dashboard" element={<ProtectedRoute><RoleDashboard /></ProtectedRoute>} />

      {/* Guest */}
      <Route path="/guest/*"  element={<ProtectedRoute roles={['guest']}><GuestDashboard /></ProtectedRoute>} />
      <Route path="/booking"  element={<ProtectedRoute roles={['guest']}><BookingFlow /></ProtectedRoute>} />

      {/* Hotel staff */}
      <Route path="/hotel/*"  element={<ProtectedRoute roles={['hotel_staff', 'admin']}><HotelDashboard /></ProtectedRoute>} />

      {/* Admin */}
      <Route path="/admin/*"  element={<ProtectedRoute roles={['admin']}><AdminPanel /></ProtectedRoute>} />

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
