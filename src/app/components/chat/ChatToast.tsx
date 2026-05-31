import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { MessageSquare, X, ArrowRight } from 'lucide-react';
import type { ChatToast as ChatToastData } from '../../hooks/useChatNotifications';

interface Props {
  toast: ChatToastData | null;
  onDismiss: () => void;
  /** Where the "Open chat" link should go for this viewer. */
  viewerRole: 'customer' | 'admin' | 'staff';
}

const TINT: Record<string, string> = {
  customer: 'from-blue-500 to-indigo-600',
  admin:    'from-emerald-500 to-teal-600',
  staff:    'from-violet-500 to-fuchsia-600',
  system:   'from-amber-400 to-orange-500',
};

const ROLE_LABEL: Record<string, string> = {
  customer: 'Customer',
  admin: 'Store team',
  staff: 'Production team',
  system: 'CustoMate',
};

function initials(name: string, role: string) {
  if (role === 'system') return 'CM';
  return name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() || '').join('') || (role[0]?.toUpperCase() || '?');
}

export function ChatToast({ toast, onDismiss, viewerRole }: Props) {
  // Auto-dismiss after 7 seconds so it doesn't sit there forever.
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(onDismiss, 7000);
    return () => clearTimeout(t);
  }, [toast, onDismiss]);

  if (!toast) return null;

  const link = viewerRole === 'customer'
    ? `/order-tracking/${toast.orderId}`
    : `/admin/messages`;
  const tint = TINT[toast.fromRole] || TINT.customer;

  return (
    <div className="fixed z-[400] bottom-6 right-6 max-w-sm w-[calc(100%-3rem)] animate-in slide-in-from-bottom-4 duration-300">
      <div className="bg-white border border-slate-200 rounded-2xl shadow-2xl shadow-blue-900/15 overflow-hidden">
        <div className="px-4 py-3 flex items-start gap-3 relative">
          <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${tint} text-white font-black text-xs flex items-center justify-center shrink-0 shadow-md`}>
            {initials(toast.fromName, toast.fromRole)}
          </div>
          <div className="flex-1 min-w-0 pr-6">
            <div className="flex items-center gap-1.5 flex-wrap">
              <p className="text-sm font-bold text-slate-900 truncate">{toast.fromName || ROLE_LABEL[toast.fromRole]}</p>
              <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                Order #{toast.orderRef}
              </span>
            </div>
            <p className="text-sm text-slate-700 line-clamp-2 mt-0.5">{toast.body}</p>
            <Link
              to={link}
              onClick={onDismiss}
              className="inline-flex items-center gap-1 mt-2 text-xs font-bold text-blue-700 hover:text-blue-800 hover:underline"
            >
              Open chat <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          <button
            onClick={onDismiss}
            className="absolute top-2 right-2 w-6 h-6 rounded-md hover:bg-slate-100 text-slate-400 hover:text-slate-700 flex items-center justify-center"
            aria-label="Dismiss"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="px-4 py-1.5 bg-slate-50 border-t border-slate-100 text-[10px] font-bold text-slate-500 uppercase tracking-wider inline-flex items-center gap-1">
          <MessageSquare className="w-3 h-3" />
          New message
        </div>
      </div>
    </div>
  );
}

export default ChatToast;
