import React from 'react';
import { Routes, Route } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Building2, Users, FileCheck, Shield, CheckCircle, Clock, XCircle } from 'lucide-react';
import Navigation from '../components/Common/Navigation';
import StatsCard  from '../components/Common/StatsCard';
import api from '../services/api';

function AdminHome() {
  const { data: hotels } = useQuery({
    queryKey: ['admin-hotels'],
    queryFn:  () => api.get('/hotels?status=pending&limit=50').then(r => r.data),
  });
  const { data: kyc } = useQuery({
    queryKey: ['admin-kyc-pending'],
    queryFn:  () => api.get('/guests/kyc?status=pending&limit=50').then(r => r.data),
  });

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <h1 className="page-title">Admin Panel</h1>
        <p className="page-subtitle">Platform-wide oversight and approvals</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatsCard icon={<Building2 size={22} />} label="Pending Hotels" value={hotels?.meta?.total || 0} color="amber" />
        <StatsCard icon={<Users size={22} />}     label="Pending KYC"   value={kyc?.meta?.total   || 0} color="brand" />
        <StatsCard icon={<CheckCircle size={22} />} label="Total Verified Hotels" value="—" color="emerald" />
        <StatsCard icon={<Shield size={22} />}    label="Reports Today" value="—" color="gold" />
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Pending Hotels */}
        <div className="card">
          <h2 className="font-semibold mb-4 flex items-center gap-2">
            <Building2 size={16} className="text-brand-400" /> Hotel Verifications
          </h2>
          {hotels?.data?.length === 0 && (
            <p className="text-white/40 text-sm py-4 text-center">No pending hotels</p>
          )}
          <div className="space-y-3">
            {(hotels?.data || []).slice(0, 5).map(h => (
              <div key={h.id} className="flex items-center justify-between p-3 bg-white/5 rounded-xl">
                <div>
                  <p className="font-medium text-sm">{h.name}</p>
                  <p className="text-white/40 text-xs">{h.city}, {h.state}</p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => api.patch(`/hotels/${h.id}/verify`).then(() => window.location.reload())}
                    className="p-1.5 rounded-lg bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 transition-colors"
                    title="Approve"
                  ><CheckCircle size={14} /></button>
                  <button
                    onClick={() => api.patch(`/hotels/${h.id}/reject`).then(() => window.location.reload())}
                    className="p-1.5 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors"
                    title="Reject"
                  ><XCircle size={14} /></button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Pending KYC */}
        <div className="card">
          <h2 className="font-semibold mb-4 flex items-center gap-2">
            <Users size={16} className="text-brand-400" /> KYC Verification Queue
          </h2>
          {kyc?.data?.length === 0 && (
            <p className="text-white/40 text-sm py-4 text-center">No pending KYC</p>
          )}
          <div className="space-y-3">
            {(kyc?.data || []).slice(0, 5).map(k => (
              <div key={k.id} className="flex items-center justify-between p-3 bg-white/5 rounded-xl">
                <div>
                  <p className="font-medium text-sm">{k.full_name}</p>
                  <p className="text-white/40 text-xs">{k.id_type} • Confidence: {Math.round((k.ocr_confidence_score || 0) * 100)}%</p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => api.patch(`/guests/kyc/${k.id}/verify`).then(() => window.location.reload())}
                    className="p-1.5 rounded-lg bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 transition-colors"
                    title="Approve"
                  ><CheckCircle size={14} /></button>
                  <button
                    onClick={() => {
                      const reason = prompt('Rejection reason:');
                      if (reason) api.patch(`/guests/kyc/${k.id}/reject`, { rejection_reason: reason }).then(() => window.location.reload());
                    }}
                    className="p-1.5 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors"
                    title="Reject"
                  ><XCircle size={14} /></button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AdminPanel() {
  return (
    <Navigation>
      <Routes>
        <Route index element={<AdminHome />} />
        <Route path="hotels" element={<div className="animate-fade-in"><div className="page-header"><h1 className="page-title">Hotel Management</h1></div><AdminHome /></div>} />
        <Route path="kyc"    element={<div className="animate-fade-in"><div className="page-header"><h1 className="page-title">KYC Queue</h1></div><AdminHome /></div>} />
      </Routes>
    </Navigation>
  );
}
