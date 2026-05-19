import React from 'react';
import { Link } from 'react-router-dom';
import { Sparkles, ShieldCheck, Palette, Box } from 'lucide-react';

interface AuthLayoutProps {
  /** Form content for the right-side panel */
  children: React.ReactNode;
  /** Bold title at top of form (e.g. "Welcome back") */
  title: string;
  /** Subtitle below the title */
  subtitle?: string;
  /** Footer link section under the form (e.g. "Don't have account? Sign up") */
  footer?: React.ReactNode;
  /** Override the marketing copy in the brand panel */
  brandHeadline?: string;
  brandSubtext?: string;
}

/**
 * Split-screen auth layout used by Login, Register, ForgotPassword, ResetPassword.
 * - Desktop: left = branded gradient panel, right = white form panel
 * - Mobile: branded header strip on top, form panel below
 *
 * Colors stay in the system palette: blue-600 + indigo-600 + purple-600 gradient,
 * slate text, white surfaces.
 */
export function AuthLayout({
  children,
  title,
  subtitle,
  footer,
  brandHeadline = 'Design your dream merch in 3D.',
  brandSubtext = 'Customize products with text, images, colors and materials — see exactly how it looks before you order.',
}: AuthLayoutProps) {
  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-[#F8FAFC]">
      {/* ── Brand Panel (left half / top strip on mobile) ── */}
      <div className="relative md:w-1/2 lg:w-[55%] overflow-hidden bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-700 text-white">
        {/* Decorative animated blobs */}
        <div className="absolute -top-32 -left-24 w-96 h-96 rounded-full bg-blue-400/30 blur-3xl animate-[pulse_8s_ease-in-out_infinite]" />
        <div className="absolute top-1/3 -right-24 w-80 h-80 rounded-full bg-purple-400/40 blur-3xl animate-[pulse_10s_ease-in-out_infinite]" />
        <div className="absolute -bottom-32 left-1/4 w-96 h-96 rounded-full bg-indigo-500/30 blur-3xl animate-[pulse_12s_ease-in-out_infinite]" />

        {/* Subtle grid pattern overlay */}
        <div
          className="absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.6) 1px, transparent 1px)',
            backgroundSize: '32px 32px',
          }}
        />

        <div className="relative h-full flex flex-col p-8 md:p-12 lg:p-16 min-h-[260px] md:min-h-screen">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2.5 group w-fit">
            <div className="w-10 h-10 rounded-xl bg-white text-blue-600 font-black text-lg flex items-center justify-center shadow-lg shadow-black/10 group-hover:scale-105 transition-transform">
              CM
            </div>
            <span className="text-xl font-bold tracking-tight">CustoMate</span>
          </Link>

          {/* Marketing copy — hidden on small mobile to save space */}
          <div className="flex-1 hidden md:flex flex-col justify-center max-w-lg mt-12">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/15 backdrop-blur-sm text-xs font-semibold mb-6 w-fit">
              <Sparkles className="w-3.5 h-3.5" />
              Built for creators
            </div>
            <h2 className="text-4xl lg:text-5xl font-bold leading-tight mb-4">
              {brandHeadline}
            </h2>
            <p className="text-white/80 text-lg leading-relaxed mb-10">
              {brandSubtext}
            </p>

            {/* Feature highlights */}
            <div className="space-y-3.5">
              {[
                { Icon: Box, label: 'Live 3D preview on any product' },
                { Icon: Palette, label: 'Materials, patterns, colors, decals' },
                { Icon: ShieldCheck, label: 'Secure checkout & order tracking' },
              ].map(({ Icon, label }) => (
                <div key={label} className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-white/15 backdrop-blur-sm flex items-center justify-center">
                    <Icon className="w-4 h-4" />
                  </div>
                  <span className="text-sm text-white/90 font-medium">{label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Footer credit on the brand panel */}
          <div className="hidden md:block mt-auto text-xs text-white/60 pt-8">
            © {new Date().getFullYear()} CustoMate. All rights reserved.
          </div>
        </div>
      </div>

      {/* ── Form Panel (right half / bottom on mobile) ── */}
      <div className="flex-1 flex items-center justify-center px-4 sm:px-8 py-8 md:py-12">
        <div className="w-full max-w-md">
          {/* Form heading */}
          <div className="mb-8">
            <h1 className="text-2xl md:text-3xl font-bold text-slate-900 leading-tight">{title}</h1>
            {subtitle && <p className="mt-2 text-sm text-slate-600">{subtitle}</p>}
          </div>

          {children}

          {footer && <div className="mt-8 pt-6 border-t border-slate-100">{footer}</div>}
        </div>
      </div>
    </div>
  );
}

// ─── Modern form input with leading icon ──────────────────────────────────
interface AuthInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  icon?: React.ReactNode;
  trailing?: React.ReactNode;
  error?: string;
}

export const AuthInput = React.forwardRef<HTMLInputElement, AuthInputProps>(function AuthInput(
  { label, icon, trailing, error, className = '', id, ...props },
  ref,
) {
  const inputId = id || (label ? `auth-input-${label.toLowerCase().replace(/\s+/g, '-')}` : undefined);
  return (
    <div className="w-full">
      {label && (
        <label htmlFor={inputId} className="block mb-1.5 text-xs font-bold text-slate-700">
          {label}
        </label>
      )}
      <div
        className={`relative flex items-center bg-white border rounded-xl transition-all ${
          error
            ? 'border-rose-400 focus-within:ring-2 focus-within:ring-rose-100'
            : 'border-slate-200 focus-within:border-blue-500 focus-within:ring-4 focus-within:ring-blue-100'
        }`}
      >
        {icon && (
          <div className="pl-3.5 text-slate-400 pointer-events-none">{icon}</div>
        )}
        <input
          ref={ref}
          id={inputId}
          className={`flex-1 bg-transparent px-3.5 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60 ${className}`}
          {...props}
        />
        {trailing && <div className="pr-3 flex items-center">{trailing}</div>}
      </div>
      {error && <p className="mt-1 text-xs text-rose-600 font-medium">{error}</p>}
    </div>
  );
});

// ─── Gradient CTA button (used as the form submit) ────────────────────────
interface AuthButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  loading?: boolean;
  loadingText?: string;
}

export function AuthButton({
  children,
  loading,
  loadingText = 'Please wait…',
  disabled,
  className = '',
  ...props
}: AuthButtonProps) {
  return (
    <button
      disabled={disabled || loading}
      className={`w-full relative px-6 py-3 rounded-xl font-bold text-sm text-white transition-all
        bg-gradient-to-br from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700
        shadow-lg shadow-blue-200 hover:shadow-xl hover:shadow-blue-300 hover:-translate-y-0.5
        disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:shadow-none
        ${className}`}
      {...props}
    >
      {loading ? (
        <span className="inline-flex items-center justify-center gap-2">
          <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
            <path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
          </svg>
          {loadingText}
        </span>
      ) : (
        children
      )}
    </button>
  );
}

// ─── "or continue with" divider ────────────────────────────────────────────
export function AuthDivider({ text = 'or continue with' }: { text?: string }) {
  return (
    <div className="relative my-6">
      <div className="absolute inset-0 flex items-center" aria-hidden="true">
        <div className="w-full border-t border-slate-200" />
      </div>
      <div className="relative flex justify-center">
        <span className="px-3 bg-white text-[11px] font-semibold text-slate-400 uppercase tracking-widest">
          {text}
        </span>
      </div>
    </div>
  );
}
