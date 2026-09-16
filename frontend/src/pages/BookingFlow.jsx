import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate } from 'react-router-dom';
import { Building2, MapPin, ChevronRight, Calendar, Search, ArrowLeft, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import Navigation from '../components/Common/Navigation';
import api from '../services/api';

const searchSchema = z.object({
  city:          z.string().min(2, 'Enter a city'),
  check_in_date:  z.string().min(1, 'Select check-in'),
  check_out_date: z.string().min(1, 'Select check-out'),
});

const bookSchema = z.object({
  room_number: z.string().min(1, 'Room number required'),
  room_type:   z.string().optional(),
  num_guests:  z.coerce.number().min(1).max(10).default(1),
  price:       z.coerce.number().positive().optional(),
  special_requests: z.string().optional(),
});

export default function BookingFlow() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [step, setStep] = useState(1); // 1=search, 2=select hotel, 3=confirm
  const [searchParams, setSearchParams] = useState(null);
  const [selectedHotel, setSelectedHotel] = useState(null);

  const searchForm = useForm({ resolver: zodResolver(searchSchema) });
  const bookForm   = useForm({ resolver: zodResolver(bookSchema), defaultValues: { num_guests: 1 } });

  const { data: hotels, isLoading: hotelsLoading } = useQuery({
    queryKey: ['search-hotels', searchParams],
    queryFn:  () => api.get('/hotels', { params: { city: searchParams?.city, status: 'verified' } }).then(r => r.data.data),
    enabled:  !!searchParams,
  });

  const bookMutation = useMutation({
    mutationFn: (data) => api.post('/bookings', { ...data, hotel_id: selectedHotel.id, ...searchParams }),
    onSuccess: (res) => {
      toast.success(`Booking confirmed! Reference: ${res.data.data.booking.booking_reference}`);
      queryClient.invalidateQueries({ queryKey: ['my-bookings'] });
      navigate('/guest/bookings');
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Booking failed'),
  });

  const onSearch = (data) => {
    setSearchParams(data);
    setStep(2);
  };

  return (
    <Navigation>
      <div className="max-w-3xl mx-auto animate-fade-in">
        <div className="page-header">
          <div className="flex items-center gap-3">
            {step > 1 && (
              <button onClick={() => setStep(step - 1)} className="p-2 rounded-lg hover:bg-white/10 transition-colors">
                <ArrowLeft size={18} />
              </button>
            )}
            <div>
              <h1 className="page-title">Book a Hotel</h1>
              <div className="flex items-center gap-2 mt-2">
                {['Search', 'Select Hotel', 'Confirm'].map((s, i) => (
                  <React.Fragment key={s}>
                    <span className={`text-xs font-medium ${step === i + 1 ? 'text-brand-400' : 'text-white/30'}`}>{s}</span>
                    {i < 2 && <ChevronRight size={12} className="text-white/20" />}
                  </React.Fragment>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Step 1: Search */}
        {step === 1 && (
          <div className="card animate-slide-up">
            <h2 className="font-semibold mb-6 flex items-center gap-2">
              <Search size={18} className="text-brand-400" /> Find a hotel
            </h2>
            <form onSubmit={searchForm.handleSubmit(onSearch)} className="space-y-4">
              <div>
                <label className="input-label">Destination city</label>
                <input className="input" placeholder="e.g. Mumbai, Delhi, Bangalore" {...searchForm.register('city')} />
                {searchForm.formState.errors.city && <p className="input-error">{searchForm.formState.errors.city.message}</p>}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="input-label">Check-in date</label>
                  <input type="date" className="input" min={new Date().toISOString().split('T')[0]} {...searchForm.register('check_in_date')} />
                  {searchForm.formState.errors.check_in_date && <p className="input-error">{searchForm.formState.errors.check_in_date.message}</p>}
                </div>
                <div>
                  <label className="input-label">Check-out date</label>
                  <input type="date" className="input" min={new Date().toISOString().split('T')[0]} {...searchForm.register('check_out_date')} />
                  {searchForm.formState.errors.check_out_date && <p className="input-error">{searchForm.formState.errors.check_out_date.message}</p>}
                </div>
              </div>
              <button type="submit" className="btn-primary w-full flex items-center justify-center gap-2">
                <Search size={18} /> Search Hotels
              </button>
            </form>
          </div>
        )}

        {/* Step 2: Select hotel */}
        {step === 2 && (
          <div className="animate-slide-up space-y-4">
            {hotelsLoading && (
              <div className="card flex items-center justify-center py-12 gap-3">
                <Loader2 size={20} className="animate-spin text-brand-400" />
                <span className="text-white/60">Searching hotels in {searchParams?.city}...</span>
              </div>
            )}
            {!hotelsLoading && hotels?.length === 0 && (
              <div className="card text-center py-12">
                <Building2 size={40} className="mx-auto text-white/20 mb-3" />
                <p className="text-white/60">No verified hotels found in {searchParams?.city}</p>
              </div>
            )}
            {(hotels || []).map(hotel => (
              <button
                key={hotel.id}
                onClick={() => { setSelectedHotel(hotel); setStep(3); }}
                className="card w-full text-left hover:border-brand-500/50 hover:shadow-glow transition-all group"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold text-lg group-hover:text-brand-400 transition-colors">{hotel.name}</h3>
                    <p className="flex items-center gap-1 text-white/50 text-sm mt-1">
                      <MapPin size={12} /> {hotel.address}, {hotel.city}
                    </p>
                    <div className="flex items-center gap-3 mt-3 text-sm text-white/60">
                      <span>🏨 {hotel.room_count || '?'} rooms</span>
                      <span className="badge badge-verified">Verified</span>
                    </div>
                  </div>
                  <ChevronRight size={20} className="text-white/30 group-hover:text-brand-400 transition-colors mt-1" />
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Step 3: Confirm booking */}
        {step === 3 && selectedHotel && (
          <div className="animate-slide-up space-y-4">
            <div className="card border-brand-500/30">
              <h3 className="font-semibold text-brand-300 mb-1">{selectedHotel.name}</h3>
              <p className="text-white/50 text-sm">{selectedHotel.address}, {selectedHotel.city}</p>
              <div className="flex items-center gap-4 mt-3 text-sm text-white/60">
                <span className="flex items-center gap-1"><Calendar size={12} /> {searchParams?.check_in_date}</span>
                <ChevronRight size={12} />
                <span>{searchParams?.check_out_date}</span>
              </div>
            </div>

            <div className="card">
              <h2 className="font-semibold mb-4">Room Details</h2>
              <form onSubmit={bookForm.handleSubmit((data) => bookMutation.mutate(data))} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="input-label">Room Number</label>
                    <input className="input" placeholder="e.g. 201" {...bookForm.register('room_number')} />
                    {bookForm.formState.errors.room_number && <p className="input-error">{bookForm.formState.errors.room_number.message}</p>}
                  </div>
                  <div>
                    <label className="input-label">Room Type</label>
                    <input className="input" placeholder="Deluxe, Standard..." {...bookForm.register('room_type')} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="input-label">Number of Guests</label>
                    <input type="number" min="1" max="10" className="input" {...bookForm.register('num_guests')} />
                  </div>
                  <div>
                    <label className="input-label">Price (₹)</label>
                    <input type="number" className="input" placeholder="Per night" {...bookForm.register('price')} />
                  </div>
                </div>
                <div>
                  <label className="input-label">Special Requests (optional)</label>
                  <textarea className="input" rows={2} placeholder="Early check-in, extra bed..." {...bookForm.register('special_requests')} />
                </div>
                <button type="submit" disabled={bookMutation.isPending} className="btn-primary w-full flex items-center justify-center gap-2">
                  {bookMutation.isPending ? <><Loader2 size={18} className="animate-spin" /> Confirming...</> : '✅ Confirm Booking'}
                </button>
              </form>
            </div>
          </div>
        )}
      </div>
    </Navigation>
  );
}
