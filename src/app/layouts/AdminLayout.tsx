import React, { useState, useEffect } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Package, Boxes, ClipboardList, LogOut, Users, BarChart3, Shield } from 'lucide-react';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';
import { AdminAIAssistant } from '../components/AdminAIAssistant';
import { NotificationBell } from '../components/NotificationBell';

export function AdminLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    const userStr = localStorage.getItem('user');
    if (userStr) {
      setUser(JSON.parse(userStr));
    }
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login');
  };
  
  const navLinks = [
    { to: '/admin', label: 'Overview', icon: LayoutDashboard },
    { to: '/admin/orders', label: 'Orders', icon: Package },
    { to: '/admin/users', label: 'Accounts', icon: Users },
    { to: '/admin/inventory', label: 'Inventory', icon: Boxes },
    { to: '/admin/production', label: 'Production', icon: ClipboardList },
    { to: '/admin/reports', label: 'Reports', icon: BarChart3 },
  ];
  
  return (
    <div className="min-h-screen flex">
      <aside className="w-64 bg-gray-900 text-white flex flex-col">
        <div className="p-6 border-b border-gray-800">
          <div className="flex items-center justify-between">
            <Link to="/admin" className="flex items-center gap-2">
              <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
                <span className="font-bold text-xl">CM</span>
              </div>
              <div>
                <div className="font-bold">CustoMate</div>
                <div className="text-xs text-gray-400">Admin Panel</div>
              </div>
            </Link>
            <div className="text-gray-300 hover:text-white">
              <NotificationBell />
            </div>
          </div>
        </div>
        
        <nav className="flex-1 p-4 space-y-1">
          {navLinks.map((link) => {
            const Icon = link.icon;
            const isActive = location.pathname === link.to;
            return (
              <Link
                key={link.to}
                to={link.to}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                  isActive
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span className="font-medium">{link.label}</span>
              </Link>
            );
          })}
        </nav>
        
        <div className="p-4 border-t border-gray-800 space-y-3">
          {user && (
            <div className="px-4 py-3 bg-gray-800/50 rounded-lg">
              <div className="flex items-center gap-2 mb-1">
                <Shield className="w-4 h-4 text-blue-400" />
                <span className="text-xs text-gray-400 uppercase tracking-wider font-semibold">Role</span>
              </div>
              <span className="text-sm font-medium text-white capitalize">{user.role || 'Admin'}</span>
            </div>
          )}
          <button
            onClick={() => setLogoutOpen(true)}
            className="flex items-center gap-3 px-4 py-3 rounded-lg text-gray-300 hover:bg-gray-800 hover:text-white transition-colors w-full text-left"
          >
            <LogOut className="w-5 h-5" />
            <span className="font-medium">Logout</span>
          </button>
        </div>
      </aside>
      
      <main className="flex-1 bg-gray-50">
        <Outlet />
      </main>

      {/* AI Assistant - visible on all admin pages */}
      <AdminAIAssistant />

      <Modal
        isOpen={logoutOpen}
        onClose={() => setLogoutOpen(false)}
        title="Confirm Logout"
        footer={
          <>
            <Button
              variant="outline"
              onClick={() => setLogoutOpen(false)}
              className="border-gray-300 text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                setLogoutOpen(false);
                handleLogout();
              }}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              Logout
            </Button>
          </>
        }
      >
        <div className="space-y-2">
          <p className="text-gray-900 font-medium">Are you sure you want to logout?</p>
          <p className="text-sm text-gray-600">You will need to login again to access the admin panel.</p>
        </div>
      </Modal>
    </div>
  );
}
