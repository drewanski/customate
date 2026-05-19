import React from 'react';
import { AlertOctagon, AlertTriangle, Info, CheckCircle2 } from 'lucide-react';
import type { Issue, IssueSeverity } from '../utils/printQuality';

/**
 * DesignQualityPanel — surfaces print-readiness warnings in the studio.
 *
 * Three severity levels with distinct treatment so customers can triage
 * at a glance:
 *   - error   → red, blocks checkout, must be fixed
 *   - warning → amber, soft recommendation
 *   - info    → blue, gentle suggestion
 *
 * Showing "All good" when the list is empty is intentional — positive
 * reassurance reduces customer second-guessing right before checkout.
 */

const META: Record<
  IssueSeverity,
  { color: string; bg: string; border: string; icon: any; label: string }
> = {
  error: {
    color: 'text-rose-700',
    bg: 'bg-rose-50',
    border: 'border-rose-300',
    icon: AlertOctagon,
    label: 'Critical',
  },
  warning: {
    color: 'text-amber-700',
    bg: 'bg-amber-50',
    border: 'border-amber-300',
    icon: AlertTriangle,
    label: 'Warning',
  },
  info: {
    color: 'text-blue-700',
    bg: 'bg-blue-50',
    border: 'border-blue-300',
    icon: Info,
    label: 'Tip',
  },
};

export function DesignQualityPanel({ issues }: { issues: Issue[] }) {
  if (issues.length === 0) {
    return (
      <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 flex items-center gap-2">
        <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
        <div className="min-w-0">
          <p className="text-xs font-bold text-emerald-800">Print-ready</p>
          <p className="text-[11px] text-emerald-700">
            Your design passes all quality checks.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
          Print quality
        </p>
        <p className="text-[10px] text-slate-400">
          {issues.length} {issues.length === 1 ? 'check' : 'checks'} to review
        </p>
      </div>
      {issues.map((issue, i) => {
        const meta = META[issue.severity];
        const Icon = meta.icon;
        return (
          <div
            key={`${issue.code}-${i}`}
            className={`p-2.5 rounded-lg border ${meta.bg} ${meta.border}`}
          >
            <div className="flex items-start gap-2">
              <Icon className={`w-3.5 h-3.5 flex-shrink-0 mt-0.5 ${meta.color}`} />
              <div className="min-w-0 flex-1">
                <p className={`text-[10px] font-black uppercase tracking-wider ${meta.color}`}>
                  {meta.label}
                </p>
                <p className="text-xs font-semibold text-slate-900 leading-snug mt-0.5">
                  {issue.message}
                </p>
                {issue.hint && (
                  <p className="text-[11px] text-slate-600 mt-1 leading-snug">
                    {issue.hint}
                  </p>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
