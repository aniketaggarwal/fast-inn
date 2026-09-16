import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Building2, Users, FileCheck, ClipboardList,
  LogOut, ChevronLeft, ChevronRight, Hotel, Shield, BookOpen, Menu, X
} from 'lucide-react';
import { useAuth } from '../../store/authContext';

const NAV_ITEMS = {
  guest: [
    { icon: LayoutDashboard, label: 'Dashboard',  to: '/guest' },
    { icon: FileCheck,       label: 'My KYC',     to: '/guest/kyc' },
    { icon: BookOpen,        label: 'My Bookings', to: '/guest/bookings' },
  ],
  hotel_staff: [
    { icon: LayoutDashboard, label: 'Dashboard',    to: '/hotel' },
    { icon: Users,           label: 'Guest Queue',  to: '/hotel/guests' },
    { icon: ClipboardList,   label: 'Check-ins',    to: '/hotel/checkin' },
    { icon: FileCheck,       label: 'Documents',    to: '/hotel/documents' },
    { icon: Shield,          label: 'Compliance',   to: '/hotel/compliance' },
  ],
  admin: [
    { icon: LayoutDashboard, label: 'Overview',    to: '/admin' },
    { icon: Building2,       label: 'Hotels',      to: '/admin/hotels' },
    { icon: Users,           label: 'KYC Queue',   to: '/admin/kyc' },
    { icon: BookOpen,        label: 'Bookings',    to: '/admin/bookings' },
    { icon: Shield,          label: 'Compliance',  to: '/admin/compliance' },
  ],
};

export default function Navigation({ children }) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const navItems = NAV_ITEMS[user?.role] || [];

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const roleLabel = { guest: 'Guest', hotel_staff: 'Hotel Staff', admin: 'Administrator' };
  const roleColors = { guest: 'text-brand-400', hotel_staff: 'text-emerald-400', admin: 'text-gold-400' };

  const Sidebar = ({ mobile = false }) => (
    <aside className={`
      flex flex-col bg-navy-900 border-r border-white/10 h-screen
      ${mobile ? 'w-72' : collapsed ? 'w-16' : 'w-64'}
      transition-all duration-300
    `}>
      {/* Logo */}
      <div className={`flex items-center gap-3 p-4 border-b border-white/10 ${collapsed && !mobile ? 'justify-center' : ''}`}>
        <div className="w-9 h-9 rounded-xl bg-gradient-brand flex items-center justify-center flex-shrink-0 shadow-glow">
          <Hotel size={18} className="text-white" />
        </div>
        {(!collapsed || mobile) && (
          <div>
            <span className="font-bold text-white">HotelVerify</span>
            <p className={`text-xs font-medium ${roleColors[user?.role]}`}>{roleLabel[user?.role]}</p>
          </div>
        )}
        {!mobile && (
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="ml-auto p-1 rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-colors"
          >
            {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>
        )}
      </div>

      {/* Nav items */}
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto no-scrollbar">
        {navItems.map(({ icon: Icon, label, to }) => {
          const active = location.pathname === to || location.pathname.startsWith(to + '/');
          return (
            <Link
              key={to}
              to={to}
              onClick={() => setMobileOpen(false)}
              className={`nav-item ${active ? 'active' : ''} ${collapsed && !mobile ? 'justify-center px-2' : ''}`}
              title={collapsed && !mobile ? label : undefined}
            >
              <Icon size={18} className="flex-shrink-0" />
              {(!collapsed || mobile) && <span className="text-sm">{label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* User + logout */}
      <div className="p-3 border-t border-white/10 space-y-2">
        {(!collapsed || mobile) && (
          <div className="px-3 py-2">
            <p className="text-sm font-medium text-white truncate">{user?.full_name}</p>
            <p className="text-xs text-white/40 truncate">{user?.email}</p>
          </div>
        )}
        <button
          onClick={handleLogout}
          className={`nav-item w-full text-red-400 hover:text-red-300 hover:bg-red-500/10 ${collapsed && !mobile ? 'justify-center px-2' : ''}`}
          title={collapsed && !mobile ? 'Logout' : undefined}
        >
          <LogOut size={18} className="flex-shrink-0" />
          {(!collapsed || mobile) && <span className="text-sm">Logout</span>}
        </button>
      </div>
    </aside>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-navy-950">
      {/* Desktop sidebar */}
      <div className="hidden lg:block">
        <Sidebar />
      </div>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/60 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <div className="fixed left-0 top-0 h-full animate-slide-in-right">
            <Sidebar mobile />
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Mobile header */}
        <header className="lg:hidden flex items-center gap-3 px-4 py-3 bg-navy-900 border-b border-white/10">
          <button
            onClick={() => setMobileOpen(true)}
            className="p-2 rounded-lg hover:bg-white/10 transition-colors"
          >
            <Menu size={20} />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-brand flex items-center justify-center shadow-glow">
              <Hotel size={14} />
            </div>
            <span className="font-bold text-white text-sm">HotelVerify</span>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-6 lg:p-8 animate-fade-in">
          {children}
        </main>
      </div>
    </div>
  );
}
