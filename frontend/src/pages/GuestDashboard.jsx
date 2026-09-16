import React from 'react';
import { Routes, Route } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { FileCheck, BookOpen, Clock, CheckCircle, AlertCircle } from 'lucide-react';
import Navigation from '../components/Common/Navigation';
import StatsCard  from '../components/Common/StatsCard';
import IDUpload   from '../components/KYC/IDUpload';
import VerificationStatus from '../components/KYC/VerificationStatus';
import { useAuth } from '../store/authContext';
import api from '../services/api';

function GuestHome() {
  const { user } = useAuth();

  const { data: kycData, isLoading: kycLoading } = useQuery({
    queryKey: ['kyc-status'],
    queryFn:  () => api.get('/guests/kyc/status').then(r => r.data.data),
  });

  const { data: bookingsData, isLoading: bookingsLoading } = useQuery({
    queryKey: ['my-bookings'],
    queryFn:  () => api.get('/bookings').then(r => r.data.data),
  });

  const bookings = bookingsData || [];

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <h1 className="page-title">Welcome back, {user?.full_name?.split(' ')[0]} 👋</h1>
        <p className="page-subtitle">Manage your KYC and hotel bookings</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatsCard icon="🪪" label="KYC Status" color="brand"
          value={kycData ? kycData.verification_status : 'Not Submitted'} loading={kycLoading} />
        <StatsCard icon="📋" label="Total Bookings" color="emerald"
          value={bookings.length} loading={bookingsLoading} />
        <StatsCard icon="🏨" label="Active Stay" color="amber"
          value={bookings.filter(b => b.status === 'checked_in').length} loading={bookingsLoading} />
        <StatsCard icon="✅" label="Completed Stays" color="gold"
          value={bookings.filter(b => b.status === 'checked_out').length} loading={bookingsLoading} />
      </div>

      {/* KYC Status Banner */}
      {!kycLoading && (
        <div className="mb-6">
          {!kycData ? (
            <div className="card border-amber-500/30 bg-amber-500/5">
              <div className="flex items-start gap-3">
                <AlertCircle size={20} className="text-amber-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-amber-400">KYC Not Submitted</p>
                  <p className="text-white/60 text-sm mt-1">
                    Upload your government ID to enable hotel check-ins.
                  </p>
                </div>
              </div>
            </div>
          ) : kycData.verification_status === 'pending' ? (
            <div className="card border-brand-500/30 bg-brand-500/5">
              <div className="flex items-center gap-3">
                <Clock size={20} className="text-brand-400" />
                <div>
                  <p className="font-semibold text-brand-400">KYC Under Review</p>
                  <p className="text-white/60 text-sm mt-0.5">Our team is reviewing your documents. Usually takes 2–4 hours.</p>
                </div>
              </div>
            </div>
          ) : kycData.verification_status === 'verified' ? (
            <div className="card border-emerald-500/30 bg-emerald-500/5">
              <div className="flex items-center gap-3">
                <CheckCircle size={20} className="text-emerald-400" />
                <div>
                  <p className="font-semibold text-emerald-400">KYC Verified ✓</p>
                  <p className="text-white/60 text-sm mt-0.5">You're all set for seamless hotel check-ins.</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="card border-red-500/30 bg-red-500/5">
              <div className="flex items-start gap-3">
                <AlertCircle size={20} className="text-red-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-red-400">KYC Rejected</p>
                  <p className="text-white/60 text-sm mt-1">Reason: {kycData.rejection_reason}</p>
                  <p className="text-white/40 text-xs mt-1">Please re-upload a clear document.</p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Recent Bookings */}
      <div className="card">
        <h2 className="font-semibold text-lg mb-4 flex items-center gap-2">
          <BookOpen size={18} className="text-brand-400" /> Recent Bookings
        </h2>
        {bookings.length === 0 ? (
          <div className="text-center py-12 text-white/40">
            <BookOpen size={40} className="mx-auto mb-3 opacity-30" />
            <p>No bookings yet.</p>
          </div>
        ) : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Reference</th><th>Hotel</th><th>Room</th>
                  <th>Check-in</th><th>Check-out</th><th>Status</th>
                </tr>
              </thead>
              <tbody>
                {bookings.slice(0, 5).map(b => (
                  <tr key={b.id}>
                    <td className="font-mono text-brand-300">{b.booking_reference}</td>
                    <td className="font-medium">{b.hotel_name}</td>
                    <td>{b.room_number}</td>
                    <td>{b.check_in_date}</td>
                    <td>{b.check_out_date}</td>
                    <td>
                      <span className={`badge ${
                        b.status === 'checked_in'  ? 'badge-verified' :
                        b.status === 'checked_out' ? 'badge-info'     :
                        b.status === 'cancelled'   ? 'badge-rejected' : 'badge-pending'
                      }`}>{b.status.replace('_', ' ')}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default function GuestDashboard() {
  return (
    <Navigation>
      <Routes>
        <Route index    element={<GuestHome />} />
        <Route path="kyc" element={<div className="animate-fade-in"><div className="page-header"><h1 className="page-title">KYC Verification</h1><p className="page-subtitle">Upload your government ID for hotel check-ins</p></div><IDUpload /><div className="mt-6"><VerificationStatus /></div></div>} />
        <Route path="bookings" element={<div className="animate-fade-in"><div className="page-header"><h1 className="page-title">My Bookings</h1></div><GuestHome /></div>} />
      </Routes>
    </Navigation>
  );
}
