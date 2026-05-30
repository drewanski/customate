import React, { useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { AIHealthPill } from '../components/admin/AIHealthPill';
import {
  LayoutDashboard,
  Package,
  Boxes,
  LogOut,
  Users,
  BarChart3,
  ListTodo,
  Tag,
  Calendar as CalendarIcon,
  Star,
  ChevronLeft,
  ChevronRight,
  Menu,
  Undo2,
  MessageSquare,
} from 'lucide-react';

import { Modal } from '../components/Modal';
import { useAuth } from '../hooks/useAuth';
import { AdminAIAssistant } from '../components/AdminAIAssistant';

export function AdminLayout() {
  const location = useLocation();
  const navigate = useNavigate();

  const [logoutOpen, setLogoutOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const { user, logout } = useAuth();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  // Role-aware nav. admin (= Production Manager / owner) sees everything.
  // production_staff sees just their floor-work surface: Production queue,
  // Calendar, and read-only Inventory. Items missing for the current role
  // are silently dropped below.
  const role = (user?.role || 'customer') as
    | 'admin' | 'production_staff' | 'customer';

  // Per updated spec: staff sees ONLY their task board. Everything else is
  // admin-exclusive. Admin sees the full backstage navigation.
  const allNavLinks = [
    { to: '/admin/my-tasks',  label: 'My Tasks',   icon: ListTodo,        roles: ['production_staff'] },
    { to: '/admin/messages',  label: 'Messages',   icon: MessageSquare,   roles: ['admin', 'production_staff'] },
    { to: '/admin',           label: 'Overview',   icon: LayoutDashboard, roles: ['admin'] },
    { to: '/admin/orders',    label: 'Orders',     icon: Package,         roles: ['admin'] },
    { to: '/admin/production',label: 'Production', icon: ListTodo,        roles: ['admin'] },
    { to: '/admin/calendar',  label: 'Calendar',   icon: CalendarIcon,    roles: ['admin'] },
    { to: '/admin/users',     label: 'Accounts',   icon: Users,           roles: ['admin'] },
    { to: '/admin/inventory', label: 'Inventory',  icon: Boxes,           roles: ['admin'] },
    { to: '/admin/reports',   label: 'Reports',    icon: BarChart3,       roles: ['admin'] },
    { to: '/admin/coupons',   label: 'Coupons',    icon: Tag,             roles: ['admin'] },
    { to: '/admin/reviews',   label: 'Reviews',    icon: Star,            roles: ['admin'] },
    { to: '/admin/returns',   label: 'Returns',    icon: Undo2,           roles: ['admin'] },
  ];
  const navLinks = allNavLinks.filter((link) => link.roles.includes(role));

  // Match active route — exact match for /admin, prefix match for sub-routes
  const isActiveRoute = (to: string) =>
    to === '/admin' ? location.pathname === '/admin' : location.pathname.startsWith(to);

  // User initials for the avatar tile
  const initials = (user?.name || 'A')
    .split(' ')
    .map((p: string) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Mobile top bar */}
      <div className="md:hidden fixed top-0 left-0 right-0 h-14 bg-white border-b border-slate-200 z-40 flex items-center justify-between px-4">
        <button
          onClick={() => setMobileOpen(true)}
          className="p-2 rounded-lg hover:bg-slate-100 text-slate-700"
          aria-label="Open menu"
        >
          <Menu className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-2">
          {/* Mobile top-bar logo. White rounded card around the logo so the
              transparent PNG always reads cleanly against any future header
              gradient — same treatment as the desktop sidebar logo. */}
          <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center shadow-md p-0.5">
            <img src="/logo.png" alt="CustoMate" className="w-full h-full object-contain" />
          </div>
          <span className="font-bold text-sm text-slate-900">CustoMate Admin</span>
        </div>
        <div className="w-9" /> {/* spacer for symmetry */}
      </div>

      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="md:hidden fixed inset-0 bg-slate-900/50 z-40 backdrop-blur-sm"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* SIDEBAR */}
      <aside
        className={`fixed top-0 left-0 h-screen z-50 flex flex-col transition-all duration-300 bg-slate-950 text-slate-100 ${
          // Desktop width control
          collapsed ? 'md:w-20' : 'md:w-64'
        } ${
          // Mobile slide in/out
          mobileOpen ? 'translate-x-0 w-72' : '-translate-x-full md:translate-x-0 w-72'
        }`}
      >
        {/* Decorative gradient glow at top */}
        <div className="absolute -top-32 -left-32 w-80 h-80 rounded-full bg-blue-600/20 blur-3xl pointer-events-none" />
        <div className="absolute top-1/3 -right-24 w-64 h-64 rounded-full bg-purple-600/15 blur-3xl pointer-events-none" />

        {/* TOP / LOGO AREA */}
        <div className="relative p-4 border-b border-white/10 flex items-center justify-between min-h-[72px]">
          <Link to="/admin" className="flex items-center gap-3 cursor-pointer group">
            {/* Sidebar logo. Wrapped in a white tile so the blue+gray logo
                stays readable against the dark sidebar background. */}
            <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center shadow-lg shadow-blue-500/30 group-hover:scale-105 transition-transform p-1">
              <img src="/logo.png" alt="CustoMate" className="w-full h-full object-contain" />
            </div>
            {!collapsed && (
              <div className="leading-tight">
                <div className="font-bold text-white text-sm">CustoMate</div>
                <div className="text-[10px] text-slate-400 uppercase tracking-widest font-semibold">
                  {role === 'production_staff' ? 'Production Floor' : 'Production Manager'}
                </div>
              </div>
            )}
          </Link>

          {/* Collapse toggle — desktop only */}
          <button
            onClick={() => setCollapsed((v) => !v)}
            className="hidden md:flex items-center justify-center w-8 h-8 rounded-lg bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white transition-all"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>

          {/* Mobile close */}
          <button
            onClick={() => setMobileOpen(false)}
            className="md:hidden text-slate-400 hover:text-white"
            aria-label="Close menu"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
        </div>

        {/* Section label (collapsed: hidden) */}
        {!collapsed && (
          <div className="relative px-4 pt-5 pb-2">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
              Workspace
            </span>
          </div>
        )}

        {/* NAVIGATION */}
        <nav className="relative flex-1 px-3 space-y-1 overflow-y-auto">
          {navLinks.map((link) => {
            const Icon = link.icon;
            const isActive = isActiveRoute(link.to);
            return (
              <Link
                key={link.to}
                to={link.to}
                onClick={() => setMobileOpen(false)}
                title={collapsed ? link.label : undefined}
                className={`group relative flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 ${
                  isActive
                    ? 'bg-gradient-to-r from-blue-600/20 to-indigo-600/20 text-white shadow-inner'
                    : 'text-slate-400 hover:bg-white/5 hover:text-white'
                }`}
              >
                {/* Active indicator bar on the left edge */}
                <span
                  className={`absolute left-0 top-1/2 -translate-y-1/2 w-1 rounded-r transition-all ${
                    isActive ? 'h-8 bg-gradient-to-b from-blue-400 to-indigo-500' : 'h-0 bg-transparent'
                  }`}
                />
                <div
                  className={`flex items-center justify-center w-9 h-9 rounded-lg transition-colors shrink-0 ${
                    isActive ? 'bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-md shadow-blue-500/30' : 'bg-white/5 text-slate-300 group-hover:bg-white/10'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                </div>
                {!collapsed && (
                  <span className={`text-sm font-bold ${isActive ? 'text-white' : ''}`}>{link.label}</span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* User mini-card + logout */}
        <div className="relative p-3 border-t border-white/10 space-y-2">
          {/* User card — only when expanded */}
          {!collapsed && user && (
            <div className="flex items-center gap-2.5 p-2.5 rounded-xl bg-white/5">
              <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center font-black text-xs text-white shrink-0 shadow-md">
                {initials}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-bold text-white truncate">{user.name || 'Production Manager'}</div>
                <div className="text-[10px] text-slate-400 truncate">{user.email || 'manager@customate.app'}</div>
                <div className="mt-1 inline-flex items-center px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wider bg-gradient-to-r from-blue-500 to-indigo-600 text-white">
                  {role === 'production_staff' ? 'Production Staff' : 'Production Manager'}
                </div>
              </div>
            </div>
          )}

          <button
            onClick={() => setLogoutOpen(true)}
            title={collapsed ? 'Logout' : undefined}
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-slate-400 hover:bg-rose-500/10 hover:text-rose-300 w-full transition-all duration-200 group"
          >
            <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-white/5 text-slate-300 group-hover:bg-rose-500/15 group-hover:text-rose-300 shrink-0 transition-colors">
              <LogOut className="w-4 h-4" />
            </div>
            {!collapsed && <span className="text-sm font-bold">Logout</span>}
          </button>
        </div>
      </aside>

      {/* MAIN CONTENT */}
      <main
        className={`min-h-screen transition-all duration-300 pt-14 md:pt-0 ${
          collapsed ? 'md:ml-20' : 'md:ml-64'
        }`}
      >
        {/* Floating AI Health pill — sits in the top-right so admins can see
            which provider is responding and how much we're saving via cache.
            Mounted above the hero gradients via z-index. Admin only —
            production staff have no AI quota visibility per the spec. */}
        {role === 'admin' && (
          <div className="fixed top-3 right-3 md:top-5 md:right-6 z-30">
            <AIHealthPill />
          </div>
        )}
        <Outlet />
      </main>

      {/* AI ASSISTANT — admin-only per spec. Staff never sees the floating
          AI widget at all (matches backend 403 on /api/admin-ai/*). */}
      {role === 'admin' && <AdminAIAssistant />}

      {/* LOGOUT MODAL */}
      <Modal
        isOpen={logoutOpen}
        onClose={() => setLogoutOpen(false)}
        title="Confirm Logout"
        footer={
          <>
            <button
              onClick={() => setLogoutOpen(false)}
              className="px-4 py-2 rounded-lg text-sm font-bold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                setLogoutOpen(false);
                handleLogout();
              }}
              className="px-4 py-2 rounded-lg text-sm font-bold text-white bg-gradient-to-br from-rose-500 to-red-600 hover:from-rose-600 hover:to-red-700 shadow-lg shadow-red-200"
            >
              Logout
            </button>
          </>
        }
      >
        <p className="text-slate-800 font-semibold">Are you sure you want to logout?</p>
        <p className="text-sm text-slate-500 mt-1">
          You'll need to sign in again to access the admin panel.
        </p>
      </Modal>
    </div>
  );
}
