import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, Filter, ChevronDown } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import api from '../../services/api';

const STATUS_OPTIONS = ['all', 'pending_kyc', 'kyc_verified', 'checked_in', 'checked_out', 'cancelled'];

const statusBadge = (status) => {
  const map = {
    pending_kyc:  'badge-pending',
    kyc_verified: 'badge-info',
    checked_in:   'badge-verified',
    checked_out:  'bg-white/10 text-white/50 border border-white/10',
    cancelled:    'badge-rejected',
  };
  return map[status] || 'badge-info';
};

export default function BookingList({ compact, showDocuments }) {
  const [status, setStatus]   = useState('all');
  const [search, setSearch]   = useState('');
  const [page, setPage]       = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['bookings', status, page],
    queryFn:  () => api.get('/bookings', { params: { status: status !== 'all' ? status : undefined, page, limit: compact ? 5 : 20 } }).then(r => r.data),
    keepPreviousData: true,
  });

  const bookings = data?.data || [];
  const filtered = search
    ? bookings.filter(b => b.guest_name?.toLowerCase().includes(search.toLowerCase()) || b.booking_reference?.toLowerCase().includes(search.toLowerCase()))
    : bookings;

  return (
    <div>
      {!compact && (
        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
            <input className="input pl-9" placeholder="Search guest name or reference..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <div className="relative">
            <select className="input appearance-none pr-8 cursor-pointer" value={status} onChange={e => setStatus(e.target.value)}>
              {STATUS_OPTIONS.map(s => <option key={s} value={s} className="bg-navy-800">{s === 'all' ? 'All Statuses' : s.replace('_', ' ')}</option>)}
            </select>
            <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 pointer-events-none" />
          </div>
        </div>
      )}

      <div className="table-container">
        <table className="table">
          <thead>
            <tr>
              <th>Reference</th>
              <th>Guest</th>
              {!compact && <th>Phone</th>}
              <th>Room</th>
              <th>Check-in</th>
              {!compact && <th>Check-out</th>}
              <th>KYC</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && [...Array(5)].map((_, i) => (
              <tr key={i}>
                {[...Array(compact ? 6 : 8)].map((_, j) => (
                  <td key={j}><div className="h-4 bg-white/10 rounded animate-pulse" /></td>
                ))}
              </tr>
            ))}
            {!isLoading && filtered.length === 0 && (
              <tr><td colSpan={compact ? 6 : 8} className="text-center py-8 text-white/40">No bookings found</td></tr>
            )}
            {filtered.map(b => (
              <tr key={b.id}>
                <td className="font-mono text-brand-300 text-xs">{b.booking_reference}</td>
                <td className="font-medium">{b.guest_name}</td>
                {!compact && <td className="text-white/60 text-xs">{b.guest_phone}</td>}
                <td>{b.room_number}</td>
                <td className="text-white/70 text-xs">{b.check_in_date}</td>
                {!compact && <td className="text-white/70 text-xs">{b.check_out_date}</td>}
                <td>
                  <span className={`badge ${b.kyc_status === 'verified' ? 'badge-verified' : b.kyc_status === 'rejected' ? 'badge-rejected' : 'badge-pending'}`}>
                    {b.kyc_status || 'none'}
                  </span>
                </td>
                <td>
                  <span className={`badge ${statusBadge(b.status)}`}>
                    {b.status?.replace('_', ' ')}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!compact && data?.meta?.total > 20 && (
        <div className="flex justify-center gap-2 mt-4">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="btn-secondary px-3 py-1.5 text-sm">Previous</button>
          <span className="px-3 py-1.5 text-sm text-white/60">Page {page}</span>
          <button onClick={() => setPage(p => p + 1)} className="btn-secondary px-3 py-1.5 text-sm">Next</button>
        </div>
      )}
    </div>
  );
}
