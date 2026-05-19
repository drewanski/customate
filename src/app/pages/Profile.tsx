import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { apiRequest, getProfile, updateProfile } from '../api';
import type { User } from '../data/types';
import { Modal } from '../components/Modal';
import { User as UserIcon, Mail, Phone, Shield, Edit3, LogOut, Save, X, Camera, LayoutDashboard, ShoppingCart, Truck, ArrowLeft, MapPin, Plus, Trash2, Home, Briefcase, Star } from 'lucide-react';
import { formatPeso, shortOrderCode } from '../utils/format';
import { useAuth } from '../hooks/useAuth';

interface SavedAddress {
  _id: string;
  label: string;
  fullName: string;
  contactNumber: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  province: string;
  postalCode: string;
  isDefault: boolean;
}

export default function Profile() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [user, setUser] = useState<(User & { savedAddresses?: SavedAddress[] }) | null>(null);
  const [orders, setOrders] = useState<any[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [ordersError, setOrdersError] = useState('');
  const [editMode, setEditMode] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    contactNumber: ''
  });
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [logoutOpen, setLogoutOpen] = useState(false);

  // Address Modal State
  const [addressModalOpen, setAddressModalOpen] = useState(false);
  const [editingAddress, setEditingAddress] = useState<SavedAddress | null>(null);
  const [addressFormData, setAddressFormData] = useState({
    label: 'Home',
    fullName: '',
    contactNumber: '',
    addressLine1: '',
    addressLine2: '',
    city: '',
    province: '',
    postalCode: '',
    isDefault: false
  });
  const [addressLoading, setAddressLoading] = useState(false);

  const fetchProfile = async () => {
    try {
      const data = await getProfile();
      setUser(data);
      setFormData({ name: data.name, email: data.email, contactNumber: data.contactNumber || '' });
      setAvatarPreview(data.avatar || null);
    } catch (err: any) {
      setError(err.message || 'Failed to load profile');
      // If 401/403, clear auth and redirect to login
      if (err.message?.includes('401') || err.message?.includes('403') || err.message?.includes('not valid')) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        navigate('/login');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfile();
  }, []);

  const handleAddressAction = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddressLoading(true);
    try {
      if (editingAddress) {
        await apiRequest(`/users/me/addresses/${editingAddress._id}`, {
          method: 'PUT',
          body: JSON.stringify(addressFormData)
        });
        setSuccess('Address updated successfully');
      } else {
        await apiRequest('/users/me/addresses', {
          method: 'POST',
          body: JSON.stringify(addressFormData)
        });
        setSuccess('Address added successfully');
      }
      setAddressModalOpen(false);
      fetchProfile();
    } catch (err: any) {
      setError(err.message || 'Failed to save address');
    } finally {
      setAddressLoading(false);
    }
  };

  const handleDeleteAddress = async (addressId: string) => {
    if (!confirm('Are you sure you want to delete this address?')) return;
    try {
      await apiRequest(`/users/me/addresses/${addressId}`, { method: 'DELETE' });
      setSuccess('Address deleted successfully');
      fetchProfile();
    } catch (err: any) {
      setError(err.message || 'Failed to delete address');
    }
  };

  const openAddressModal = (address?: SavedAddress) => {
    if (address) {
      setEditingAddress(address);
      setAddressFormData({
        label: address.label,
        fullName: address.fullName,
        contactNumber: address.contactNumber,
        addressLine1: address.addressLine1,
        addressLine2: address.addressLine2 || '',
        city: address.city,
        province: address.province,
        postalCode: address.postalCode,
        isDefault: address.isDefault
      });
    } else {
      setEditingAddress(null);
      setAddressFormData({
        label: 'Home',
        fullName: user?.name || '',
        contactNumber: user?.contactNumber || '',
        addressLine1: '',
        addressLine2: '',
        city: '',
        province: '',
        postalCode: '',
        isDefault: (user?.savedAddresses?.length === 0)
      });
    }
    setAddressModalOpen(true);
  };

  useEffect(() => {
    const fetchOrders = async () => {
      try {
        setOrdersLoading(true);
        setOrdersError('');
        const data = await apiRequest('/orders/my');
        setOrders(Array.isArray(data) ? data : []);
      } catch (err: any) {
        setOrdersError(err.message || 'Failed to load orders');
      } finally {
        setOrdersLoading(false);
      }
    };
    fetchOrders();
  }, []);

  const statusPillClass = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-50 text-green-700 border-green-200';
      case 'approved':
        return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'in_production':
        return 'bg-purple-50 text-purple-700 border-purple-200';
      case 'ready':
        return 'bg-indigo-50 text-indigo-700 border-indigo-200';
      case 'rejected':
        return 'bg-red-50 text-red-700 border-red-200';
      default:
        return 'bg-yellow-50 text-yellow-800 border-yellow-200';
    }
  };

  const handleSave = async () => {
    setError('');
    setSuccess('');
    const nextName = formData.name.trim();
    const nextContactNumber = formData.contactNumber.trim();
    
    if (!nextName) {
      setError('Name is required');
      return;
    }
    if (nextName.length < 2) {
      setError('Name must be at least 2 characters');
      return;
    }
    if (nextName.length > 60) {
      setError('Name is too long');
      return;
    }
    if (!/^[a-zA-Z0-9 .,'-]+$/.test(nextName)) {
      setError('Name contains invalid characters');
      return;
    }
    if (!nextContactNumber) {
      setError('Contact number is required');
      return;
    }
    if (!/^(\+639|09)\d{9}$/.test(nextContactNumber)) {
      setError('Please enter a valid Philippine phone number (e.g., +639XXXXXXXXX or 09XXXXXXXXX)');
      return;
    }
    try {
      setLoading(true);
      const payload: any = {};
      if (nextName !== (user?.name || '').trim()) payload.name = nextName;
      if (nextContactNumber !== (user?.contactNumber || '').trim()) payload.contactNumber = nextContactNumber;
      if (avatarPreview !== (user?.avatar || null)) payload.avatar = avatarPreview || '';

      if (Object.keys(payload).length === 0) {
        setError('No changes to save');
        return;
      }
      const updated = await updateProfile(payload);
      setUser(updated);
      setAvatarPreview(updated.avatar || null);
      setSuccess('Profile updated successfully');
      setEditMode(false);
    } catch (err: any) {
      setError(err.message || 'Failed to update profile');
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    if (user) {
      setFormData({ name: user.name, email: user.email, contactNumber: user.contactNumber || '' });
      setAvatarPreview(user.avatar || null);
    }
    setEditMode(false);
    setError('');
    setSuccess('');
  };

  const handlePickAvatar = () => {
    if (!editMode || loading) return;
    fileInputRef.current?.click();
  };

  const handleAvatarFile = (file: File | null) => {
    setError('');
    setSuccess('');
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file');
      return;
    }
    if (file.size > 700 * 1024) {
      setError('Please use an image smaller than 700KB');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      if (!result.startsWith('data:image/')) {
        setError('Invalid image');
        return;
      }
      setAvatarPreview(result);
    };
    reader.onerror = () => setError('Failed to read image');
    reader.readAsDataURL(file);
  };

  const { logout } = useAuth();
  
  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  // Show loading spinner while loading
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Loading profile...</p>
        </div>
      </div>
    );
  }

  // Show error if profile failed to load and no user data
  if (!user && error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <UserIcon className="w-8 h-8 text-red-600" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Failed to Load Profile</h2>
          <p className="text-red-600 text-sm mb-4">{error}</p>
          <div className="space-y-2">
            <Button onClick={() => { setError(''); setLoading(true); fetchProfile(); }} className="w-full">
              Try Again
            </Button>
            <Button variant="outline" onClick={() => navigate('/login')} className="w-full">
              Go to Login
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Guard: if we get here without user, something went wrong
  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <UserIcon className="w-8 h-8 text-gray-400" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Something went wrong</h2>
          <p className="text-gray-600 text-sm mb-4">Unable to load your profile. Please try again.</p>
          <Button onClick={() => navigate('/login')} className="w-full">
            Go to Login
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen relative overflow-hidden bg-gradient-to-br from-blue-50 via-white to-purple-50 px-4 py-8">
      <div className="pointer-events-none absolute -top-24 -left-24 w-96 h-96 bg-blue-300/30 rounded-full blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -right-24 w-96 h-96 bg-purple-300/30 rounded-full blur-3xl" />

      <div className="max-w-4xl mx-auto relative">
        <div className="mb-8 flex items-center justify-between gap-4">
          <button
            onClick={() => navigate(-1)}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-bold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 shadow-sm transition-all hover:-translate-y-0.5"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>
          <div className="text-right">
            <h1 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight">My profile</h1>
            <p className="text-sm text-slate-500 mt-0.5">Manage your account information</p>
          </div>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-600 text-sm">{error}</p>
          </div>
        )}
        {success && (
          <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
            <p className="text-green-600 text-sm">{success}</p>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="shadow-xl border-0 md:col-span-1">
            <CardContent className="p-6">
              <div className="flex flex-col items-center text-center">
                <div className="relative">
                  <div className="w-28 h-28 rounded-full shadow-xl overflow-hidden ring-4 ring-white bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-3xl font-bold">
                    {avatarPreview ? (
                      <img src={avatarPreview} alt="Profile" className="w-full h-full object-cover" />
                    ) : (
                      user.name.charAt(0).toUpperCase()
                    )}
                  </div>
                  {editMode && (
                    <button
                      type="button"
                      onClick={handlePickAvatar}
                      className="absolute -bottom-2 -right-2 w-10 h-10 rounded-full bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center shadow-lg transition-colors"
                      disabled={loading}
                    >
                      <Camera className="w-5 h-5" />
                    </button>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => handleAvatarFile(e.target.files?.[0] || null)}
                  />
                </div>

                <h2 className="mt-4 text-2xl font-bold text-gray-900">{user.name}</h2>
                <div className="mt-2 inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 text-blue-700 text-sm font-medium">
                  <Shield className="w-4 h-4" />
                  <span className="capitalize">{user.role}</span>
                </div>

                <div className="mt-5 w-full p-3 bg-gray-50 rounded-lg border border-gray-200 text-left">
                  <div className="flex items-center gap-2 text-gray-700">
                    <Mail className="w-4 h-4" />
                    <span className="text-sm font-medium">Email</span>
                  </div>
                  <p className="mt-1 text-gray-900 break-all">{user.email}</p>
                </div>

                <div className="mt-6 w-full space-y-3">
                  <Button
                    variant="outline"
                    onClick={() => navigate('/dashboard')}
                    className="w-full border-gray-300 text-gray-700 hover:bg-gray-50 flex items-center justify-center gap-2"
                  >
                    <LayoutDashboard className="w-4 h-4" />
                    Dashboard
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => navigate('/cart')}
                    className="w-full border-gray-300 text-gray-700 hover:bg-gray-50 flex items-center justify-center gap-2"
                  >
                    <ShoppingCart className="w-4 h-4" />
                    Cart
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => navigate('/order-tracking')}
                    className="w-full border-gray-300 text-gray-700 hover:bg-gray-50 flex items-center justify-center gap-2"
                  >
                    <Truck className="w-4 h-4" />
                    Order Tracking
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-xl border-0 md:col-span-2">
            <CardContent className="p-8">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-xl font-bold text-gray-900">Account Details</h3>
                  <p className="text-sm text-gray-600 mt-1">Update your name and profile photo.</p>
                </div>
                {!editMode && (
                  <Button
                    onClick={() => setEditMode(true)}
                    className="bg-blue-600 hover:bg-blue-700 text-white font-medium shadow-lg transition-all duration-200 flex items-center justify-center gap-2"
                  >
                    <Edit3 className="w-4 h-4" />
                    Edit
                  </Button>
                )}
              </div>

              <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="md:col-span-2">
                  <label className="block text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                    <UserIcon className="w-4 h-4" />
                    Full Name
                  </label>
                  {editMode ? (
                    <Input
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      disabled={loading}
                      className="text-lg"
                      placeholder="Enter your name"
                    />
                  ) : (
                    <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
                      <p className="text-lg text-gray-900">{user.name}</p>
                    </div>
                  )}
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                    <Mail className="w-4 h-4" />
                    Email Address
                  </label>
                  <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
                    <p className="text-lg text-gray-900 break-all">{user.email}</p>
                    <p className="text-xs text-gray-500 mt-1">Email cannot be changed</p>
                  </div>
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                    <Phone className="w-4 h-4" />
                    Contact Number
                  </label>
                  {editMode ? (
                    <Input
                      value={formData.contactNumber}
                      onChange={(e) => setFormData({ ...formData, contactNumber: e.target.value })}
                      disabled={loading}
                      className="text-lg"
                      placeholder="+639XXXXXXXXX or 09XXXXXXXXX"
                    />
                  ) : (
                    <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
                      <p className="text-lg text-gray-900">{user.contactNumber}</p>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                    <Shield className="w-4 h-4" />
                    Account Type
                  </label>
                  <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
                    <p className="text-lg text-gray-900 capitalize">{user.role}</p>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Profile Photo
                  </label>
                  <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
                    <p className="text-sm text-gray-700">{editMode ? 'Use the camera button on your photo to change it.' : 'Click Edit to change your photo.'}</p>
                  </div>
                </div>
              </div>

              <div className="mt-8 flex flex-col sm:flex-row gap-3">
                {editMode ? (
                  <>
                    <Button
                      onClick={handleSave}
                      disabled={loading}
                      className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 shadow-lg transition-all duration-200 flex items-center justify-center gap-2"
                    >
                      {loading ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                          Saving...
                        </>
                      ) : (
                        <>
                          <Save className="w-4 h-4" />
                          Save Changes
                        </>
                      )}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={handleCancel}
                      disabled={loading}
                      className="flex-1 border-gray-300 text-gray-700 hover:bg-gray-50 font-medium py-3 transition-all duration-200 flex items-center justify-center gap-2"
                    >
                      <X className="w-4 h-4" />
                      Cancel
                    </Button>
                  </>
                ) : (
                  <Button
                    variant="outline"
                    onClick={() => setLogoutOpen(true)}
                    className="w-full border-red-300 text-red-600 hover:bg-red-50 font-medium py-3 transition-all duration-200 flex items-center justify-center gap-2"
                  >
                    <LogOut className="w-4 h-4" />
                    Logout
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-xl border-0 md:col-span-3">
            <CardContent className="p-8">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-xl font-bold text-gray-900">Saved Addresses</h3>
                  <p className="text-sm text-gray-600 mt-1">Manage your delivery locations for faster checkout.</p>
                </div>
                <Button 
                  onClick={() => openAddressModal()}
                  className="bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  Add New
                </Button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {user.savedAddresses && user.savedAddresses.length > 0 ? (
                  user.savedAddresses.map((addr) => (
                    <div 
                      key={addr._id} 
                      className={`p-4 rounded-xl border-2 transition-all ${addr.isDefault ? 'border-blue-500 bg-blue-50/30' : 'border-gray-100 bg-white hover:border-gray-200'}`}
                    >
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex items-center gap-2">
                          {addr.label === 'Home' ? <Home className="w-4 h-4 text-gray-500" /> : 
                           addr.label === 'Office' ? <Briefcase className="w-4 h-4 text-gray-500" /> : 
                           <MapPin className="w-4 h-4 text-gray-500" />}
                          <span className="font-bold text-gray-900">{addr.label}</span>
                          {addr.isDefault && (
                            <span className="px-2 py-0.5 rounded-full bg-blue-500 text-[10px] font-black text-white uppercase">Default</span>
                          )}
                        </div>
                        <div className="flex gap-1">
                          <button 
                            onClick={() => openAddressModal(addr)}
                            className="p-1.5 text-gray-400 hover:text-blue-600 transition-colors"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button 
                            onClick={() => handleDeleteAddress(addr._id)}
                            className="p-1.5 text-gray-400 hover:text-red-600 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm font-semibold text-gray-800">{addr.fullName}</p>
                        <p className="text-xs text-gray-600">{addr.contactNumber}</p>
                        <p className="text-xs text-gray-600 leading-relaxed mt-2">
                          {addr.addressLine1}{addr.addressLine2 ? `, ${addr.addressLine2}` : ''}<br />
                          {addr.city}, {addr.province} {addr.postalCode}
                        </p>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="md:col-span-2 py-12 text-center bg-gray-50 rounded-2xl border-2 border-dashed border-gray-200">
                    <MapPin className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-500 font-medium">No saved addresses yet</p>
                    <p className="text-sm text-gray-400">Add an address to speed up your checkout process.</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-xl border-0 md:col-span-3">
            <CardContent className="p-8">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-xl font-bold text-gray-900">My Order History</h3>
                  <p className="text-sm text-gray-600 mt-1">View your past orders and track their status.</p>
                </div>
                <Button
                  variant="outline"
                  onClick={() => navigate('/order-tracking')}
                  className="border-gray-300 text-gray-700 hover:bg-gray-50"
                >
                  Track Latest
                </Button>
              </div>

              {ordersError && (
                <div className="mt-6 p-4 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-red-600 text-sm">{ordersError}</p>
                </div>
              )}

              <div className="mt-6 space-y-3">
                {ordersLoading ? (
                  <div className="text-sm text-gray-600">Loading orders...</div>
                ) : orders.length === 0 ? (
                  <div className="text-sm text-gray-600">No orders yet.</div>
                ) : (
                  orders.map((order) => (
                    <div key={order.id} className="p-4 border border-gray-200 rounded-lg bg-white">
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                        <div>
                          <p className="font-semibold text-gray-900">Order #{shortOrderCode(order.id)}</p>
                          <p className="text-sm text-gray-600">
                            {order.createdAt ? new Date(order.createdAt).toLocaleString() : ''}
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className={`px-3 py-1 text-xs font-semibold rounded-full border ${statusPillClass(order.status)}`}>
                            {String(order.status || 'pending').replace('_', ' ')}
                          </span>
                          <span className="font-semibold text-blue-700">{formatPeso(Number(order.totalPrice || 0))}</span>
                          <Button
                            variant="outline"
                            onClick={() => navigate(`/order-tracking/${order.id}`)}
                            className="border-gray-300 text-gray-700 hover:bg-gray-50"
                          >
                            Track
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>

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
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                Logout
              </Button>
            </>
          }
        >
          <div className="space-y-2">
            <p className="text-gray-900 font-medium">Are you sure you want to logout?</p>
            <p className="text-sm text-gray-600">You will need to login again to access your account.</p>
          </div>
        </Modal>

        {/* Address Management Modal */}
        <Modal
          isOpen={addressModalOpen}
          onClose={() => setAddressModalOpen(false)}
          title={editingAddress ? 'Edit Address' : 'Add New Address'}
          footer={
            <>
              <Button variant="outline" onClick={() => setAddressModalOpen(false)} disabled={addressLoading}>
                Cancel
              </Button>
              <Button onClick={handleAddressAction} disabled={addressLoading}>
                {addressLoading ? 'Saving...' : editingAddress ? 'Update Address' : 'Save Address'}
              </Button>
            </>
          }
        >
          <form onSubmit={handleAddressAction} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Label</label>
                <select
                  value={addressFormData.label}
                  onChange={(e) => setAddressFormData({ ...addressFormData, label: e.target.value })}
                  className="w-full p-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500/20 outline-none"
                >
                  <option value="Home">Home</option>
                  <option value="Office">Office</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <div className="flex items-end">
                <label className="flex items-center gap-2 cursor-pointer mb-2">
                  <input
                    type="checkbox"
                    checked={addressFormData.isDefault}
                    onChange={(e) => setAddressFormData({ ...addressFormData, isDefault: e.target.checked })}
                    className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-700">Set as default</span>
                </label>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Full Name</label>
              <Input
                value={addressFormData.fullName}
                onChange={(e) => setAddressFormData({ ...addressFormData, fullName: e.target.value })}
                placeholder="Recipient's Name"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Contact Number</label>
              <Input
                value={addressFormData.contactNumber}
                onChange={(e) => setAddressFormData({ ...addressFormData, contactNumber: e.target.value })}
                placeholder="+639XXXXXXXXX"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Street Address / Building</label>
              <Input
                value={addressFormData.addressLine1}
                onChange={(e) => setAddressFormData({ ...addressFormData, addressLine1: e.target.value })}
                placeholder="House No., Street, Subdivision"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Unit / Floor (Optional)</label>
              <Input
                value={addressFormData.addressLine2}
                onChange={(e) => setAddressFormData({ ...addressFormData, addressLine2: e.target.value })}
                placeholder="Apt, Suite, Floor, etc."
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">City</label>
                <Input
                  value={addressFormData.city}
                  onChange={(e) => setAddressFormData({ ...addressFormData, city: e.target.value })}
                  placeholder="City"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Province</label>
                <Input
                  value={addressFormData.province}
                  onChange={(e) => setAddressFormData({ ...addressFormData, province: e.target.value })}
                  placeholder="Province"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Postal Code</label>
              <Input
                value={addressFormData.postalCode}
                onChange={(e) => setAddressFormData({ ...addressFormData, postalCode: e.target.value })}
                placeholder="XXXX"
                required
              />
            </div>
          </form>
        </Modal>
      </div>
    </div>
  );
}
