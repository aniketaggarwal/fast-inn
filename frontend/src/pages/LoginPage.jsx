import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Eye, EyeOff, Hotel, Loader2, LogIn } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../store/authContext';

const schema = z.object({
  email:    z.string().email('Invalid email'),
  password: z.string().min(1, 'Password required'),
});

export default function LoginPage() {
  const { login } = useAuth();
  const navigate  = useNavigate();
  const location  = useLocation();
  const [showPw, setShowPw] = useState(false);

  const from = location.state?.from?.pathname || '/dashboard';

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data) => {
    try {
      const user = await login(data.email, data.password);
      toast.success(`Welcome back, ${user.full_name.split(' ')[0]}!`);
      navigate(from, { replace: true });
    } catch (err) {
      toast.error(err.response?.data?.error || 'Login failed');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-navy flex">
      {/* Left panel */}
      <div className="hidden lg:flex flex-col justify-between w-1/2 p-12 border-r border-white/5">
        <Link to="/" className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-brand flex items-center justify-center shadow-glow">
            <Hotel size={20} />
          </div>
          <span className="font-bold text-xl">HotelVerify</span>
        </Link>
        <div>
          <h2 className="text-4xl font-black mb-4 leading-tight">
            Your guests deserve<br />
            <span className="text-gradient">a seamless experience</span>
          </h2>
          <p className="text-white/60 text-lg">
            Digital KYC. QR check-in. Automated compliance.<br />
            All in one platform built for Indian hotels.
          </p>
          <div className="mt-8 grid grid-cols-2 gap-4">
            {[
              { value: '10s',   label: 'Average check-in time' },
              { value: '99.9%', label: 'Platform uptime' },
              { value: '500+',  label: 'Hotels onboarded' },
              { value: '0',     label: 'Paper forms required' },
            ].map(({ value, label }) => (
              <div key={label} className="card-glass">
                <p className="text-2xl font-bold text-gradient">{value}</p>
                <p className="text-white/50 text-xs mt-1">{label}</p>
              </div>
            ))}
          </div>
        </div>
        <p className="text-white/30 text-sm">© {new Date().getFullYear()} HotelVerify — FRRO Compliant</p>
      </div>

      {/* Right panel — Login form */}
      <div className="flex-1 flex items-center justify-center p-6 lg:p-12">
        <div className="w-full max-w-md animate-slide-up">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-2 mb-8">
            <div className="w-9 h-9 rounded-xl bg-gradient-brand flex items-center justify-center shadow-glow">
              <Hotel size={18} />
            </div>
            <span className="font-bold text-xl">HotelVerify</span>
          </div>

          <h1 className="text-3xl font-bold mb-2">Welcome back</h1>
          <p className="text-white/60 mb-8">Sign in to your HotelVerify account</p>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" id="login-form">
            <div>
              <label className="input-label" htmlFor="email">Email address</label>
              <input
                id="email"
                type="email"
                className="input"
                placeholder="you@hotel.com"
                autoComplete="email"
                {...register('email')}
              />
              {errors.email && <p className="input-error">{errors.email.message}</p>}
            </div>

            <div>
              <label className="input-label" htmlFor="password">Password</label>
              <div className="relative">
                <input
                  id="password"
                  type={showPw ? 'text' : 'password'}
                  className="input pr-12"
                  placeholder="••••••••"
                  autoComplete="current-password"
                  {...register('password')}
                />
                <button
                  type="button"
                  onClick={() => setShowPw(!showPw)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white transition-colors"
                >
                  {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              {errors.password && <p className="input-error">{errors.password.message}</p>}
            </div>

            <button
              id="login-submit"
              type="submit"
              disabled={isSubmitting}
              className="btn-primary w-full flex items-center justify-center gap-2"
            >
              {isSubmitting
                ? <><Loader2 size={18} className="animate-spin" /> Signing in...</>
                : <><LogIn size={18} /> Sign In</>
              }
            </button>
          </form>

          <div className="divider" />

          <p className="text-center text-white/60 text-sm">
            Don't have an account?{' '}
            <Link to="/register" className="text-brand-400 hover:text-brand-300 font-medium transition-colors">
              Create one free
            </Link>
          </p>

          {/* Dev hint */}
          <div className="mt-6 p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl text-xs text-amber-400">
            <strong>Dev quick-login:</strong> Register an account first, then use those credentials here.
          </div>
        </div>
      </div>
    </div>
  );
}
