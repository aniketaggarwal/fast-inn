import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Eye, EyeOff, Hotel, Loader2, UserPlus, User, Building2, ShieldCheck } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../store/authContext';

const schema = z.object({
  full_name: z.string().min(2, 'Full name required'),
  email:     z.string().email('Invalid email'),
  phone:     z.string().regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit Indian mobile number'),
  password:  z.string().min(8, 'Minimum 8 characters'),
  role:      z.enum(['guest', 'hotel_staff']),
});

const ROLES = [
  { value: 'guest',       icon: User,      label: 'Guest',       desc: 'Travelling and need hotel KYC' },
  { value: 'hotel_staff', icon: Building2, label: 'Hotel Staff', desc: 'Manage check-ins for a hotel' },
];

export default function RegisterPage() {
  const { register: authRegister } = useAuth();
  const navigate = useNavigate();
  const [showPw, setShowPw] = useState(false);

  const { register, handleSubmit, setValue, watch, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { role: 'guest' },
  });

  const selectedRole = watch('role');

  const onSubmit = async (data) => {
    try {
      const user = await authRegister(data);
      toast.success('Account created! Welcome to HotelVerify 🎉');
      navigate('/dashboard');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Registration failed');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-navy flex items-center justify-center p-6">
      <div className="w-full max-w-lg animate-slide-up">
        {/* Logo */}
        <div className="flex items-center gap-2 mb-8">
          <Link to="/" className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-gradient-brand flex items-center justify-center shadow-glow">
              <Hotel size={18} />
            </div>
            <span className="font-bold text-xl">HotelVerify</span>
          </Link>
        </div>

        <div className="card">
          <h1 className="text-2xl font-bold mb-1">Create your account</h1>
          <p className="text-white/60 text-sm mb-6">Join 500+ hotels using HotelVerify</p>

          {/* Role selector */}
          <div className="mb-6">
            <label className="input-label">I am a...</label>
            <div className="grid grid-cols-2 gap-3">
              {ROLES.map(({ value, icon: Icon, label, desc }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setValue('role', value)}
                  className={`p-4 rounded-xl border text-left transition-all ${
                    selectedRole === value
                      ? 'border-brand-500 bg-brand-500/10 shadow-glow'
                      : 'border-white/10 bg-white/5 hover:border-white/20'
                  }`}
                >
                  <Icon size={20} className={selectedRole === value ? 'text-brand-400' : 'text-white/40'} />
                  <p className="font-medium mt-2 text-sm">{label}</p>
                  <p className="text-white/40 text-xs mt-0.5">{desc}</p>
                </button>
              ))}
            </div>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" id="register-form">
            <div>
              <label className="input-label" htmlFor="full_name">Full name</label>
              <input id="full_name" className="input" placeholder="Ramesh Kumar" {...register('full_name')} />
              {errors.full_name && <p className="input-error">{errors.full_name.message}</p>}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="input-label" htmlFor="email">Email</label>
                <input id="email" type="email" className="input" placeholder="you@example.com" {...register('email')} />
                {errors.email && <p className="input-error">{errors.email.message}</p>}
              </div>
              <div>
                <label className="input-label" htmlFor="phone">Mobile number</label>
                <input id="phone" type="tel" className="input" placeholder="9876543210" {...register('phone')} />
                {errors.phone && <p className="input-error">{errors.phone.message}</p>}
              </div>
            </div>

            <div>
              <label className="input-label" htmlFor="reg-password">Password</label>
              <div className="relative">
                <input
                  id="reg-password"
                  type={showPw ? 'text' : 'password'}
                  className="input pr-12"
                  placeholder="Min. 8 characters"
                  {...register('password')}
                />
                <button type="button" onClick={() => setShowPw(!showPw)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white">
                  {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              {errors.password && <p className="input-error">{errors.password.message}</p>}
            </div>

            <button id="register-submit" type="submit" disabled={isSubmitting} className="btn-primary w-full flex items-center justify-center gap-2 mt-2">
              {isSubmitting
                ? <><Loader2 size={18} className="animate-spin" /> Creating account...</>
                : <><UserPlus size={18} /> Create Account</>
              }
            </button>
          </form>

          <div className="mt-4 flex items-center gap-2 text-xs text-white/40">
            <ShieldCheck size={12} className="text-emerald-400" />
            Your data is encrypted and never shared without consent.
          </div>
        </div>

        <p className="text-center text-white/60 text-sm mt-6">
          Already have an account?{' '}
          <Link to="/login" className="text-brand-400 hover:text-brand-300 font-medium transition-colors">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
