import React, { useEffect, useMemo, useState } from 'react';
import { login, register, googleSignIn, sendPhoneOtp, verifyPhoneOtp, sendOtp, verifyOtp, guestLogin } from '../api';
import { useNavigate, Link } from 'react-router-dom';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { Card, CardHeader, CardTitle, CardContent } from '../components/Card';
import { Modal } from '../components/Modal';
import { useAuth } from '../hooks/useAuth';
import { AuthLayout, AuthInput, AuthButton, AuthDivider } from '../components/AuthLayout';
import { Mail, Lock, Eye, EyeOff, User, Phone, AlertCircle, CheckCircle2, ArrowLeft } from 'lucide-react';
import { GoogleOtpModal } from '../components/GoogleOtpModal';

const GOOGLE_CLIENT_ID = '458001122120-l668j5ulj18pqmu426t6v0pcno0ru73j.apps.googleusercontent.com';

const API_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000/api';
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const isValidEmail = (value: string) => emailRegex.test(value.trim());
const isValidPhone = (value: string) => /^(\+639|09)\d{9}$/.test(value.trim());
const validatePasswordRules = (pwd: string) => {
  const hasUpperCase = /[A-Z]/.test(pwd);
  const hasLowerCase = /[a-z]/.test(pwd);
  const hasNumber = /[0-9]/.test(pwd);
  const hasSpecialChar = /[!@#$%^&*()_+\-=\$\${};':"\\|,.<>\/?]/.test(pwd);
  return {
    minLength: pwd.length >= 8,
    maxLength: pwd.length <= 17,
    hasUpperCase,
    hasLowerCase,
    hasNumber,
    hasSpecialChar
  };
};

export function Login() {
  const navigate = useNavigate();
  const { loginUser } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [googleReady, setGoogleReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const [isLocked, setIsLocked] = useState(false);
  const [lockoutTime, setLockoutTime] = useState(0);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [postAuthLoading, setPostAuthLoading] = useState(false);
  const [postAuthMessage, setPostAuthMessage] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  // First-time Google sign-in OTP gate
  const [googleOtp, setGoogleOtp] = useState<{ email: string; name: string; credential: string } | null>(null);

  const validateLoginForm = () => {
    const nextErrors: { email?: string; password?: string } = {};
    if (!email.trim()) nextErrors.email = 'Email is required';
    else if (!isValidEmail(email)) nextErrors.email = 'Invalid email format';
    if (!password) nextErrors.password = 'Password is required';
    setFieldErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!validateLoginForm()) return;
    try {
      if (loading) return;
      setLoading(true);
      const res = await login(email.trim(), password);
      loginUser(res.token, res.user);
      setPostAuthMessage(res.user.role === 'admin' ? 'Opening admin dashboard...' : 'Opening your dashboard...');
      setPostAuthLoading(true);
      await new Promise((r) => setTimeout(r, 700));
      navigate(res.user.role === 'admin' ? '/admin' : '/dashboard');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const redirectWithAnimation = async (role: string) => {
    setPostAuthLoading(true);
    setPostAuthMessage(role === 'admin' ? 'Opening admin dashboard...' : 'Opening your dashboard...');
    await new Promise((r) => setTimeout(r, 700));
    navigate(role === 'admin' ? '/admin' : '/dashboard');
  };

  useEffect(() => {
    console.log('🔍 Login Google Sign-In: Initializing...');
    console.log('🔍 Login Google Client ID:', GOOGLE_CLIENT_ID);
    
    const googleApi = (window as any).google;
    console.log('🔍 Login Google API available:', !!googleApi);
    console.log('🔍 Login Google accounts available:', !!googleApi?.accounts);
    console.log('🔍 Login Google accounts.id available:', !!googleApi?.accounts?.id);
    
    if (!googleApi?.accounts?.id) {
      console.log('❌ Login Google Sign-In: Google API not loaded yet');
      return;
    }
    
    console.log('✅ Login Google Sign-In: Initializing Google Identity Services');
    googleApi.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: async (response: any) => {
        try {
          if (googleLoading) return;
          setGoogleLoading(true);
          setError('');
          const res = await googleSignIn(response.credential);
          loginUser(res.token, res.user);
          await redirectWithAnimation(res.user.role);
        } catch (err: any) {
          // Brand-new Google account — open the OTP gate before creation
          if (err?.code === 'NEEDS_OTP') {
            setGoogleOtp({
              email: err.email,
              name: err.suggestedName || '',
              credential: response.credential,
            });
            return;
          }
          setError(err.message || 'Google sign-in failed');
        } finally {
          setGoogleLoading(false);
        }
      },
      auto_select: false,
      cancel_on_tap_outside: false
    });
    setGoogleReady(true);
    console.log('✅ Login Google Sign-In: Initialization complete');
  }, [navigate]);

  useEffect(() => {
    console.log('🔍 Login Google Sign-In: Button rendering effect triggered');
    console.log('🔍 Login Google Ready:', googleReady);
    
    if (!googleReady) {
      console.log('❌ Login Google Sign-In: Not ready yet');
      return;
    }
    
    const googleApi = (window as any).google;
    const button = document.getElementById('google-login-btn');
    
    console.log('🔍 Login Google API available for button:', !!googleApi);
    console.log('🔍 Login Google accounts.id.renderButton available:', !!googleApi?.accounts?.id?.renderButton);
    console.log('🔍 Login Button element found:', !!button);
    
    if (googleApi?.accounts?.id?.renderButton && button) {
      console.log('✅ Login Google Sign-In: Rendering button');
      googleApi.accounts.id.renderButton(button, { theme: 'outline', size: 'large', width: 400 });
      console.log('✅ Login Google Sign-In: Button rendered successfully');
    } else {
      console.log('❌ Login Google Sign-In: Cannot render button');
      console.log('❌ Login Missing renderButton:', !googleApi?.accounts?.id?.renderButton);
      console.log('❌ Login Missing button element:', !button);
    }
  }, [googleReady]);

  return (
    <>
      {/* Post-auth loading overlay */}
      {postAuthLoading && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl bg-white shadow-2xl p-8 text-center">
            <div className="w-12 h-12 mx-auto rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center mb-4">
              <div className="w-6 h-6 border-3 border-white border-t-transparent rounded-full animate-spin" />
            </div>
            <p className="font-bold text-slate-900">Signing you in…</p>
            <p className="mt-1 text-sm text-slate-500">{postAuthMessage || 'Please wait a moment'}</p>
          </div>
        </div>
      )}

      <AuthLayout
        title="Welcome back"
        subtitle="Sign in to continue customizing your products."
        footer={
          <p className="text-center text-sm text-slate-600">
            Don't have an account?{' '}
            <Link to="/register" className="font-bold text-blue-600 hover:text-blue-700 hover:underline">
              Create one for free
            </Link>
          </p>
        }
      >
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Error banner */}
          {error && (
            <div className="flex items-start gap-2.5 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <div className="text-sm">
                {isLocked ? (
                  <>
                    <p className="font-bold">Account temporarily locked</p>
                    <p className="text-xs mt-0.5">Try again in {Math.ceil(remainingSeconds / 60)} minute{Math.ceil(remainingSeconds / 60) === 1 ? '' : 's'} ({remainingSeconds}s remaining)</p>
                  </>
                ) : (
                  error
                )}
              </div>
            </div>
          )}

          <AuthInput
            label="Email address"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            disabled={loading || googleLoading}
            icon={<Mail className="w-4 h-4" />}
            error={fieldErrors.email}
            autoComplete="email"
          />

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-bold text-slate-700">Password</label>
              <Link
                to="/forgot-password"
                className="text-xs font-semibold text-blue-600 hover:text-blue-700 hover:underline"
              >
                Forgot password?
              </Link>
            </div>
            <AuthInput
              type={showPassword ? 'text' : 'password'}
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={loading || googleLoading}
              icon={<Lock className="w-4 h-4" />}
              error={fieldErrors.password}
              autoComplete="current-password"
              trailing={
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="p-1.5 text-slate-400 hover:text-slate-600 rounded-md hover:bg-slate-50"
                  tabIndex={-1}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              }
            />
          </div>

          <AuthButton type="submit" loading={loading} loadingText="Signing in…" disabled={googleLoading || isLocked}>
            Sign in
          </AuthButton>
        </form>

        <AuthDivider />

        {/* Google sign-in container */}
        <div className={`flex justify-center ${loading || googleLoading ? 'pointer-events-none opacity-60' : ''}`}>
          <div id="google-login-btn" />
        </div>
      </AuthLayout>

      {/* OTP gate for first-time Google sign-in — backend rejects creation
          until the user proves they own the inbox */}
      {googleOtp && (
        <GoogleOtpModal
          isOpen={true}
          email={googleOtp.email}
          name={googleOtp.name}
          credential={googleOtp.credential}
          onClose={() => setGoogleOtp(null)}
          onSuccess={async (token, user) => {
            loginUser(token, user);
            setGoogleOtp(null);
            await redirectWithAnimation(user.role);
          }}
        />
      )}
    </>
  );
}

