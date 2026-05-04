import React, { useEffect, useMemo, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '../components/Card';
import { Table, TableColumn } from '../components/Table';
import { Input } from '../components/Input';
import { Select } from '../components/Select';
import { Button } from '../components/Button';
import { apiRequest } from '../api';
import { Search, Plus, Download, Trash2, Edit, Eye, Users, Shield, Clock, Calendar } from 'lucide-react';

type AdminUserRow = {
  _id?: string;
  id?: string;
  name: string;
  email: string;
  contactNumber: string;
  role: 'customer' | 'admin';
  status: 'active' | 'inactive' | 'suspended';
  avatar?: string;
  lastLogin?: string;
  createdAt: string;
};

type UserStats = {
  total: number;
  customers: number;
  admins: number;
  active: number;
  inactive: number;
  suspended: number;
  recentLogins: number;
};

export function AdminUsers() {
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [stats, setStats] = useState<UserStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | 'customer' | 'admin'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive' | 'suspended'>('all');
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [editingUser, setEditingUser] = useState<AdminUserRow | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [viewingUser, setViewingUser] = useState<AdminUserRow | null>(null);
  const [showViewModal, setShowViewModal] = useState(false);

  const load = async () => {
    try {
      setLoading(true);
      setError('');
      const [usersData, statsData] = await Promise.all([
        apiRequest('/users'),
        apiRequest('/users/stats')
      ]);
      setUsers(Array.isArray(usersData) ? usersData : []);
      setStats(statsData);
    } catch (err: any) {
      setError(err?.message || 'Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users
      .filter((u) => roleFilter === 'all' || u.role === roleFilter)
      .filter((u) => statusFilter === 'all' || u.status === statusFilter)
      .filter((u) => {
        if (!q) return true;
        return (
          (u.name || '').toLowerCase().includes(q) ||
          (u.email || '').toLowerCase().includes(q) ||
          String(u._id || u.id || '').toLowerCase().includes(q)
        );
      });
  }, [users, search, roleFilter, statusFilter]);

  const updateUser = async (userId: string, updates: Partial<AdminUserRow>) => {
    try {
      setSavingId(userId);
      setError('');
      const updated = await apiRequest(`/users/${userId}`, {
        method: 'PUT',
        body: JSON.stringify(updates)
      });
      setUsers((prev) => prev.map((u) => String(u._id || u.id) === String(userId) ? { ...u, ...updated } : u));
      setSuccess('User updated successfully');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      setError(err?.message || 'Failed to update user');
    } finally {
      setSavingId(null);
    }
  };

  const deleteUser = async (userId: string) => {
    if (!confirm('Are you sure you want to delete this user? This action cannot be undone.')) {
      return;
    }
    try {
      setSavingId(userId);
      setError('');
      await apiRequest(`/users/${userId}`, { method: 'DELETE' });
      setUsers((prev) => prev.filter((u) => String(u._id || u.id) !== String(userId)));
      setSuccess('User deleted successfully');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      setError(err?.message || 'Failed to delete user');
    } finally {
      setSavingId(null);
    }
  };

  const bulkUpdate = async (updates: { role?: string; status?: string }) => {
    if (selectedUsers.length === 0) {
      setError('Please select users to update');
      return;
    }
    try {
      setSavingId('bulk');
      setError('');
      const result = await apiRequest('/users/bulk/update', {
        method: 'PUT',
        body: JSON.stringify({ userIds: selectedUsers, updates })
      });
      await load();
      setSelectedUsers([]);
      setSuccess(result.message || 'Bulk update completed');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      setError(err?.message || 'Failed to update users');
    } finally {
      setSavingId(null);
    }
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'Never';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-100 text-green-800';
      case 'inactive': return 'bg-gray-100 text-gray-800';
      case 'suspended': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'admin': return 'bg-purple-100 text-purple-800';
      case 'customer': return 'bg-blue-100 text-blue-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const columns: TableColumn<AdminUserRow>[] = [
    {
      key: 'select',
      header: '',
      render: (u) => (
        <input
          type="checkbox"
          checked={selectedUsers.includes(String(u._id || u.id))}
          onChange={(e) => {
            const uid = String(u._id || u.id);
            if (e.target.checked) {
              setSelectedUsers(prev => [...prev, uid]);
            } else {
              setSelectedUsers(prev => prev.filter(id => id !== uid));
            }
          }}
        />
      )
    },
    {
      key: 'user',
      header: 'User',
      render: (u) => (
        <div className="flex items-center gap-3">
          {u.avatar ? (
            <img src={u.avatar} alt={u.name} className="w-8 h-8 rounded-full object-cover" />
          ) : (
            <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center">
              <span className="text-xs font-medium text-gray-600">{u.name.charAt(0).toUpperCase()}</span>
            </div>
          )}
          <div>
            <div className="font-medium text-gray-900">{u.name}</div>
            <div className="text-sm text-gray-500">{u.email}</div>
            <div className="text-sm text-gray-500">{u.contactNumber}</div>
          </div>
        </div>
      )
    },
    {
      key: 'role',
      header: 'Role',
      render: (u) => (
        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getRoleColor(u.role)}`}>
          {u.role}
        </span>
      )
    },
    {
      key: 'status',
      header: 'Status',
      render: (u) => (
        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(u.status)}`}>
          {u.status}
        </span>
      )
    },
    {
      key: 'lastLogin',
      header: 'Last Login',
      render: (u) => (
        <div className="text-sm text-gray-500">
          {formatDate(u.lastLogin)}
        </div>
      )
    },
    {
      key: 'createdAt',
      header: 'Joined',
      render: (u) => (
        <div className="text-sm text-gray-500">
          {formatDate(u.createdAt)}
        </div>
      )
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (u) => {
        const uid = String(u._id || u.id || '');
        const disabled = !uid || savingId === uid || savingId === 'bulk';
        return (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setViewingUser(u);
                setShowViewModal(true);
              }}
              disabled={disabled}
            >
              <Eye className="w-4 h-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setEditingUser(u);
                setShowEditModal(true);
              }}
              disabled={disabled}
            >
              <Edit className="w-4 h-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => deleteUser(uid)}
              disabled={disabled}
              className="text-red-600 hover:text-red-700"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        );
      }
    }
  ];

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Account Management</h1>
        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={load} disabled={loading || !!savingId}>
            <Download className="w-4 h-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Statistics Cards */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center">
                <div className="flex-shrink-0 bg-blue-100 rounded-lg p-3">
                  <Users className="w-6 h-6 text-blue-600" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Total Users</p>
                  <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center">
                <div className="flex-shrink-0 bg-green-100 rounded-lg p-3">
                  <Shield className="w-6 h-6 text-green-600" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Active Users</p>
                  <p className="text-2xl font-bold text-gray-900">{stats.active}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center">
                <div className="flex-shrink-0 bg-purple-100 rounded-lg p-3">
                  <Users className="w-6 h-6 text-purple-600" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Admins</p>
                  <p className="text-2xl font-bold text-gray-900">{stats.admins}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center">
                <div className="flex-shrink-0 bg-orange-100 rounded-lg p-3">
                  <Clock className="w-6 h-6 text-orange-600" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Recent Logins</p>
                  <p className="text-2xl font-bold text-gray-900">{stats.recentLogins}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters */}
      <Card className="mb-6">
        <CardContent>
          <div className="grid md:grid-cols-4 gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <Input
                placeholder="Search users..."
                value={search}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select
              options={[
                { value: 'all', label: 'All Roles' },
                { value: 'customer', label: 'Customer' },
                { value: 'admin', label: 'Admin' }
              ]}
              value={roleFilter}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setRoleFilter(e.target.value as any)}
            />
            <Select
              options={[
                { value: 'all', label: 'All Status' },
                { value: 'active', label: 'Active' },
                { value: 'inactive', label: 'Inactive' },
                { value: 'suspended', label: 'Suspended' }
              ]}
              value={statusFilter}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setStatusFilter(e.target.value as any)}
            />
            <div className="text-sm text-gray-500 self-center">
              {filtered.length} users found
            </div>
          </div>
          
          {/* Bulk Actions */}
          {selectedUsers.length > 0 && (
            <div className="mt-4 p-3 bg-gray-50 rounded-lg flex items-center justify-between">
              <span className="text-sm text-gray-600">
                {selectedUsers.length} user{selectedUsers.length !== 1 ? 's' : ''} selected
              </span>
              <div className="flex items-center gap-2">
                <Select
                  options={[
                    { value: '', label: 'Bulk Actions...' },
                    { value: 'customer', label: 'Set as Customer' },
                    { value: 'admin', label: 'Set as Admin' },
                    { value: 'active', label: 'Set as Active' },
                    { value: 'inactive', label: 'Set as Inactive' },
                    { value: 'suspended', label: 'Set as Suspended' }
                  ]}
                  value=""
                  onChange={(e) => {
                    if (e.target.value) {
                      const updates: any = {};
                      if (['customer', 'admin'].includes(e.target.value)) {
                        updates.role = e.target.value;
                      } else {
                        updates.status = e.target.value;
                      }
                      bulkUpdate(updates);
                      e.target.value = '';
                    }
                  }}
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedUsers([])}
                >
                  Clear Selection
                </Button>
              </div>
            </div>
          )}
          
          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
          {success && <p className="mt-3 text-sm text-green-600">{success}</p>}
          {loading && <p className="mt-3 text-sm text-gray-600">Loading...</p>}
        </CardContent>
      </Card>

      {/* Users Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Users ({filtered.length})</CardTitle>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={selectedUsers.length === filtered.length && filtered.length > 0}
                onChange={(e) => {
                  if (e.target.checked) {
                    setSelectedUsers(filtered.map(u => String(u._id || u.id)));
                  } else {
                    setSelectedUsers([]);
                  }
                }}
              />
              <span className="text-sm text-gray-600">Select All</span>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table columns={columns} data={filtered} />
        </CardContent>
      </Card>

      {/* View User Modal */}
      {showViewModal && viewingUser && (
        <div className="fixed inset-0 bg-white/80 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto border-2 border-gray-300 shadow-xl">
            <div className="p-6">
              <h2 className="text-xl font-bold mb-4">User Details</h2>
              <div className="space-y-4">
                <div className="flex items-center gap-4">
                  {viewingUser.avatar ? (
                    <img src={viewingUser.avatar} alt={viewingUser.name} className="w-16 h-16 rounded-full object-cover" />
                  ) : (
                    <div className="w-16 h-16 bg-gray-200 rounded-full flex items-center justify-center">
                      <span className="text-xl font-medium text-gray-600">{viewingUser.name.charAt(0).toUpperCase()}</span>
                    </div>
                  )}
                  <div>
                    <h3 className="text-lg font-semibold">{viewingUser.name}</h3>
                    <p className="text-gray-600">{viewingUser.email}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Role</label>
                    <p className="mt-1">{viewingUser.role}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Status</label>
                    <p className="mt-1">{viewingUser.status}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Last Login</label>
                    <p className="mt-1">{formatDate(viewingUser.lastLogin)}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Member Since</label>
                    <p className="mt-1">{formatDate(viewingUser.createdAt)}</p>
                  </div>
                </div>
              </div>
              <div className="mt-6 flex justify-end gap-3">
                <Button variant="outline" onClick={() => setShowViewModal(false)}>
                  Close
                </Button>
                <Button onClick={() => {
                  setShowViewModal(false);
                  setEditingUser(viewingUser);
                  setShowEditModal(true);
                }}>
                  Edit User
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit User Modal */}
      {showEditModal && editingUser && (
        <div className="fixed inset-0 bg-white/80 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-md w-full border-2 border-gray-300 shadow-xl">
            <div className="p-6">
              <h2 className="text-xl font-bold mb-4">Edit User</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                  <Input
                    value={editingUser.name}
                    onChange={(e) => setEditingUser({ ...editingUser, name: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                  <Input
                    value={editingUser.email}
                    disabled
                    className="bg-gray-50"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Contact Number</label>
                  <Input
                    value={editingUser.contactNumber}
                    onChange={(e) => setEditingUser({ ...editingUser, contactNumber: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
                  <Select
                    options={[
                      { value: 'customer', label: 'Customer' },
                      { value: 'admin', label: 'Admin' }
                    ]}
                    value={editingUser.role}
                    onChange={(e) => setEditingUser({ ...editingUser, role: e.target.value as any })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                  <Select
                    options={[
                      { value: 'active', label: 'Active' },
                      { value: 'inactive', label: 'Inactive' },
                      { value: 'suspended', label: 'Suspended' }
                    ]}
                    value={editingUser.status}
                    onChange={(e) => setEditingUser({ ...editingUser, status: e.target.value as any })}
                  />
                </div>
              </div>
              <div className="mt-6 flex justify-end gap-3">
                <Button variant="outline" onClick={() => setShowEditModal(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={() => {
                    const uid = String(editingUser._id || editingUser.id);
                    updateUser(uid, {
                      name: editingUser.name,
                      role: editingUser.role,
                      status: editingUser.status,
                      contactNumber: editingUser.contactNumber
                    });
                    setShowEditModal(false);
                  }}
                  disabled={savingId === String(editingUser._id || editingUser.id)}
                >
                  {savingId === String(editingUser._id || editingUser.id) ? 'Saving...' : 'Save Changes'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
