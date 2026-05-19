import React, { useEffect, useRef, useState } from 'react';
import { Modal } from './Modal';
import { sendOtp, verifyOtp, googleSignIn } from '../api';
import { Mail, ShieldCheck, RefreshCw, AlertCircle } from 'lucide-react';
import { Button } from './Button';

interface Props {
  isOpen: boolean;
  email: string;
  name?: string;
  credential: string;
  onClose: () => void;
  onSuccess: (token: string, user: any) => void;
}

/**
 * Modal that gates first-time Google sign-in behind an email OTP.
 *
 * Flow:
 *   1. When opened, automatically sends a 6-digit code to the email Google
 *      returned. The user can resend after a 60-second cooldown.
 *   2. User enters the code → calls /otp/verify.
 *   3. On success, retries Google sign-in with `confirmCreate: true` so the
 *      backend finally creates the account and returns a JWT.
 *
 * We do NOT trust the email displayed to the user — it's the email from
 * Google's signed JWT and we verify it server-side every time.
 */
export function GoogleOtpModal({ isOpen, email, name, credential, onClose, onSuccess }: Props) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [info, setInfo] = useState('');
  const sentOnceRef = useRef(false);

  // Auto-send OTP when the modal opens for a new email
  useEffect(() => {
    if (!isOpen) {
      sentOnceRef.current = false;
      return;
    }
    if (sentOnceRef.current) return;
    sentOnceRef.current = true;
    setCode('');
    setError('');
    setInfo('');
    handleSend();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, email]);

  // Cooldown timer
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const id = setInterval(() => {
      setResendCooldown((s) => (s <= 1 ? 0 : s - 1));
    }, 1000);
    return () => clearInterval(id);
  }, [resendCooldown]);

  const handleSend = async () => {
    setError('');
    setInfo('');
    setSending(true);
    try {
      await sendOtp(email);
      setInfo(`Verification code sent to ${email}`);
      setResendCooldown(60);
    } catch (err: any) {
      setError(err.message || 'Failed to send verification code');
    } finally {
      setSending(false);
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (verifying) return;
    setError('');
    const trimmed = code.trim();
    if (!/^\d{6}$/.test(trimmed)) {
      setError('Enter the 6-digit code from your email');
      return;
    }
    setVerifying(true);
    try {
      // Step 1: prove mailbox control
      await verifyOtp(email, trimmed);
      // Step 2: ask backend to actually create the account with the original
      // Google credential. Backend re-validates both the JWT and the OTP.
      const res = await googleSignIn(credential, { confirmCreate: true });
      onSuccess(res.token, res.user);
    } catch (err: any) {
      setError(err.message || 'Verification failed');
    } finally {
      setVerifying(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Verify your email"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={verifying}>
            Cancel
          </Button>
          <Button onClick={handleVerify} loading={verifying} disabled={code.length !== 6}>
            <ShieldCheck className="w-4 h-4 mr-1.5" />
            Verify & continue
          </Button>
        </>
      }
    >
      <form onSubmit={handleVerify} className="space-y-4 px-1">
        <div className="flex items-start gap-3 p-3 rounded-2xl bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-100">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center flex-shrink-0">
            <Mail className="w-5 h-5 text-white" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-slate-900">
              First-time sign-in for {name ? <span>{name}</span> : 'this Google account'}
            </p>
            <p className="text-xs text-slate-600 mt-0.5 break-words">
              For your security, we need to confirm you own <strong>{email}</strong> before
              creating your account. We sent a 6-digit code to that inbox.
            </p>
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
            Verification code
          </label>
          <input
            inputMode="numeric"
            pattern="\d*"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            autoFocus
            className="w-full h-14 text-center font-mono text-2xl tracking-[0.5em] border-2 border-slate-200 rounded-xl focus:ring-4 focus:ring-blue-500/15 focus:border-blue-500"
            placeholder="······"
          />
        </div>

        <div className="flex items-center justify-between text-xs">
          <button
            type="button"
            onClick={handleSend}
            disabled={resendCooldown > 0 || sending}
            className="inline-flex items-center gap-1 font-semibold text-blue-600 hover:text-blue-700 disabled:text-slate-400 disabled:cursor-not-allowed"
          >
            <RefreshCw className={`w-3 h-3 ${sending ? 'animate-spin' : ''}`} />
            {sending ? 'Sending…' : resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend code'}
          </button>
          <span className="text-slate-500">Code expires in 5 minutes</span>
        </div>

        {info && (
          <div className="flex items-start gap-2 p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs">
            <ShieldCheck className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
            <span>{info}</span>
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs">
            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}
      </form>
    </Modal>
  );
}
