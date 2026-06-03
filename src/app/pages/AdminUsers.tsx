import React, { useEffect, useMemo, useState } from 'react';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import {
  Search,
  Users,
  UserCheck,
  Crown,
  Eye,
  Download,
  RefreshCw,
  Sparkles,
  CheckCircle2,
  Ban,
  ChevronRight,
} from 'lucide-react';
import { Pagination } from '../components/Pagination';
import {
  getUsersList as getUsers,
  getUserStats as getUserStatsSummary,
  bulkUpdateUsers,
  downloadUsersCsv,
} from '../api';
import { UserDetailDrawer } from '../components/users/UserDetailDrawer';
import { PrintablePage } from '../components/admin/PrintablePage';
import { generateSimpleReport } from '../utils/pdfExport';

const STATUS_TINT: Record<string, string> = {
  active: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  inactive: 'bg-slate-100 text-slate-600 border-slate-200',
  suspended: 'bg-rose-100 text-rose-700 border-rose-200',
};
const ROLE_TINT: Record<string, string> = {
  customer: 'bg-blue-100 text-blue-700 border-blue-200',
  admin: 'bg-purple-100 text-purple-700 border-purple-200',
  guest: 'bg-slate-100 text-slate-600 border-slate-200',
};

export function AdminUsers() {
  const [users, setUsers] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [verifiedFilter, setVerifiedFilter] = useState<'all' | 'verified' | 'unverified'>('all');

  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 12;

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkConfirm, setBulkConfirm] = useState<{ action: string; value: string } | null>(null);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [activeUserId, setActiveUserId] = useState<string | null>(null);

  const [exporting, setExporting] = useState(false);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [usersRes, statsRes] = await Promise.all([
        getUsers(),
        getUserStatsSummary().catch(() => null),
      ]);
      setUsers(Array.isArray(usersRes) ? usersRes : []);
      setStats(statsRes);
    } catch (err) {
      console.error('Failed to fetch users', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAll(); }, []);

  useEffect(() => {
    setCurrentPage(1);
    setSelectedIds(new Set());
  }, [searchTerm, roleFilter, statusFilter, verifiedFilter]);

  const filteredUsers = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return users.filter((u) => {
      if (roleFilter !== 'all' && u.role !== roleFilter) return false;
      if (statusFilter !== 'all' && u.status !== statusFilter) return false;
      if (verifiedFilter === 'verified' && !u.isEmailVerified) return false;
      if (verifiedFilter === 'unverified' && u.isEmailVerified) return false;
      if (!term) return true;
      return (
        (u.name || '').toLowerCase().includes(term) ||
        (u.email || '').toLowerCase().includes(term) ||
        (u.contactNumber || '').toLowerCase().includes(term)
      );
    });
  }, [users, searchTerm, roleFilter, statusFilter, verifiedFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / itemsPerPage));
  const paginated = filteredUsers.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const clearSelection = () => setSelectedIds(new Set());
  const selectAllOnPage = () => setSelectedIds(new Set(paginated.map((u) => u._id)));

  const handleBulkUpdate = async (action: string, value: string) => {
    if (selectedIds.size === 0) return;
    setBulkBusy(true);
    try {
      const updates: any = {};
      if (action === 'status') updates.status = value;
      if (action === 'role') updates.role = value;
      const result = await bulkUpdateUsers(Array.from(selectedIds), updates);
      clearSelection();
      setBulkConfirm(null);
      await fetchAll();
      alert(`Updated ${result.modifiedCount} users`);
    } catch (err: any) {
      alert(err.message || 'Bulk update failed');
    } finally {
      setBulkBusy(false);
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      await downloadUsersCsv({
        role: roleFilter === 'all' ? undefined : roleFilter,
        status: statusFilter === 'all' ? undefined : statusFilter,
      });
    } catch (err: any) {
      alert(err.message || 'Export failed');
    } finally {
      setExporting(false);
    }
  };

  const openDrawer = (userId: string) => {
    setActiveUserId(userId);
    setDrawerOpen(true);
  };

  return (
    <PrintablePage title="CustoMate — Accounts Report" subtitle="Customer + admin accounts with activity history">
    <div className="min-h-screen bg-slate-50">
      <div className="relative overflow-hidden bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-700 text-white no-print">
        <div className="absolute -top-32 -left-24 w-80 h-80 rounded-full bg-blue-400/30 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-32 -right-24 w-80 h-80 rounded-full bg-purple-400/40 blur-3xl pointer-events-none" />
        <div
          className="absolute inset-0 opacity-[0.06] pointer-events-none"
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.6) 1px, transparent 1px)',
            backgroundSize: '32px 32px',
          }}
        />
        <div className="relative max-w-7xl mx-auto px-6 lg:px-8 py-8 md:py-10 flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/15 backdrop-blur-md border border-white/20 text-[10px] font-bold uppercase tracking-widest mb-3">
              <Sparkles className="w-3 h-3" /> Accounts
            </div>
            <h1 className="text-3xl md:text-4xl font-black tracking-tight">User Management</h1>
            <p className="text-sm md:text-base text-white/85 mt-1 max-w-2xl">
              Manage customer accounts, role changes, suspensions and the full account audit trail.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 no-print">
            <button
              onClick={handleExport}
              disabled={exporting}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-bold text-white bg-white/15 backdrop-blur-sm border border-white/20 hover:bg-white/20 transition disabled:opacity-50"
            >
              <Download className="w-4 h-4" /> {exporting ? 'Exporting…' : 'Export CSV'}
            </button>
            <button
              onClick={async () => {
                const body = users.map((u: any) => [
                  u.name || '—',
                  u.email || '—',
                  u.role || 'customer',
                  u.status || 'active',
                  u.emailVerified ? 'Yes' : 'No',
                  u.orderCount ?? '—',
                  u.createdAt ? new Date(u.createdAt).toLocaleDateString() : '—',
                ]);
                await generateSimpleReport({
                  title: 'Users Report',
                  subtitle: 'Customer & staff directory',
                  kpis: [
                    { label: 'Users', value: String(users.length) },
                    { label: 'Customers', value: String(users.filter((u: any) => u.role === 'customer').length) },
                    { label: 'Staff', value: String(users.filter((u: any) => u.role !== 'customer').length) },
                    { label: 'Verified', value: String(users.filter((u: any) => u.emailVerified).length) },
                  ],
                  tables: [{
                    head: ['Name', 'Email', 'Role', 'Status', 'Verified', 'Orders', 'Joined'],
                    body,
                  }],
                  filename: 'bryle-closet-users',
                });
              }}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-bold text-white bg-white/15 backdrop-blur-sm border border-white/20 hover:bg-white/20 transition"
            >
              <Download className="w-4 h-4" /> Export PDF
            </button>
            <button
              onClick={fetchAll}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-bold text-blue-600 bg-white hover:bg-slate-50 shadow-xl shadow-black/10 transition-all hover:-translate-y-0.5"
            >
              <RefreshCw className="w-4 h-4" /> Refresh
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 lg:px-8 py-8 -mt-2 relative z-10">
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
          <KpiTile label="Total users" value={stats?.total ?? '—'} icon={Users} tint="from-blue-500 to-indigo-500" blob="bg-blue-100" />
          <KpiTile label="Customers" value={stats?.customers ?? '—'} hint={`${stats?.activeCustomers ?? 0} placed orders`} icon={UserCheck} tint="from-emerald-500 to-teal-500" blob="bg-emerald-100" />
          <KpiTile label="Admins" value={stats?.admins ?? '—'} icon={Crown} tint="from-purple-500 to-fuchsia-500" blob="bg-purple-100" />
          <KpiTile label="New this week" value={stats?.newThisWeek ?? '—'} hint={`${stats?.newThisMonth ?? 0} this month`} icon={Sparkles} tint="from-amber-500 to-orange-500" blob="bg-amber-100" />
          <KpiTile label="Suspended" value={stats?.suspended ?? '—'} icon={Ban} tint="from-rose-500 to-orange-500" blob="bg-rose-100" />
        </div>

        <div className="space-y-3 mb-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              placeholder="Search by name, email or phone…"
              className="pl-10"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="inline-flex p-1 rounded-full bg-white border border-slate-200">
              {['all', 'customer', 'admin', 'guest'].map((r) => (
                <button
                  key={r}
                  onClick={() => setRoleFilter(r)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold capitalize transition ${
                    roleFilter === r ? 'bg-slate-900 text-white shadow' : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {r === 'all' ? 'All roles' : r}
                </button>
              ))}
            </div>
            <div className="inline-flex p-1 rounded-full bg-white border border-slate-200">
              {['all', 'active', 'inactive', 'suspended'].map((s) => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold capitalize transition ${
                    statusFilter === s ? 'bg-slate-700 text-white' : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {s === 'all' ? 'All status' : s}
                </button>
              ))}
            </div>
            <div className="inline-flex p-1 rounded-full bg-white border border-slate-200">
              {(['all', 'verified', 'unverified'] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setVerifiedFilter(v)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold capitalize transition ${
                    verifiedFilter === v ? 'bg-emerald-600 text-white' : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {v === 'all' ? 'Any email' : v}
                </button>
              ))}
            </div>
          </div>
        </div>

        {selectedIds.size > 0 && (
          <div className="mb-4 p-3 rounded-2xl bg-gradient-to-br from-slate-900 to-indigo-900 text-white flex items-center justify-between flex-wrap gap-2">
            <div className="text-sm">
              <span className="font-bold">{selectedIds.size}</span> users selected
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={clearSelection} className="!text-white !border-white/30 hover:!bg-white/10">Clear</Button>
              <Button size="sm" disabled={bulkBusy} onClick={() => setBulkConfirm({ action: 'status', value: 'active' })}>
                <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Activate
              </Button>
              <Button size="sm" variant="danger" disabled={bulkBusy} onClick={() => setBulkConfirm({ action: 'status', value: 'suspended' })}>
                <Ban className="w-3.5 h-3.5 mr-1" /> Suspend
              </Button>
            </div>
          </div>
        )}

        {bulkConfirm && (
          <div className="mb-4 p-3 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-sm flex items-center justify-between flex-wrap gap-2">
            <span>Apply <strong className="capitalize">{bulkConfirm.value}</strong> to {selectedIds.size} users?</span>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setBulkConfirm(null)}>Cancel</Button>
              <Button size="sm" loading={bulkBusy} onClick={() => handleBulkUpdate(bulkConfirm.action, bulkConfirm.value)}>Confirm</Button>
            </div>
          </div>
        )}

        <Card className="border-0 shadow-xl shadow-gray-200/50 overflow-visible">
          {loading ? (
            <div className="p-12 text-center">
              <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
              <p className="text-slate-500 text-sm">Loading users…</p>
            </div>
          ) : paginated.length === 0 ? (
            <div className="p-12 text-center">
              <div className="w-14 h-14 rounded-2xl bg-slate-100 mx-auto flex items-center justify-center mb-3">
                <Users className="w-7 h-7 text-slate-400" />
              </div>
              <p className="text-sm font-medium text-slate-700">No users match</p>
              <p className="text-xs text-slate-500 mt-1">Try a different filter.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100 text-[10px] font-bold text-slate-600 uppercase tracking-wider">
                    <th className="px-3 py-3 text-left">
                      <input
                        type="checkbox"
                        checked={paginated.length > 0 && paginated.every((u) => selectedIds.has(u._id))}
                        onChange={(e) => (e.target.checked ? selectAllOnPage() : clearSelection())}
                        className="w-4 h-4 rounded border-slate-300"
                      />
                    </th>
                    <th className="text-left px-3 py-3">User</th>
                    <th className="text-left px-3 py-3">Contact</th>
                    <th className="text-center px-3 py-3">Role</th>
                    <th className="text-center px-3 py-3">Status</th>
                    <th className="text-center px-3 py-3">Email</th>
                    <th className="text-right px-3 py-3">Joined</th>
                    <th className="text-right px-3 py-3">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {paginated.map((u) => (
                    <tr
                      key={u._id}
                      className={`border-b border-slate-100 hover:bg-slate-50/60 transition cursor-pointer ${
                        selectedIds.has(u._id) ? 'bg-blue-50/40' : ''
                      }`}
                      onClick={() => openDrawer(u._id)}
                    >
                      <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedIds.has(u._id)}
                          onChange={() => toggleSelect(u._id)}
                          className="w-4 h-4 rounded border-slate-300"
                        />
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-black text-xs flex-shrink-0">
                            {u.name?.[0]?.toUpperCase() || '?'}
                          </div>
                          <div className="min-w-0">
                            <p className="font-bold text-slate-900 text-sm truncate max-w-[200px]">{u.name || '(no name)'}</p>
                            <p className="text-[11px] text-slate-500 truncate max-w-[200px]">{u.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-xs text-slate-600">{u.contactNumber || '—'}</td>
                      <td className="px-3 py-2.5 text-center">
                        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border ${ROLE_TINT[u.role] || ROLE_TINT.customer}`}>
                          {u.role === 'admin' && <Crown className="w-2.5 h-2.5" />}
                          {u.role}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <span className={`inline-flex px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border ${STATUS_TINT[u.status] || STATUS_TINT.active}`}>
                          {u.status}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        {u.isEmailVerified ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-600 inline-block" />
                        ) : (
                          <span className="text-[10px] text-slate-400 font-semibold">unverified</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right text-xs text-slate-600">
                        {u.createdAt ? new Date(u.createdAt).toLocaleDateString() : '—'}
                      </td>
                      <td className="px-3 py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => openDrawer(u._id)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 transition"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span className="hidden md:inline">View</span>
                          <ChevronRight className="w-3 h-3" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {!loading && filteredUsers.length > 0 && (
            <div className="px-4 pb-4 pt-3 border-t border-slate-100 mt-2">
              <Pagination
                page={currentPage}
                total={filteredUsers.length}
                pageSize={itemsPerPage}
                onPageChange={setCurrentPage}
                pageSizeOptions={[10, 25, 50]}
                itemLabel="user"
                itemLabelPlural="users"
              />
            </div>
          )}
        </Card>
      </div>

      <UserDetailDrawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        userId={activeUserId}
        onChanged={fetchAll}
      />
    </div>
    </PrintablePage>
  );
}

function KpiTile({ label, value, hint, icon: Icon, tint, blob }: any) {
  return (
    <div className="relative overflow-hidden rounded-2xl bg-white border border-slate-200 p-4 shadow-sm">
      <div className={`absolute -top-12 -right-12 w-32 h-32 rounded-full ${blob} opacity-50`} />
      <div className="relative">
        <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${tint} flex items-center justify-center shadow-lg mb-2.5`}>
          <Icon className="w-5 h-5 text-white" />
        </div>
        <p className="text-xl md:text-2xl font-black text-slate-900 tracking-tight">{value}</p>
        <p className="text-xs font-semibold text-slate-700 mt-0.5">{label}</p>
        {hint && <p className="text-[10px] text-slate-500 mt-0.5">{hint}</p>}
      </div>
    </div>
  );
}
