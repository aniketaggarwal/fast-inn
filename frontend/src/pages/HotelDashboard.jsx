import React from 'react';
import { Routes, Route } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Users, ClipboardCheck, Clock, TrendingUp } from 'lucide-react';
import Navigation from '../components/Common/Navigation';
import StatsCard  from '../components/Common/StatsCard';
import BookingList from '../components/HotelDashboard/BookingList';
import GuestCheckInForm from '../components/HotelDashboard/GuestCheckInForm';
import DocumentVerification from '../components/HotelDashboard/DocumentVerification';
import ReportGenerator from '../components/ComplianceReports/ReportGenerator';
import ReportViewer    from '../components/ComplianceReports/ReportViewer';
import api from '../services/api';

function HotelHome() {
  const { data, isLoading } = useQuery({
    queryKey: ['hotel-dashboard'],
    queryFn:  () => api.get('/hotels/my/dashboard').then(r => r.data.data),
    refetchInterval: 60000,
  });

  const stats = data?.stats || {};

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <h1 className="page-title">{data?.hotel?.name || 'Hotel Dashboard'}</h1>
        <p className="page-subtitle">{data?.hotel?.city}, {data?.hotel?.state} — Live Operations</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatsCard icon={<Users size={22} />}         label="Today's Arrivals"  value={stats.today_arrivals}   color="brand"   loading={isLoading} />
        <StatsCard icon={<ClipboardCheck size={22} />} label="Today's Departures" value={stats.today_departures} color="emerald" loading={isLoading} />
        <StatsCard icon={<Clock size={22} />}          label="Pending KYC"       value={stats.pending_kyc}      color="amber"   loading={isLoading} />
        <StatsCard icon={<TrendingUp size={22} />}     label="Occupancy"         value={data?.hotel?.room_count ? `${Math.round(((stats.today_arrivals||0)/data.hotel.room_count)*100)}%` : '—'} color="gold" loading={isLoading} />
      </div>

      {/* Today's arrivals */}
      <div className="card">
        <h2 className="font-semibold text-lg mb-4">Today's Check-ins</h2>
        <BookingList compact />
      </div>
    </div>
  );
}

export default function HotelDashboard() {
  return (
    <Navigation>
      <Routes>
        <Route index              element={<HotelHome />} />
        <Route path="guests"      element={<div className="animate-fade-in"><div className="page-header"><h1 className="page-title">Guest Queue</h1><p className="page-subtitle">Review and verify guest KYC documents</p></div><DocumentVerification /></div>} />
        <Route path="checkin"     element={<div className="animate-fade-in"><div className="page-header"><h1 className="page-title">Check-in / Check-out</h1><p className="page-subtitle">Process guest arrivals and departures</p></div><GuestCheckInForm /></div>} />
        <Route path="documents"   element={<div className="animate-fade-in"><div className="page-header"><h1 className="page-title">Guest Documents</h1></div><BookingList showDocuments /></div>} />
        <Route path="compliance"  element={<div className="animate-fade-in"><div className="page-header"><h1 className="page-title">Compliance Reports</h1><p className="page-subtitle">Generate FRRO Form C and police reports</p></div><ReportGenerator /><div className="mt-6"><ReportViewer /></div></div>} />
      </Routes>
    </Navigation>
  );
}
