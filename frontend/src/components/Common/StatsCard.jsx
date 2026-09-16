import React from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

/**
 * StatsCard — metric display card with optional trend indicator
 */
export default function StatsCard({ icon, label, value, trend, trendLabel, color = 'brand', loading }) {
  const colorMap = {
    brand:    { bg: 'bg-brand-500/20',   text: 'text-brand-400',   icon: 'bg-brand-500/30' },
    emerald:  { bg: 'bg-emerald-500/20', text: 'text-emerald-400', icon: 'bg-emerald-500/30' },
    amber:    { bg: 'bg-amber-500/20',   text: 'text-amber-400',   icon: 'bg-amber-500/30' },
    red:      { bg: 'bg-red-500/20',     text: 'text-red-400',     icon: 'bg-red-500/30' },
    gold:     { bg: 'bg-gold-500/20',    text: 'text-gold-400',    icon: 'bg-gold-500/30' },
  };
  const c = colorMap[color] || colorMap.brand;

  return (
    <div className="stat-card animate-slide-up">
      <div className="flex items-start justify-between">
        <div className={`p-3 rounded-xl ${c.icon}`}>
          <span className={`text-2xl ${c.text}`}>{icon}</span>
        </div>
        {trend !== undefined && (
          <div className={`flex items-center gap-1 text-xs font-medium ${
            trend > 0 ? 'text-emerald-400' : trend < 0 ? 'text-red-400' : 'text-white/40'
          }`}>
            {trend > 0 ? <TrendingUp size={12} /> : trend < 0 ? <TrendingDown size={12} /> : <Minus size={12} />}
            <span>{Math.abs(trend)}%</span>
          </div>
        )}
      </div>
      <div className="mt-4">
        {loading ? (
          <div className="h-8 w-16 bg-white/10 rounded animate-pulse" />
        ) : (
          <p className="text-3xl font-bold text-white">{value ?? '—'}</p>
        )}
        <p className="text-white/60 text-sm mt-1">{label}</p>
        {trendLabel && <p className="text-white/40 text-xs mt-0.5">{trendLabel}</p>}
      </div>
    </div>
  );
}
