/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Primary — deep navy
        navy: {
          950: '#040A12',
          900: '#0A1628',
          800: '#0D1E38',
          700: '#152847',
          600: '#1C3560',
        },
        // Accent — electric blue
        brand: {
          50:  '#EFF6FF',
          100: '#DBEAFE',
          200: '#BFDBFE',
          300: '#93C5FD',
          400: '#60A5FA',
          500: '#3B82F6',
          600: '#2563EB',
          700: '#1D4ED8',
          800: '#1E40AF',
          900: '#1E3A8A',
        },
        // Verification status colors
        verified:   '#10B981', // emerald
        pending:    '#F59E0B', // amber
        rejected:   '#EF4444', // red
        // Gold accent
        gold: {
          400: '#FBBF24',
          500: '#F59E0B',
          600: '#D97706',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['Inter', 'system-ui', 'sans-serif'],
      },
      backgroundImage: {
        'gradient-navy':  'linear-gradient(135deg, #040A12 0%, #0A1628 50%, #1E3A8A 100%)',
        'gradient-brand': 'linear-gradient(135deg, #1E40AF 0%, #3B82F6 100%)',
        'gradient-card':  'linear-gradient(135deg, rgba(30,64,175,0.1) 0%, rgba(59,130,246,0.05) 100%)',
      },
      boxShadow: {
        'glow':       '0 0 20px rgba(59, 130, 246, 0.3)',
        'glow-lg':    '0 0 40px rgba(59, 130, 246, 0.4)',
        'card':       '0 4px 24px rgba(0, 0, 0, 0.3)',
        'card-hover': '0 8px 40px rgba(0, 0, 0, 0.4)',
      },
      animation: {
        'fade-in':    'fadeIn 0.5s ease-out',
        'slide-up':   'slideUp 0.4s ease-out',
        'slide-in-right': 'slideInRight 0.4s ease-out',
        'pulse-glow': 'pulseGlow 2s ease-in-out infinite',
      },
      keyframes: {
        fadeIn:       { from: { opacity: 0 }, to: { opacity: 1 } },
        slideUp:      { from: { opacity: 0, transform: 'translateY(16px)' }, to: { opacity: 1, transform: 'translateY(0)' } },
        slideInRight: { from: { opacity: 0, transform: 'translateX(16px)' }, to: { opacity: 1, transform: 'translateX(0)' } },
        pulseGlow:    { '0%, 100%': { boxShadow: '0 0 20px rgba(59,130,246,0.3)' }, '50%': { boxShadow: '0 0 40px rgba(59,130,246,0.6)' } },
      },
    },
  },
  plugins: [],
};
