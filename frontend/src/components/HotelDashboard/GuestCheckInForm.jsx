import React, { useState, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { QrCode, KeyRound, CheckCircle, XCircle, Loader2, User, Calendar, Home } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../services/api';

export default function GuestCheckInForm() {
  const queryClient = useQueryClient();
  const [bookingId, setBookingId] = useState('');
  const [pin, setPin]             = useState('');
  const [tab, setTab]             = useState('checkin'); // 'checkin' | 'checkout'
  const [foundBooking, setFoundBooking] = useState(null);
  const pinRefs = useRef([]);

  // Look up booking by reference
  const { data: bookings } = useQuery({
    queryKey: ['today-checkins'],
    queryFn:  () => api.get('/checkin/today').then(r => r.data.data),
    refetchInterval: 30000,
  });

  const checkInMutation = useMutation({
    mutationFn: (data) => api.post('/checkin', data),
    onSuccess: () => {
      toast.success('✅ Check-in successful!');
      setBookingId(''); setPin(''); setFoundBooking(null);
      queryClient.invalidateQueries({ queryKey: ['today-checkins', 'bookings'] });
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Check-in failed'),
  });

  const checkOutMutation = useMutation({
    mutationFn: (data) => api.post('/checkin/checkout', data),
    onSuccess: () => {
      toast.success('✅ Check-out successful!');
      setBookingId(''); setPin(''); setFoundBooking(null);
      queryClient.invalidateQueries({ queryKey: ['today-checkins', 'bookings'] });
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Check-out failed'),
  });

  // Find booking when bookingId changes
  const handleBookingSearch = () => {
    const b = bookings?.find(b => b.booking_reference === bookingId.toUpperCase() || b.id === bookingId);
    if (b) setFoundBooking(b);
    else toast.error('Booking not found in today\'s arrivals');
  };

  const handlePinInput = (val, idx) => {
    const newPin = pin.split('');
    newPin[idx] = val;
    setPin(newPin.join(''));
    if (val && idx < 5) pinRefs.current[idx + 1]?.focus();
  };

  const handleSubmit = () => {
    if (!foundBooking) return toast.error('Select a booking first');
    if (pin.length !== 6) return toast.error('Enter 6-digit PIN');
    if (tab === 'checkin') {
      checkInMutation.mutate({ booking_id: foundBooking.id, pin_code: pin });
    } else {
      checkOutMutation.mutate({ booking_id: foundBooking.id });
    }
  };

  const isPending = checkInMutation.isPending || checkOutMutation.isPending;

  return (
    <div className="grid lg:grid-cols-2 gap-6 animate-fade-in">
      {/* Left: Form */}
      <div className="card">
        {/* Tab */}
        <div className="flex bg-white/5 rounded-xl p-1 mb-6">
          {[['checkin', 'Check-in', '🚪'], ['checkout', 'Check-out', '🚀']].map(([value, label, emoji]) => (
            <button
              key={value}
              onClick={() => setTab(value)}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${tab === value ? 'bg-gradient-brand shadow-glow text-white' : 'text-white/50 hover:text-white'}`}
            >
              {emoji} {label}
            </button>
          ))}
        </div>

        {/* Booking reference */}
        <div className="mb-4">
          <label className="input-label">Booking Reference or ID</label>
          <div className="flex gap-2">
            <input
              className="input flex-1"
              placeholder="e.g. HV1A2B3C"
              value={bookingId}
              onChange={e => setBookingId(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleBookingSearch()}
            />
            <button onClick={handleBookingSearch} className="btn-secondary px-4">Find</button>
          </div>
        </div>

        {/* Found booking info */}
        {foundBooking && (
          <div className="mb-4 p-3 bg-brand-500/10 border border-brand-500/20 rounded-xl text-sm">
            <div className="flex items-center gap-2 mb-2">
              <User size={14} className="text-brand-400" />
              <span className="font-semibold">{foundBooking.full_name}</span>
              <span className={`badge text-xs ${foundBooking.kyc_status === 'verified' ? 'badge-verified' : 'badge-pending'}`}>KYC {foundBooking.kyc_status}</span>
            </div>
            <div className="flex items-center gap-4 text-white/60 text-xs">
              <span className="flex items-center gap-1"><Home size={10} /> Room {foundBooking.room_number}</span>
              <span className="flex items-center gap-1"><Calendar size={10} /> {foundBooking.check_in_date} → {foundBooking.check_out_date}</span>
            </div>
          </div>
        )}

        {/* PIN entry (check-in only) */}
        {tab === 'checkin' && (
          <div className="mb-6">
            <label className="input-label flex items-center gap-2"><KeyRound size={14} /> 6-Digit PIN</label>
            <div className="flex gap-2">
              {[...Array(6)].map((_, i) => (
                <input
                  key={i}
                  ref={el => pinRefs.current[i] = el}
                  maxLength={1}
                  className="w-10 h-12 text-center text-xl font-bold bg-navy-700 border border-white/10 rounded-xl focus:border-brand-500 focus:ring-1 focus:ring-brand-500/50 outline-none transition-all"
                  value={pin[i] || ''}
                  onChange={(e) => handlePinInput(e.target.value.replace(/\D/, ''), i)}
                  onKeyDown={(e) => e.key === 'Backspace' && !pin[i] && i > 0 && pinRefs.current[i - 1]?.focus()}
                  inputMode="numeric"
                />
              ))}
            </div>
            <p className="text-white/40 text-xs mt-2">Guest receives this PIN in their booking confirmation</p>
          </div>
        )}

        <button
          onClick={handleSubmit}
          disabled={isPending || !foundBooking}
          className={`w-full flex items-center justify-center gap-2 font-semibold py-3 rounded-xl transition-all ${
            tab === 'checkin' ? 'btn-primary' : 'btn-danger'
          }`}
          id={`${tab}-submit`}
        >
          {isPending
            ? <><Loader2 size={18} className="animate-spin" /> Processing...</>
            : tab === 'checkin'
              ? <><CheckCircle size={18} /> Complete Check-in</>
              : <><XCircle size={18} /> Complete Check-out</>
          }
        </button>
      </div>

      {/* Right: Today's arrivals list */}
      <div className="card">
        <h3 className="font-semibold mb-4">Today's Arrivals ({bookings?.length || 0})</h3>
        <div className="space-y-2 max-h-96 overflow-y-auto no-scrollbar">
          {!bookings?.length && <p className="text-white/40 text-sm text-center py-8">No arrivals today</p>}
          {(bookings || []).map(b => (
            <button
              key={b.id}
              onClick={() => { setFoundBooking(b); setBookingId(b.booking_reference); }}
              className={`w-full p-3 rounded-xl text-left transition-all hover:bg-white/10 ${foundBooking?.id === b.id ? 'bg-brand-500/10 border border-brand-500/20' : 'bg-white/5 border border-transparent'}`}
            >
              <div className="flex justify-between items-start">
                <div>
                  <p className="font-medium text-sm">{b.full_name}</p>
                  <p className="text-white/40 text-xs">{b.phone} · Room {b.room_number}</p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className="font-mono text-xs text-brand-300">{b.booking_reference}</span>
                  {b.check_in_time && <span className="badge badge-verified text-xs">Checked In</span>}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
