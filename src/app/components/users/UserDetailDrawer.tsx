import React, { useEffect, useState } from 'react';
import { Modal } from '../Modal';
import { Button } from '../Button';
import { Textarea } from '../Textarea';
import {
  User as UserIcon,
  Mail,
  Phone,
  Shield,
  Calendar as CalendarIcon,
  ShoppingCart,
  DollarSign,
  Clock,
  MessageCircle,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Ban,
  PlayCircle,
  Send,
  ChevronRight,
  Edit,
  Crown,
} from 'lucide-react';
import { getUserActivity, updateUserAdmin as updateUser, addUserNote } from '../../api';
import { formatPeso } from '../../utils/format';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  userId: string | null;
  onChanged: () => void;
}

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

const LOG_TYPE_META: Record<string, { icon: any; tint: string; label: string }> = {
  created: { icon: PlayCircle, tint: 'text-blue-700', label: 'Account created' },
  status_changed: { icon: ChevronRight, tint: 'text-indigo-700', label: 'Status changed' },
  role_changed: { icon: Crown, tint: 'text-purple-700', label: 'Role changed' },
  suspended: { icon: Ban, tint: 'text-rose-700', label: 'Suspended' },
  reactivated: { icon: PlayCircle, tint: 'text-emerald-700', label: 'Reactivated' },
  note: { icon: MessageCircle, tint: 'text-slate-700', label: 'Note' },
  email_verified: { icon: CheckCircle2, tint: 'text-emerald-700', label: 'Email verified' },
  password_reset: { icon: AlertTriangle, tint: 'text-amber-700', label: 'Password reset' },
  logged_in: { icon: Shield, tint: 'text-blue-700', label: 'Logged in' },
};

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

function describeLog(log: any) {
  if (log.type === 'note') return log.note;
  if (['status_changed', 'role_changed', 'suspended', 'reactivated'].includes(log.type)) {
    return [`${log.from || '—'} → ${log.to || '—'}`, log.reason && `(${log.reason})`].filter(Boolean).join(' ');
  }
  return log.note || '';
}

/**
 * UserDetailDrawer — full customer profile with orders, activity timeline,
 * audit log, and admin actions (suspend/reactivate/role-change/note).
 *
 * Loads /api/users/:id/activity on open which returns the user, recent
 * orders (last 20), audit logs (last 50), and computed totals.
 */