export function Register() {
  const navigate = useNavigate();
  const { loginUser } = useAuth();
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    contactNumber: '',
    password: '',
    confirmPassword: '',
    notificationPreference: 'email' as 'sms' | 'email'
  });
  const [error, setError] = useState('');
  const [googleReady, setGoogleReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{ [key: string]: string }>({});
  const [isLocked, setIsLocked] = useState(false);
  const [lockoutTime, setLockoutTime] = useState(0);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [isEmailVerified, setIsEmailVerified] = useState(false);
  // First-time Google sign-in OTP gate (same as Login but mounted here too
  // so the Google button on the register page also requires verification)
  const [googleOtp, setGoogleOtp] = useState<{ email: string; name: string; credential: string } | null>(null);
  const [emailOtpOpen, setEmailOtpOpen] = useState(false);
  const [emailVerificationCode, setEmailVerificationCode] = useState('');
  const [emailOtpError, setEmailOtpError] = useState('');
  const [emailOtpSending, setEmailOtpSending] = useState(false);
  const [emailOtpVerifying, setEmailOtpVerifying] = useState(false);
  const [otpAttempts, setOtpAttempts] = useState(0);
  const [otpExpiresAt, setOtpExpiresAt] = useState<Date | null>(null);
  const [canResend, setCanResend] = useState(true);
  const [resendSeconds, setResendSeconds] = useState(0);
  const [postAuthLoading, setPostAuthLoading] = useState(false);
  const [postAuthMessage, setPostAuthMessage] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const passwordRules = useMemo(() => validatePasswordRules(formData.password), [formData.password]);
  const unmetPasswordRequirements = useMemo(() => {
    const rules = validatePasswordRules(formData.password);
    return [
      !rules.minLength ? { key: 'minLength', label: 'Min 8 characters' } : null,
      !rules.maxLength ? { key: 'maxLength', label: 'Max 17 characters' } : null,
      !rules.hasUpperCase ? { key: 'hasUpperCase', label: 'At least 1 uppercase letter' } : null,
      !rules.hasLowerCase ? { key: 'hasLowerCase', label: 'At least 1 lowercase letter' } : null,
      !rules.hasNumber ? { key: 'hasNumber', label: 'At least 1 number' } : null,
      !rules.hasSpecialChar ? { key: 'hasSpecialChar', label: 'At least 1 special character' } : null
    ].filter(Boolean) as Array<{ key: string; label: string }>;
  }, [formData.password]);

  useEffect(() => {
    setError('');
    setFieldErrors({});
    setIsEmailVerified(false);
    setEmailOtpOpen(false);
    setEmailVerificationCode('');
    setEmailOtpError('');
  }, []);

  useEffect(() => {
    console.log('🔍 Google Sign-In: Initializing...');
    console.log('🔍 Google Client ID:', GOOGLE_CLIENT_ID);
    
    const googleApi = (window as any).google;
    console.log('🔍 Google API available:', !!googleApi);
    console.log('🔍 Google accounts available:', !!googleApi?.accounts);
    console.log('🔍 Google accounts.id available:', !!googleApi?.accounts?.id);
    
    if (!googleApi?.accounts?.id) {
      console.log('❌ Google Sign-In: Google API not loaded yet');
      return;
    }
    
    console.log('✅ Google Sign-In: Initializing Google Identity Services');
    googleApi.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: async (response: any) => {
        try {
          if (googleLoading) return;
          setGoogleLoading(true);
          setError('');
          const res = await googleSignIn(response.credential);
          loginUser(res.token, res.user);
          setPostAuthMessage(res.user.role === 'admin' ? 'Opening admin dashboard...' : 'Opening your dashboard...');
          setPostAuthLoading(true);
          await new Promise((r) => setTimeout(r, 700));
          navigate(res.user.role === 'admin' ? '/admin' : '/dashboard');
        } catch (err: any) {
          if (err?.code === 'NEEDS_OTP') {
            setGoogleOtp({
              email: err.email,
              name: err.suggestedName || '',
              credential: response.credential,
            });
            return;
          }
          setError(err.message || 'Google sign-in failed');
        } finally {
          setGoogleLoading(false);
        }
      },
      auto_select: false,
      cancel_on_tap_outside: false
    });
    setGoogleReady(true);
    console.log('✅ Google Sign-In: Initialization complete');
  }, [navigate]);

  useEffect(() => {
    console.log('🔍 Google Sign-In: Button rendering effect triggered');
    console.log('🔍 Google Ready:', googleReady);
    
    if (!googleReady) {
      console.log('❌ Google Sign-In: Not ready yet');
      return;
    }
    
    const googleApi = (window as any).google;
    const button = document.getElementById('google-register-btn');
    
    console.log('🔍 Google API available for button:', !!googleApi);
    console.log('🔍 Google accounts.id.renderButton available:', !!googleApi?.accounts?.id?.renderButton);
    console.log('🔍 Button element found:', !!button);
    
    if (googleApi?.accounts?.id?.renderButton && button) {
      console.log('✅ Google Sign-In: Rendering button');
      googleApi.accounts.id.renderButton(button, { theme: 'outline', size: 'large', width: 400 });
      console.log('✅ Google Sign-In: Button rendered successfully');
    } else {
      console.log('❌ Google Sign-In: Cannot render button');
      console.log('❌ Missing renderButton:', !googleApi?.accounts?.id?.renderButton);
      console.log('❌ Missing button element:', !button);
    }
  }, [googleReady]);

  useEffect(() => {
    if (!resendSeconds) return;
    const timer = setInterval(() => {
      setResendSeconds((prev: number) => {
        if (prev <= 1) {
          setCanResend(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    
    return () => clearInterval(timer);
  }, [resendSeconds]);

  // Letters, spaces, hyphens, and apostrophes only — covers Filipino names
  // like "María", "O'Brien", "Dela Cruz". Rejects digits + anything else.
  const NAME_RE = /^[A-Za-zÀ-ÿÀ-ſ\s'\-]+$/;

  const validateForm = () => {
    const nextErrors: { [key: string]: string } = {};
    if (!formData.firstName.trim()) nextErrors.firstName = 'First name is required';
    else if (!NAME_RE.test(formData.firstName.trim())) nextErrors.firstName = 'Letters only — no numbers or special characters';
    if (!formData.lastName.trim()) nextErrors.lastName = 'Last name is required';
    else if (!NAME_RE.test(formData.lastName.trim())) nextErrors.lastName = 'Letters only — no numbers or special characters';
    if (!formData.email.trim()) nextErrors.email = 'Email is required';
    else if (!isValidEmail(formData.email)) nextErrors.email = 'Invalid email format';
    if (!formData.contactNumber.trim()) nextErrors.contactNumber = 'Contact number is required';
    else if (!isValidPhone(formData.contactNumber)) nextErrors.contactNumber = 'Please enter a valid Philippine phone number (e.g., +639XXXXXXXXX or 09XXXXXXXXX)';
    if (!formData.password) nextErrors.password = 'Password is required';
    if (!formData.confirmPassword) nextErrors.confirmPassword = 'Confirm password is required';
    if (formData.password && formData.confirmPassword && formData.password !== formData.confirmPassword) {
      nextErrors.confirmPassword = 'Passwords do not match';
    }
    const rules = validatePasswordRules(formData.password);
    if (!rules.minLength || !rules.maxLength || !rules.hasUpperCase || !rules.hasLowerCase || !rules.hasNumber || !rules.hasSpecialChar) {
      nextErrors.password = 'Password does not meet requirements';
    }
    if (!isEmailVerified) nextErrors.emailVerification = 'Email address must be verified via OTP';
    setFieldErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const sendEmailVerification = async () => {
    setEmailOtpError('');
    const email = formData.email.trim();
    if (!email) {
      setEmailOtpError('Email is required');
      return;
    }
    if (!isValidEmail(email)) {
      setEmailOtpError('Please enter a valid email address');
      return;
    }
    try {
      setEmailOtpSending(true);
      await sendOtp(email);
      setEmailOtpOpen(true);
      setCanResend(false);
      setResendSeconds(60);
      setOtpAttempts(0);
      setOtpExpiresAt(new Date(Date.now() + 5 * 60 * 1000));
    } catch (err: any) {
      setEmailOtpError(err.message || 'Failed to send verification email');
    } finally {
      setEmailOtpSending(false);
    }
  };

  const validateEmailVerificationCode = async () => {
    setEmailOtpError('');
    if (!emailVerificationCode.trim()) {
      setEmailOtpError('Verification code is required');
      return;
    }
    if (otpExpiresAt && new Date() > otpExpiresAt) {
      setEmailOtpError('Code expired — please request a new one');
      return;
    }
    try {
      setEmailOtpVerifying(true);
      await verifyOtp(formData.email.trim(), emailVerificationCode.trim());
      setIsEmailVerified(true);
      setEmailOtpOpen(false);
      setEmailVerificationCode('');
    } catch (err: any) {
      setEmailOtpError(err.message || 'Invalid code');
    } finally {
      setEmailOtpVerifying(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!validateForm()) return;
    try {
      if (loading) return;
      setLoading(true);
      const fullName = `${formData.firstName.trim()} ${formData.lastName.trim()}`.trim();
      await register(fullName, formData.email.trim(), formData.password, formData.contactNumber.trim(), 'customer', formData.notificationPreference);
      navigate('/login');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <>
      {/* Post-auth loading overlay */}
      {postAuthLoading && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl bg-white shadow-2xl p-8 text-center">
            <div className="w-12 h-12 mx-auto rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center mb-4">
              <div className="w-6 h-6 border-3 border-white border-t-transparent rounded-full animate-spin" />
            </div>
            <p className="font-bold text-slate-900">Setting up your account…</p>
            <p className="mt-1 text-sm text-slate-500">{postAuthMessage || 'Please wait a moment'}</p>
          </div>
        </div>
      )}

      <AuthLayout
        title="Create your account"
        subtitle="Join CustoMate to design and order personalized products."
        brandHeadline="Start creating in seconds."
        brandSubtext="Sign up and get instant access to the 3D customizer, design history, and order tracking."
        footer={
          <p className="text-center text-sm text-slate-600">
            Already have an account?{' '}
            <Link to="/login" className="font-bold text-blue-600 hover:text-blue-700 hover:underline">
              Sign in
            </Link>
          </p>
        }
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="flex items-start gap-2.5 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <p className="text-sm">{error}</p>
            </div>
          )}

          {/* First & last name in a row */}
          <div className="grid grid-cols-2 gap-3">
            <AuthInput
              label="First name"
              placeholder="John"
              value={formData.firstName}
              onChange={(e) => {
                // Strip digits and anything that isn't a letter / space /
                // hyphen / apostrophe as the user types — no need to wait
                // for blur to show an error.
                const v = e.target.value.replace(/[0-9]/g, '');
                setFormData({ ...formData, firstName: v });
              }}
              required
              disabled={loading || googleLoading}
              icon={<User className="w-4 h-4" />}
              error={fieldErrors.firstName}
              autoComplete="given-name"
            />
            <AuthInput
              label="Last name"
              placeholder="Doe"
              value={formData.lastName}
              onChange={(e) => {
                const v = e.target.value.replace(/[0-9]/g, '');
                setFormData({ ...formData, lastName: v });
              }}
              required
              disabled={loading || googleLoading}
              icon={<User className="w-4 h-4" />}
              error={fieldErrors.lastName}
              autoComplete="family-name"
            />
          </div>

          {/* Email with verify button */}
          <div>
            <label className="block mb-1.5 text-xs font-bold text-slate-700">
              Email address
              {isEmailVerified && (
                <span className="ml-2 inline-flex items-center gap-1 text-emerald-600 font-bold">
                  <CheckCircle2 className="w-3 h-3" /> Verified
                </span>
              )}
            </label>
            <div className="flex gap-2">
              <div className="flex-1">
                <AuthInput
                  type="email"
                  placeholder="you@example.com"
                  value={formData.email}
                  onChange={(e) => {
                    setFormData({ ...formData, email: e.target.value });
                    if (isEmailVerified) setIsEmailVerified(false); // re-verify if email changes
                  }}
                  required
                  disabled={loading || googleLoading || isEmailVerified}
                  icon={<Mail className="w-4 h-4" />}
                  error={fieldErrors.email}
                  autoComplete="email"
                />
              </div>
              <button
                type="button"
                onClick={sendEmailVerification}
                disabled={emailOtpSending || !canResend || isEmailVerified || !formData.email}
                className="shrink-0 px-3 py-3 rounded-xl text-xs font-bold transition-all bg-slate-100 text-slate-700 hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
              >
                {emailOtpSending ? 'Sending…' : isEmailVerified ? '✓ Done' : canResend ? 'Send code' : `Wait ${resendSeconds}s`}
              </button>
            </div>
            {fieldErrors.emailVerification && (
              <p className="mt-1 text-xs text-rose-600 font-medium">{fieldErrors.emailVerification}</p>
            )}
          </div>

          {/* Phone number (contact info — no verification required) */}
          <AuthInput
            label="Phone number"
            placeholder="+639XXXXXXXXX"
            value={formData.contactNumber}
            onChange={(e) => setFormData({ ...formData, contactNumber: e.target.value })}
            required
            disabled={loading || googleLoading}
            icon={<Phone className="w-4 h-4" />}
            error={fieldErrors.contactNumber}
            autoComplete="tel"
          />

          {/* Password */}
          <AuthInput
            label="Password"
            type={showPassword ? 'text' : 'password'}
            placeholder="At least 8 characters"
            value={formData.password}
            onChange={(e) => setFormData({ ...formData, password: e.target.value })}
            required
            disabled={loading || googleLoading}
            icon={<Lock className="w-4 h-4" />}
            error={fieldErrors.password}
            autoComplete="new-password"
            trailing={
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-md hover:bg-slate-50"
                tabIndex={-1}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            }
          />

          {/* Live password requirements */}
          {formData.password && (
            <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
              <p className="text-[11px] font-bold text-slate-600 uppercase tracking-wide mb-2">Password requirements</p>
              <div className="grid grid-cols-2 gap-1.5">
                {[
                  { key: 'minLength', label: '8+ characters' },
                  { key: 'maxLength', label: 'Under 17 chars' },
                  { key: 'hasUpperCase', label: 'Uppercase' },
                  { key: 'hasLowerCase', label: 'Lowercase' },
                  { key: 'hasNumber', label: 'Number' },
                  { key: 'hasSpecialChar', label: 'Symbol' },
                ].map((req) => {
                  const ok = passwordRules[req.key as keyof typeof passwordRules];
                  return (
                    <div
                      key={req.key}
                      className={`flex items-center gap-1.5 text-[11px] font-semibold transition-colors ${
                        ok ? 'text-emerald-600' : 'text-slate-400'
                      }`}
                    >
                      <span
                        className={`w-3.5 h-3.5 rounded-full flex items-center justify-center text-[8px] ${
                          ok ? 'bg-emerald-100' : 'bg-slate-200'
                        }`}
                      >
                        {ok ? '✓' : ''}
                      </span>
                      {req.label}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <AuthInput
            label="Confirm password"
            type={showConfirmPassword ? 'text' : 'password'}
            placeholder="Re-enter your password"
            value={formData.confirmPassword}
            onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
            required
            disabled={loading || googleLoading}
            icon={<Lock className="w-4 h-4" />}
            error={fieldErrors.confirmPassword}
            autoComplete="new-password"
            trailing={
              <button
                type="button"
                onClick={() => setShowConfirmPassword((v) => !v)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-md hover:bg-slate-50"
                tabIndex={-1}
                aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
              >
                {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            }
          />

          <AuthButton
            type="submit"
            loading={loading}
            loadingText="Creating account…"
            disabled={googleLoading || !isEmailVerified}
          >
            Create account
          </AuthButton>

          {!isEmailVerified && (
            <p className="text-[11px] text-slate-500 text-center">
              Verify your email to enable account creation.
            </p>
          )}
        </form>

        <AuthDivider />

        <div className={`flex justify-center ${loading || googleLoading ? 'pointer-events-none opacity-60' : ''}`}>
          <div id="google-register-btn" />
        </div>
      </AuthLayout>

      {/* Email OTP Modal */}
      <Modal
        isOpen={emailOtpOpen}
        onClose={() => setEmailOtpOpen(false)}
        title="Verify your email"
        footer={
          <>
            <Button variant="outline" onClick={() => setEmailOtpOpen(false)}>
              Cancel
            </Button>
            <Button onClick={validateEmailVerificationCode} disabled={emailOtpVerifying}>
              {emailOtpVerifying ? 'Verifying...' : 'Verify'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            We sent a 6-digit verification code to{' '}
            <span className="font-bold text-slate-900">{formData.email}</span>.
            Check your inbox (and spam folder).
          </p>
          <Input
            placeholder="000000"
            value={emailVerificationCode}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmailVerificationCode(e.target.value)}
            maxLength={6}
          />
          {emailOtpError && <p className="text-xs text-rose-600">{emailOtpError}</p>}
          {!canResend && (
            <p className="text-xs text-slate-500">
              Didn't get it? Resend available in {resendSeconds}s
            </p>
          )}
        </div>
      </Modal>

      {/* First-time Google sign-in OTP gate */}
      {googleOtp && (
        <GoogleOtpModal
          isOpen={true}
          email={googleOtp.email}
          name={googleOtp.name}
          credential={googleOtp.credential}
          onClose={() => setGoogleOtp(null)}
          onSuccess={async (token, user) => {
            loginUser(token, user);
            setGoogleOtp(null);
            setPostAuthMessage(user.role === 'admin' ? 'Opening admin dashboard...' : 'Opening your dashboard...');
            setPostAuthLoading(true);
            await new Promise((r) => setTimeout(r, 700));
            navigate(user.role === 'admin' ? '/admin' : '/dashboard');
          }}
        />
      )}
    </>
  );
}

export function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setError('Email is required');
      return;
    }
    if (!isValidEmail(email)) {
      setError('Invalid email format');
      return;
    }

    try {
      setLoading(true);
      setError('');
      // TODO: Implement forgot password API call
      setSuccess(true);
    } catch (err: any) {
      setError(err.message || 'Failed to send reset email');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <AuthLayout
        title="Check your email"
        subtitle="We've sent a password reset link to your inbox."
        brandHeadline="One click away from getting back in."
        brandSubtext="Click the link in your email and you'll be ready to design again in seconds."
      >
        <div className="text-center space-y-6">
          <div className="w-16 h-16 mx-auto rounded-full bg-emerald-100 flex items-center justify-center">
            <CheckCircle2 className="w-8 h-8 text-emerald-600" />
          </div>
          <p className="text-sm text-slate-600">
            We sent a reset link to <span className="font-bold text-slate-900">{email}</span>.
            Check your inbox (and spam folder, just in case).
          </p>
          <Link
            to="/login"
            className="inline-flex items-center justify-center gap-2 w-full px-6 py-3 rounded-xl font-bold text-sm text-white bg-gradient-to-br from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 shadow-lg shadow-blue-200 transition-all hover:-translate-y-0.5"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to sign in
          </Link>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Forgot your password?"
      subtitle="No worries — enter your email and we'll send you a reset link."
      brandHeadline="We've got your back."
      brandSubtext="Recover access to your designs and orders in just a few clicks."
      footer={
        <p className="text-center text-sm text-slate-600">
          Remember your password?{' '}
          <Link to="/login" className="font-bold text-blue-600 hover:text-blue-700 hover:underline">
            Sign in
          </Link>
        </p>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        {error && (
          <div className="flex items-start gap-2.5 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <p className="text-sm">{error}</p>
          </div>
        )}

        <AuthInput
          label="Email address"
          type="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          disabled={loading}
          icon={<Mail className="w-4 h-4" />}
          autoComplete="email"
        />

        <AuthButton type="submit" loading={loading} loadingText="Sending link…">
          Send reset link
        </AuthButton>
      </form>
    </AuthLayout>
  );
}

export function ResetPassword() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [showPwd, setShowPwd] = useState(false);
  const [showConfirmPwd, setShowConfirmPwd] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!password) {
      setError('Password is required');
      return;
    }
    
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    try {
      setLoading(true);
      setError('');
      // TODO: Implement reset password API call
      setSuccess(true);
    } catch (err: any) {
      setError(err.message || 'Failed to reset password');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <AuthLayout
        title="You're all set"
        subtitle="Your password has been reset successfully."
        brandHeadline="Welcome back to creating."
        brandSubtext="Sign in with your new password and pick up where you left off."
      >
        <div className="text-center space-y-6">
          <div className="w-16 h-16 mx-auto rounded-full bg-emerald-100 flex items-center justify-center">
            <CheckCircle2 className="w-8 h-8 text-emerald-600" />
          </div>
          <p className="text-sm text-slate-600">
            Your password is updated. You can now sign in with your new credentials.
          </p>
          <Link
            to="/login"
            className="inline-flex items-center justify-center gap-2 w-full px-6 py-3 rounded-xl font-bold text-sm text-white bg-gradient-to-br from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 shadow-lg shadow-blue-200 transition-all hover:-translate-y-0.5"
          >
            Continue to sign in
          </Link>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Set a new password"
      subtitle="Choose a strong password — at least 8 characters with a mix of letters, numbers, and symbols."
      brandHeadline="Almost there."
      brandSubtext="Set a new password and you'll be back to designing in no time."
      footer={
        <p className="text-center text-sm text-slate-600">
          <Link to="/login" className="font-bold text-blue-600 hover:text-blue-700 hover:underline inline-flex items-center gap-1">
            <ArrowLeft className="w-3 h-3" /> Back to sign in
          </Link>
        </p>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        {error && (
          <div className="flex items-start gap-2.5 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <p className="text-sm">{error}</p>
          </div>
        )}

        <AuthInput
          label="New password"
          type={showPwd ? 'text' : 'password'}
          placeholder="At least 8 characters"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          disabled={loading}
          icon={<Lock className="w-4 h-4" />}
          autoComplete="new-password"
          trailing={
            <button type="button" onClick={() => setShowPwd((v) => !v)} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-md hover:bg-slate-50" tabIndex={-1} aria-label={showPwd ? 'Hide password' : 'Show password'}>
              {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          }
        />

        <AuthInput
          label="Confirm new password"
          type={showConfirmPwd ? 'text' : 'password'}
          placeholder="Re-enter your password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          required
          disabled={loading}
          icon={<Lock className="w-4 h-4" />}
          autoComplete="new-password"
          trailing={
            <button type="button" onClick={() => setShowConfirmPwd((v) => !v)} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-md hover:bg-slate-50" tabIndex={-1} aria-label={showConfirmPwd ? 'Hide password' : 'Show password'}>
              {showConfirmPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          }
        />

        <AuthButton type="submit" loading={loading} loadingText="Resetting…">
          Reset password
        </AuthButton>
      </form>
    </AuthLayout>
  );
}
