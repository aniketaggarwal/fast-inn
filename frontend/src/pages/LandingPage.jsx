import React from 'react';
import { Link } from 'react-router-dom';
import {
  Shield, CheckCircle, QrCode, FileText, BarChart3, ArrowRight,
  Star, Hotel, Zap, Globe
} from 'lucide-react';

const FEATURES = [
  { icon: Shield,      title: 'DigiYatra-Grade KYC',    desc: 'OCR-powered Aadhaar, PAN & passport verification in seconds. Auto-extract name, DOB, and address.' },
  { icon: QrCode,      title: 'QR Code Check-in',       desc: 'Guests scan a unique QR at reception. Staff verify instantly — no paper forms, no queues.' },
  { icon: FileText,    title: 'Auto Compliance',         desc: 'Generate FRRO Form C and police reports automatically. Download PDF with one click.' },
  { icon: CheckCircle, title: 'Real-time Verification',  desc: 'Live KYC queue for hotel staff. Approve or flag guests before they arrive.' },
  { icon: BarChart3,   title: 'Analytics Dashboard',    desc: 'Track check-in rates, KYC compliance percentages, and guest trends per day.' },
  { icon: Zap,         title: 'API-first Design',        desc: 'Integrate with your existing PMS via REST API. S3-ready document storage included.' },
];

