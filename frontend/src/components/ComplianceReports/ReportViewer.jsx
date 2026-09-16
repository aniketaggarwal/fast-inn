import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, ChevronDown, ChevronRight, BarChart3, Users, CheckCircle, XCircle } from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import api from '../../services/api';

function ProgressBar({ value, total, color = 'brand' }) {
  const pct = total > 0 ? (value / total) * 100 : 0;
  const colors = { brand: 'bg-brand-500', emerald: 'bg-emerald-500', amber: 'bg-amber-500', red: 'bg-red-500' };
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 bg-white/10 rounded-full h-2">
        <div className={`${colors[color]} h-2 rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-white/60 w-8 text-right">{Math.round(pct)}%</span>
    </div>
  );
}

export default function ReportViewer() {
  const [expanded, setExpanded] = useState(null);

  const { data, isLoading } = useQuery({
    queryKey: ['compliance-reports'],
    queryFn:  () => api.get('/compliance/reports').then(r => r.data.data),
  });

  const reports = data || [];

  const exportCSV = (report) => {
    const guests = report.report_data?.guests || [];
    const headers = ['Reference', 'Guest Name', 'Phone', 'Room', 'Check-in', 'Check-out', 'ID Type', 'KYC Status'];
    const rows = guests.map(g => [
      g.booking_reference, g.guest_name, g.guest_phone,
      g.room_number, g.check_in_date, g.check_out_date,
      g.id_type, g.kyc_status,
    ]);
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = `compliance_${report.report_period_start}_${report.report_period_end}.csv`;
    a.click();
  };

  if (isLoading) {
    return (
      <div className="card">
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => <div key={i} className="h-16 bg-white/10 rounded-xl animate-pulse" />)}
        </div>
      </div>
    );
  }

  if (!reports.length) {
    return (
      <div className="card text-center py-12">
        <BarChart3 size={40} className="mx-auto text-white/20 mb-3" />
        <p className="text-white/60">No compliance reports yet. Generate one above.</p>
      </div>
    );
  }

  return (
    <div className="card animate-fade-in">
      <h2 className="font-semibold mb-4 flex items-center gap-2">
        <BarChart3 size={18} className="text-brand-400" /> Compliance Reports ({reports.length})
      </h2>

      <div className="space-y-3">
        {reports.map(report => {
          const isOpen = expanded === report.id;
          const compliance = report.total_guests > 0
            ? ((report.verified_guests / report.total_guests) * 100).toFixed(1)
            : '0';

          return (
            <div key={report.id} className="border border-white/10 rounded-xl overflow-hidden">
              <button
                onClick={() => setExpanded(isOpen ? null : report.id)}
                className="w-full p-4 flex items-center justify-between hover:bg-white/5 transition-colors"
              >
                <div className="text-left">
                  <p className="font-medium text-sm">
                    {report.report_period_start} → {report.report_period_end}
                    {report.hotel_name && <span className="text-white/50 ml-2">· {report.hotel_name}</span>}
                  </p>
                  <p className="text-white/40 text-xs mt-0.5">
                    Generated {formatDistanceToNow(new Date(report.generated_at), { addSuffix: true })} · {report.total_guests} guests
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`badge ${parseFloat(compliance) >= 80 ? 'badge-verified' : parseFloat(compliance) >= 50 ? 'badge-pending' : 'badge-rejected'}`}>
                    {compliance}% compliant
                  </span>
                  {isOpen ? <ChevronDown size={16} className="text-white/40" /> : <ChevronRight size={16} className="text-white/40" />}
                </div>
              </button>

              {isOpen && (
                <div className="px-4 pb-4 border-t border-white/10 animate-slide-up">
                  {/* Summary */}
                  <div className="grid grid-cols-3 gap-4 py-4">
                    <div>
                      <p className="text-white/40 text-xs">Total Guests</p>
                      <p className="text-2xl font-bold">{report.total_guests}</p>
                    </div>
                    <div>
                      <p className="text-white/40 text-xs">Verified</p>
                      <p className="text-2xl font-bold text-emerald-400">{report.verified_guests}</p>
                    </div>
                    <div>
                      <p className="text-white/40 text-xs">Unverified</p>
                      <p className="text-2xl font-bold text-amber-400">{report.unverified_guests}</p>
                    </div>
                  </div>

                  <div className="mb-4">
                    <p className="text-xs text-white/40 mb-1">Compliance Rate</p>
                    <ProgressBar value={report.verified_guests} total={report.total_guests} color="emerald" />
                  </div>

                  {/* Guest table */}
                  {report.report_data?.guests?.length > 0 && (
                    <div className="table-container mb-4">
                      <table className="table text-xs">
                        <thead>
                          <tr><th>Guest</th><th>Room</th><th>Check-in</th><th>ID Type</th><th>KYC</th></tr>
                        </thead>
                        <tbody>
                          {report.report_data.guests.slice(0, 10).map((g, i) => (
                            <tr key={i}>
                              <td className="font-medium">{g.guest_name}</td>
                              <td>{g.room_number}</td>
                              <td>{g.check_in_date}</td>
                              <td className="capitalize">{g.id_type?.replace('_', ' ')}</td>
                              <td>
                                <span className={`badge text-xs ${g.kyc_status === 'verified' ? 'badge-verified' : 'badge-pending'}`}>
                                  {g.kyc_status}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  <button
                    onClick={() => exportCSV(report)}
                    className="btn-secondary text-sm flex items-center gap-2"
                    id={`export-csv-${report.id}`}
                  >
                    <Download size={14} /> Export CSV
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