export function UserDetailDrawer({ isOpen, onClose, userId, onChanged }: Props) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [acting, setActing] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'error'; msg: string } | null>(null);

  const load = async () => {
    if (!userId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await getUserActivity(userId);
      setData(res);
    } catch (err: any) {
      setError(err.message || 'Failed to load user');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && userId) {
      setFeedback(null);
      setNote('');
      load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, userId]);

  const handleStatusChange = async (status: string, reason?: string) => {
    if (!userId) return;
    setActing(true);
    setFeedback(null);
    try {
      await updateUser(userId, { status, reason });
      setFeedback({ kind: 'success', msg: `Status updated to ${status}` });
      await load();
      onChanged();
    } catch (err: any) {
      setFeedback({ kind: 'error', msg: err.message || 'Failed' });
    } finally {
      setActing(false);
    }
  };

  const handleRoleChange = async (role: string) => {
    if (!userId) return;
    if (!confirm(`Change role to ${role}? This grants/revokes admin privileges immediately.`)) return;
    setActing(true);
    setFeedback(null);
    try {
      await updateUser(userId, { role, reason: 'Admin role change' });
      setFeedback({ kind: 'success', msg: `Role updated to ${role}` });
      await load();
      onChanged();
    } catch (err: any) {
      setFeedback({ kind: 'error', msg: err.message || 'Failed' });
    } finally {
      setActing(false);
    }
  };

  const handleAddNote = async () => {
    if (!userId || !note.trim()) return;
    setSavingNote(true);
    try {
      await addUserNote(userId, note.trim());
      setNote('');
      await load();
    } catch (err: any) {
      setFeedback({ kind: 'error', msg: err.message || 'Failed to add note' });
    } finally {
      setSavingNote(false);
    }
  };

  const handleSuspend = async () => {
    const reason = prompt('Reason for suspension (visible in audit log):');
    if (!reason) return;
    await handleStatusChange('suspended', reason);
  };

  if (!userId) return null;

  const u = data?.user;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={u ? u.name : 'User'}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Close</Button>
          {u && u.status !== 'suspended' && u.role !== 'admin' && (
            <Button variant="danger" disabled={acting} onClick={handleSuspend}>
              <Ban className="w-4 h-4 mr-1.5" /> Suspend
            </Button>
          )}
          {u && u.status === 'suspended' && (
            <Button disabled={acting} onClick={() => handleStatusChange('active', 'Reactivated by admin')}>
              <PlayCircle className="w-4 h-4 mr-1.5" /> Reactivate
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-5 max-h-[78vh] overflow-y-auto px-1">
        {loading && !data && (
          <div className="py-10 text-center">
            <div className="w-8 h-8 mx-auto border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
            <p className="text-xs text-slate-500 mt-2">Loading profile…</p>
          </div>
        )}
        {error && (
          <div className="flex items-start gap-2 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm">
            <AlertTriangle className="w-4 h-4 mt-0.5" /><span>{error}</span>
          </div>
        )}

        {u && (
          <>
            <div className="p-4 rounded-2xl bg-gradient-to-br from-slate-50 to-blue-50 border border-slate-200">
              <div className="flex items-start gap-4">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-xl font-black shadow-md flex-shrink-0">
                  {u.name?.[0]?.toUpperCase() || '?'}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-lg font-black text-slate-900 truncate">{u.name}</p>
                  <p className="text-xs text-slate-600 flex items-center gap-1 truncate">
                    <Mail className="w-3 h-3" /> {u.email}
                  </p>
                  {u.contactNumber && (
                    <p className="text-xs text-slate-600 flex items-center gap-1">
                      <Phone className="w-3 h-3" /> {u.contactNumber}
                    </p>
                  )}
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${ROLE_TINT[u.role] || ROLE_TINT.customer}`}>
                      {u.role === 'admin' && <Crown className="w-2.5 h-2.5" />}
                      {u.role}
                    </span>
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${STATUS_TINT[u.status] || STATUS_TINT.active}`}>
                      {u.status}
                    </span>
                    {u.isEmailVerified && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200">
                        <CheckCircle2 className="w-2.5 h-2.5" /> Verified
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="mt-3 pt-3 border-t border-slate-200 grid grid-cols-2 gap-3 text-xs">
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Joined</p>
                  <p className="font-semibold text-slate-900">{u.createdAt ? new Date(u.createdAt).toLocaleDateString() : '—'}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Last login</p>
                  <p className="font-semibold text-slate-900">{u.lastLogin ? timeAgo(u.lastLogin) : 'Never'}</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <StatTile label="Orders" value={data.orderCount || 0} icon={ShoppingCart} />
              <StatTile label="Lifetime spend" value={formatPeso(data.totalSpent || 0)} icon={DollarSign} />
              <StatTile label="Refunded" value={formatPeso(data.totalRefunded || 0)} icon={AlertTriangle} tint={(data.totalRefunded || 0) > 0 ? 'text-rose-600' : ''} />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" size="sm" disabled={acting || u.role === 'admin'} onClick={() => handleRoleChange('admin')}>
                <Crown className="w-3.5 h-3.5 mr-1" /> Promote to admin
              </Button>
              <Button variant="outline" size="sm" disabled={acting || u.role !== 'admin'} onClick={() => handleRoleChange('customer')}>
                Revoke admin
              </Button>
            </div>

            {feedback && (
              <div className={`flex items-start gap-2 p-3 rounded-xl text-sm ${
                feedback.kind === 'success'
                  ? 'bg-emerald-50 border border-emerald-200 text-emerald-700'
                  : 'bg-rose-50 border border-rose-200 text-rose-700'
              }`}>
                {feedback.kind === 'success' ? <CheckCircle2 className="w-4 h-4 mt-0.5" /> : <AlertTriangle className="w-4 h-4 mt-0.5" />}
                <span>{feedback.msg}</span>
              </div>
            )}

            <div>
              <p className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-2 flex items-center gap-1">
                <ShoppingCart className="w-3.5 h-3.5" /> Recent orders
              </p>
              {!data.recentOrders || data.recentOrders.length === 0 ? (
                <p className="text-xs text-slate-500 italic">This customer hasn't ordered yet.</p>
              ) : (
                <ul className="space-y-1">
                  {data.recentOrders.slice(0, 6).map((o: any) => (
                    <li key={o._id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50">
                      <span className="text-[10px] font-mono text-slate-500">#{String(o._id).slice(-6)}</span>
                      <span className="text-xs font-semibold text-slate-900">{o.totalQty}u</span>
                      <span className="text-xs font-bold text-slate-900">{formatPeso(o.totalPrice || 0)}</span>
                      <span className={`inline-flex px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ml-auto ${
                        o.status === 'paid' || o.status === 'delivered' ? 'bg-emerald-100 text-emerald-700'
                        : o.status === 'cancelled' || o.status === 'refunded' ? 'bg-rose-100 text-rose-700'
                        : 'bg-amber-100 text-amber-700'
                      }`}>
                        {o.status?.replace('_', ' ')}
                      </span>
                      <span className="text-[10px] text-slate-500 hidden sm:inline">{new Date(o.createdAt).toLocaleDateString()}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div>
              <p className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                <MessageCircle className="w-3.5 h-3.5" /> Add internal note
              </p>
              <Textarea rows={2} placeholder="Customer relationship note, escalation, support context…" value={note} onChange={(e) => setNote(e.target.value)} />
              <div className="mt-1.5 flex justify-end">
                <Button size="sm" disabled={!note.trim() || savingNote} loading={savingNote} onClick={handleAddNote}>
                  <Send className="w-3 h-3 mr-1" /> Post note
                </Button>
              </div>
            </div>

            <div>
              <p className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-2 flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" /> Activity timeline
              </p>
              {!data.history || data.history.length === 0 ? (
                <p className="text-xs text-slate-500 italic">No activity logged yet.</p>
              ) : (
                <div className="space-y-2">
                  {data.history.map((log: any) => {
                    const meta = LOG_TYPE_META[log.type] || LOG_TYPE_META.note;
                    const Icon = meta.icon;
                    return (
                      <div key={log._id} className="flex items-start gap-2.5 p-2 rounded-lg hover:bg-slate-50">
                        <div className={`w-7 h-7 rounded-lg bg-white border border-slate-200 flex items-center justify-center flex-shrink-0 ${meta.tint}`}>
                          <Icon className="w-3.5 h-3.5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`text-xs font-bold ${meta.tint}`}>{meta.label}</span>
                            <span className="text-[11px] text-slate-500">by {log.performedByName || 'System'} · {timeAgo(log.createdAt)}</span>
                          </div>
                          <p className="text-xs text-slate-700 mt-0.5 break-words">{describeLog(log)}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

function StatTile({ label, value, icon: Icon, tint }: any) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <Icon className={`w-3.5 h-3.5 mb-1 ${tint || 'text-slate-400'}`} />
      <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">{label}</p>
      <p className={`text-base font-black tracking-tight ${tint || 'text-slate-900'}`}>{value}</p>
    </div>
  );
}