const PLANS = [
  { name: 'Starter',    price: '₹999', period: '/month', rooms: 'Up to 20 rooms', features: ['Digital KYC', 'QR Check-in', 'Email Alerts'], highlight: false },
  { name: 'Growth',     price: '₹2,499', period: '/month', rooms: 'Up to 100 rooms', features: ['Everything in Starter', 'Compliance Reports', 'Staff Accounts × 5', 'API Access'], highlight: true },
  { name: 'Enterprise', price: 'Custom', period: '', rooms: 'Unlimited rooms', features: ['Everything in Growth', 'Dedicated Support', 'White-label Option', 'SLA Guarantee'], highlight: false },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-gradient-navy text-white">
      {/* ── Navbar ────────────────────────────────── */}
      <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-4 border-b border-white/5 glass">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl bg-gradient-brand flex items-center justify-center shadow-glow">
            <Hotel size={18} />
          </div>
          <span className="font-bold text-xl">HotelVerify</span>
        </div>
        <div className="hidden md:flex items-center gap-8 text-sm text-white/70">
          <a href="#features" className="hover:text-white transition-colors">Features</a>
          <a href="#pricing"  className="hover:text-white transition-colors">Pricing</a>
          <a href="#about"    className="hover:text-white transition-colors">About</a>
        </div>
        <div className="flex items-center gap-3">
          <Link to="/login"    className="btn-secondary text-sm px-4 py-2">Sign In</Link>
          <Link to="/register" className="btn-primary  text-sm px-4 py-2">Get Started</Link>
        </div>
      </nav>

      {/* ── Hero ──────────────────────────────────── */}
      <section className="pt-32 pb-24 px-6 text-center max-w-5xl mx-auto">
        <div className="inline-flex items-center gap-2 bg-brand-500/10 border border-brand-500/20 rounded-full px-4 py-1.5 text-sm text-brand-300 mb-8 animate-fade-in">
          <Zap size={14} />
          India's First DigiYatra-Style Hotel Verification Platform
        </div>
        <h1 className="text-5xl md:text-7xl font-black leading-tight mb-6 animate-slide-up">
          Digital Check-in
          <span className="block text-gradient">Without the Paperwork</span>
        </h1>
        <p className="text-xl text-white/60 max-w-2xl mx-auto mb-10 animate-slide-up">
          Replace paper Form C with instant KYC verification, QR code check-in,
          and automated FRRO compliance reports — all in one platform.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center animate-slide-up">
          <Link to="/register" className="btn-primary flex items-center gap-2 justify-center text-base px-8 py-4">
            Start Free Trial <ArrowRight size={18} />
          </Link>
          <Link to="/login" className="btn-secondary flex items-center gap-2 justify-center text-base px-8 py-4">
            View Demo
          </Link>
        </div>

        {/* Trust signals */}
        <div className="flex flex-wrap gap-8 justify-center mt-16 text-sm text-white/40 animate-fade-in">
          {['500+ Hotels', '2L+ Guests Verified', 'FRRO Compliant', 'ISO 27001 Ready'].map(s => (
            <div key={s} className="flex items-center gap-1.5">
              <CheckCircle size={14} className="text-emerald-500" /> {s}
            </div>
          ))}
        </div>
      </section>

      {/* ── Features ──────────────────────────────── */}
      <section id="features" className="py-24 px-6 max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-bold mb-4">Everything a hotel needs</h2>
          <p className="text-white/60 text-lg">From KYC to compliance — automated, secure, and blazing fast.</p>
        </div>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {FEATURES.map(({ icon: Icon, title, desc }) => (
            <div key={title} className="card-glass hover:border-brand-500/30 group">
              <div className="w-12 h-12 rounded-xl bg-brand-500/20 flex items-center justify-center mb-4 group-hover:bg-brand-500/30 transition-colors">
                <Icon size={22} className="text-brand-400" />
              </div>
              <h3 className="font-semibold text-lg mb-2">{title}</h3>
              <p className="text-white/60 text-sm leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── How it works ──────────────────────────── */}
      <section className="py-24 px-6 bg-navy-800/50">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-4xl font-bold mb-16">How it works</h2>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              { step: '01', title: 'Guest uploads ID', desc: 'Aadhaar, PAN, or passport. OCR extracts all details automatically.' },
              { step: '02', title: 'Hotel verifies',   desc: 'Staff review extracted data side-by-side with the original document.' },
              { step: '03', title: 'QR check-in',      desc: 'Guest shows QR code at reception. Staff scan and check-in in 10 seconds.' },
            ].map(({ step, title, desc }) => (
              <div key={step} className="relative">
                <div className="text-7xl font-black text-gradient-gold opacity-20 absolute -top-4 left-0">{step}</div>
                <div className="relative z-10 pt-6">
                  <h3 className="font-semibold text-xl mb-3">{title}</h3>
                  <p className="text-white/60">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Pricing ───────────────────────────────── */}
      <section id="pricing" className="py-24 px-6 max-w-5xl mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-bold mb-4">Simple, transparent pricing</h2>
          <p className="text-white/60">No per-check-in hidden fees. Just one predictable monthly subscription.</p>
        </div>
        <div className="grid md:grid-cols-3 gap-6">
          {PLANS.map(({ name, price, period, rooms, features, highlight }) => (
            <div key={name} className={`card relative ${highlight ? 'border-brand-500/50 shadow-glow animate-pulse-glow' : ''}`}>
              {highlight && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="bg-gradient-brand text-white text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1">
                    <Star size={10} /> MOST POPULAR
                  </span>
                </div>
              )}
              <div className="mb-4">
                <p className="text-white/60 text-sm font-medium mb-1">{name}</p>
                <div className="flex items-end gap-1">
                  <span className="text-4xl font-black text-gradient">{price}</span>
                  <span className="text-white/40 mb-1">{period}</span>
                </div>
                <p className="text-white/40 text-sm mt-1">{rooms}</p>
              </div>
              <ul className="space-y-2 mb-6">
                {features.map(f => (
                  <li key={f} className="flex items-center gap-2 text-sm text-white/70">
                    <CheckCircle size={14} className="text-emerald-500 flex-shrink-0" /> {f}
                  </li>
                ))}
              </ul>
              <Link
                to="/register"
                className={`block text-center font-semibold py-3 rounded-xl transition-all ${
                  highlight ? 'btn-primary' : 'btn-secondary'
                }`}
              >
                {price === 'Custom' ? 'Contact Sales' : 'Get Started'}
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* ── Footer ────────────────────────────────── */}
      <footer className="border-t border-white/10 py-12 px-6 text-center text-white/40 text-sm">
        <div className="flex items-center justify-center gap-2 mb-4">
          <div className="w-7 h-7 rounded-lg bg-gradient-brand flex items-center justify-center shadow-glow">
            <Hotel size={14} />
          </div>
          <span className="font-bold text-white">HotelVerify</span>
        </div>
        <p>© {new Date().getFullYear()} HotelVerify. Built for Indian hospitality. FRRO & MHA compliant.</p>
        <div className="flex justify-center gap-6 mt-4">
          <a href="#" className="hover:text-white transition-colors">Privacy Policy</a>
          <a href="#" className="hover:text-white transition-colors">Terms of Service</a>
          <a href="#" className="hover:text-white transition-colors">Contact</a>
        </div>
      </footer>
    </div>
  );
}
