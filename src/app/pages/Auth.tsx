import React, { useEffect, useMemo, useState } from 'react';
import { login, register, googleSignIn, sendOtp, verifyOtp, sendPhoneOtp, verifyPhoneOtp, guestLogin } from '../api';
import { useNavigate } from 'react-router-dom';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { Card, CardHeader, CardTitle, CardContent } from '../components/Card';
import { Modal } from '../components/Modal';
import { useAuth } from '../hooks/useAuth';

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
  const [postAuthLoading, setPostAuthLoading] = useState(false);
  const [postAuthMessage, setPostAuthMessage] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const [isLocked, setIsLocked] = useState(false);
  const [lockoutTime, setLockoutTime] = useState(0);
  const [remainingSeconds, setRemainingSeconds] = useState(0);

  const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

  const formatTime = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  const redirectWithAnimation = async (role: string) => {
    setPostAuthMessage(
      role === 'admin' ? 'Opening admin dashboard...' :
      role === 'guest' ? 'Entering guest mode...' :
      'Opening your dashboard...'
    );
    setPostAuthLoading(true);
    await delay(700);
    if (role === 'admin') {
      navigate('/admin');
    } else if (role === 'guest') {
      navigate('/');
    } else {
      navigate('/dashboard');
    }
  };

  useEffect(() => {
    setEmail('');
    setPassword('');
    setError('');
    setFieldErrors({});
    setIsLocked(false);
    setRemainingSeconds(0);
  }, []);

  useEffect(() => {
    if (!isLocked || remainingSeconds <= 0) return;
    
    const timer = setInterval(() => {
      setRemainingSeconds((prev) => {
        if (prev <= 1) {
          setIsLocked(false);
          setLockoutTime(0);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    
    return () => clearInterval(timer);
  }, [isLocked, remainingSeconds]);

  useEffect(() => {
    const googleApi = (window as any).google;
    if (!googleApi?.accounts?.id) return;
    googleApi.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: async (response: any) => {
        try {
          if (googleLoading) return;
          setGoogleLoading(true);
          const res = await googleSignIn(response.credential);
          loginUser(res.token, res.user);
          await redirectWithAnimation(res.user.role);
        } catch (err: any) {
          setError(err.message || 'Google sign-in failed');
        } finally {
          setGoogleLoading(false);
        }
      },
      auto_select: false,
      cancel_on_tap_outside: false
    });
    setGoogleReady(true);
  }, [navigate]);

  useEffect(() => {
    if (!googleReady) return;
    const googleApi = (window as any).google;
    const button = document.getElementById('google-login-btn');
    if (googleApi?.accounts?.id?.renderButton && button) {
      googleApi.accounts.id.renderButton(button, { theme: 'outline', size: 'large', width: 400 });
    }
  }, [googleReady]);

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
      await redirectWithAnimation(res.user.role);
    } catch (err: any) {
      if (err.locked) {
        setIsLocked(true);
        setLockoutTime(err.lockedUntil);
        setRemainingSeconds(err.remainingSeconds);
        setError(err.message);
      } else {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      {postAuthLoading && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/70 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-gray-200 bg-white shadow-xl p-6 text-center">
            <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="mt-4 font-semibold text-gray-900">Logging you in...</p>
            <p className="mt-1 text-sm text-gray-600">{postAuthMessage || 'Please wait a moment'}</p>
          </div>
        </div>
      )}
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-center">Login to CustoMate</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="text-red-600 text-sm text-center">
                {isLocked ? (
                  <div>
                    <p>{error}</p>
                    <p className="font-semibold mt-1">
                      Time remaining: {formatTime(remainingSeconds)}
                    </p>
                  </div>
                ) : (
                  error
                )}
              </div>
            )}
            <Input
              type="email"
              label="Email"
              placeholder="your@email.com"
              value={email}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
              required
              disabled={loading || googleLoading || isLocked}
            />
            {fieldErrors.email && <p className="text-xs text-red-600">{fieldErrors.email}</p>}
            <Input
              type="password"
              label="Password"
              placeholder="••••••••"
              value={password}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
              required
              disabled={loading || googleLoading || isLocked}
            />
            {fieldErrors.password && <p className="text-xs text-red-600">{fieldErrors.password}</p>}
            <div className="flex justify-end">
              <a href="/forgot-password" className="text-sm text-blue-600 hover:underline">
                Forgot password?
              </a>
            </div>
            <Button type="submit" className="w-full" disabled={loading || googleLoading || isLocked}>
              {loading ? 'Signing In...' : isLocked ? `Locked (${formatTime(remainingSeconds)})` : 'Sign In'}
            </Button>
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-300" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-white text-gray-500">Or continue with</span>
              </div>
            </div>
            <div className={`flex justify-center ${loading || googleLoading ? 'pointer-events-none opacity-60' : ''}`}>
              <div id="google-login-btn" />
            </div>
            <p className="text-center text-sm text-gray-600">
              Don't have an account?{' '}
              <a href="/register" className="text-blue-600 hover:underline">
                Register
              </a>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
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
  const [isPhoneVerified, setIsPhoneVerified] = useState(false);
  const [isOtpOpen, setIsOtpOpen] = useState(false);
  const [verificationCode, setVerificationCode] = useState('');
  const [otpError, setOtpError] = useState('');
  const [phoneOtpOpen, setPhoneOtpOpen] = useState(false);
  const [phoneVerificationCode, setPhoneVerificationCode] = useState('');
  const [phoneOtpError, setPhoneOtpError] = useState('');
  const [phoneOtpSending, setPhoneOtpSending] = useState(false);
  const [phoneOtpVerifying, setPhoneOtpVerifying] = useState(false);
  const [otpAttempts, setOtpAttempts] = useState(0);
  const [otpExpiresAt, setOtpExpiresAt] = useState<Date | null>(null);
  const [canResend, setCanResend] = useState(true);
  const [resendSeconds, setResendSeconds] = useState(0);
  const [otpSending, setOtpSending] = useState(false);
  const [otpVerifying, setOtpVerifying] = useState(false);
  const [postAuthLoading, setPostAuthLoading] = useState(false);
  const [postAuthMessage, setPostAuthMessage] = useState('');

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
    setIsPhoneVerified(false);
    setPhoneOtpOpen(false);
    setPhoneVerificationCode('');
    setPhoneOtpError('');
  }, []);

  useEffect(() => {
    const googleApi = (window as any).google;
    if (!googleApi?.accounts?.id) return;
    googleApi.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: async (response: any) => {
        try {
          if (googleLoading) return;
          setGoogleLoading(true);
          const res = await googleSignIn(response.credential);
          loginUser(res.token, res.user);
          setPostAuthMessage(res.user.role === 'admin' ? 'Opening admin dashboard...' : 'Opening your dashboard...');
          setPostAuthLoading(true);
          await new Promise((r) => setTimeout(r, 700));
          navigate(res.user.role === 'admin' ? '/admin' : '/dashboard');
        } catch (err: any) {
          setError(err.message || 'Google sign-in failed');
        } finally {
          setGoogleLoading(false);
        }
      },
      auto_select: false,
      cancel_on_tap_outside: false
    });
    setGoogleReady(true);
  }, [navigate]);

  useEffect(() => {
    if (!googleReady) return;
    const googleApi = (window as any).google;
    const button = document.getElementById('google-register-btn');
    if (googleApi?.accounts?.id?.renderButton && button) {
      googleApi.accounts.id.renderButton(button, { theme: 'outline', size: 'large', width: 400 });
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

  const isValidName = (name: string) => /^[a-zA-Z\s]+$/.test(name);

  const validateForm = () => {
    const nextErrors: { [key: string]: string } = {};
    if (!formData.firstName.trim()) nextErrors.firstName = 'First name is required';
    else if (!isValidName(formData.firstName)) nextErrors.firstName = 'First name can only contain letters';
    if (!formData.lastName.trim()) nextErrors.lastName = 'Last name is required';
    else if (!isValidName(formData.lastName)) nextErrors.lastName = 'Last name can only contain letters';
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
    if (!isEmailVerified) nextErrors.emailVerification = 'Email must be verified';
    if (!isPhoneVerified) nextErrors.phoneVerification = 'Contact number must be verified';
    setFieldErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const sendPhoneVerification = async () => {
    setPhoneOtpError('');
    const phone = formData.contactNumber.trim();
    if (!phone) {
      setPhoneOtpError('Contact number is required');
      return;
    }
    if (!isValidPhone(phone)) {
      setPhoneOtpError('Please enter a valid Philippine phone number (e.g., +639XXXXXXXXX or 09XXXXXXXXX)');
      return;
    }
    try {
      setPhoneOtpSending(true);
      const res = await sendPhoneOtp(phone);
      setPhoneOtpOpen(true);
      setIsPhoneVerified(false);
      if (res?.code) {
        setPhoneOtpError(`Dev OTP: ${res.code}`);
      }
    } catch (err: any) {
      setPhoneOtpError(err.message || 'Failed to send OTP');
    } finally {
      setPhoneOtpSending(false);
    }
  };

  const validatePhoneVerificationCode = async () => {
    setPhoneOtpError('');
    const phone = formData.contactNumber.trim();
    if (!phone) {
      setPhoneOtpError('Contact number is required');
      return;
    }
    if (!phoneVerificationCode.trim()) {
      setPhoneOtpError('Verification code is required');
      return;
    }
    try {
      setPhoneOtpVerifying(true);
      await verifyPhoneOtp(phone, phoneVerificationCode.trim());
      setIsPhoneVerified(true);
      setPhoneOtpOpen(false);
      setPhoneVerificationCode('');
    } catch (err: any) {
      setPhoneOtpError(err.message || 'Invalid code');
    } finally {
      setPhoneOtpVerifying(false);
    }
  };

  const sendVerificationEmail = async () => {
    setOtpError('');
    if (!formData.email.trim()) {
      setOtpError('Email is required');
      return;
    }
    if (!isValidEmail(formData.email)) {
      setOtpError('Invalid email format');
      return;
    }
    if (!canResend) return;
    try {
      setOtpSending(true);
      await sendOtp(formData.email.trim());
      setIsOtpOpen(true);
      setCanResend(false);
      setResendSeconds(60);
      setOtpAttempts(0);
      setOtpExpiresAt(new Date(Date.now() + 5 * 60 * 1000));
    } catch (err: any) {
      setOtpError(err.message || 'Failed to send OTP');
    } finally {
      setOtpSending(false);
    }
  };

  const validateVerificationCode = async () => {
    setOtpError('');
    if (!verificationCode.trim()) {
      setOtpError('Verification code is required');
      return;
    }
    if (otpExpiresAt && new Date() > otpExpiresAt) {
      setOtpError('OTP expired');
      return;
    }
    if (otpAttempts >= 3) {
      setOtpError('Too many attempts');
      setIsOtpOpen(false);
      return;
    }
    try {
      setOtpVerifying(true);
      await verifyOtp(formData.email.trim(), verificationCode.trim());
      setIsEmailVerified(true);
      setIsOtpOpen(false);
      setVerificationCode('');
    } catch (err: any) {
      const nextAttempts = otpAttempts + 1;
      setOtpAttempts(nextAttempts);
      if (nextAttempts >= 3) {
        setOtpError('Too many attempts');
        setIsOtpOpen(false);
      } else {
        setOtpError(err.message || 'Invalid code');
      }
    } finally {
      setOtpVerifying(false);
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
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      {postAuthLoading && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/70 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-gray-200 bg-white shadow-xl p-6 text-center">
            <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="mt-4 font-semibold text-gray-900">Logging you in...</p>
            <p className="mt-1 text-sm text-gray-600">{postAuthMessage || 'Please wait a moment'}</p>
          </div>
        </div>
      )}
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-center">Create Account</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && <div className="text-red-600 text-sm text-center">{error}</div>}
            <Input
              label="First Name"
              placeholder="John"
              value={formData.firstName}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, firstName: e.target.value })}
              required
              disabled={loading || googleLoading}
            />
            {fieldErrors.firstName && <p className="text-xs text-red-600">{fieldErrors.firstName}</p>}
            <Input
              label="Last Name"
              placeholder="Doe"
              value={formData.lastName}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, lastName: e.target.value })}
              required
              disabled={loading || googleLoading}
            />
            {fieldErrors.lastName && <p className="text-xs text-red-600">{fieldErrors.lastName}</p>}
            <Input
              type="email"
              label="Email"
              placeholder="your@email.com"
              value={formData.email}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, email: e.target.value })}
              required
              disabled={loading || googleLoading}
            />
            {fieldErrors.email && <p className="text-xs text-red-600">{fieldErrors.email}</p>}
            <Input
              label="Contact Number"
              placeholder="+639XXXXXXXXX or 09XXXXXXXXX"
              value={formData.contactNumber}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, contactNumber: e.target.value })}
              required
              disabled={loading || googleLoading}
            />
            {fieldErrors.contactNumber && <p className="text-xs text-red-600">{fieldErrors.contactNumber}</p>}
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" onClick={sendPhoneVerification} disabled={phoneOtpSending}>
                {phoneOtpSending ? 'Sending...' : 'Send Phone OTP'}
              </Button>
              {isPhoneVerified && <span className="text-xs text-green-600">Phone verified</span>}
            </div>
            {fieldErrors.phoneVerification && <p className="text-xs text-red-600">{fieldErrors.phoneVerification}</p>}
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" onClick={sendVerificationEmail} disabled={otpSending || !canResend}>
                {otpSending ? 'Sending...' : canResend ? 'Send OTP' : `Resend in ${resendSeconds}s`}
              </Button>
              {isEmailVerified && <span className="text-xs text-green-600">Email verified</span>}
            </div>
            {fieldErrors.emailVerification && <p className="text-xs text-red-600">{fieldErrors.emailVerification}</p>}
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">Notification Preference</label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="notificationPreference"
                    value="email"
                    checked={formData.notificationPreference === 'email'}
                    onChange={(e) => setFormData({ ...formData, notificationPreference: e.target.value as 'sms' | 'email' })}
                    disabled={loading || googleLoading}
                  />
                  Email
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="notificationPreference"
                    value="sms"
                    checked={formData.notificationPreference === 'sms'}
                    onChange={(e) => setFormData({ ...formData, notificationPreference: e.target.value as 'sms' | 'email' })}
                    disabled={loading || googleLoading}
                  />
                  SMS
                </label>
              </div>
            </div>
            <Input
              type="password"
              label="Password"
              placeholder="••••••••"
              value={formData.password}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, password: e.target.value })}
              required
              disabled={loading || googleLoading}
            />
            {fieldErrors.password && <p className="text-xs text-red-600">{fieldErrors.password}</p>}
            {!!unmetPasswordRequirements.length && (
              <div className="text-xs text-gray-600 space-y-1">
                {unmetPasswordRequirements.map((req) => (
                  <p key={req.key}>• {req.label}</p>
                ))}
              </div>
            )}
            <Input
              type="password"
              label="Confirm Password"
              placeholder="••••••••"
              value={formData.confirmPassword}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, confirmPassword: e.target.value })}
              required
              disabled={loading || googleLoading}
            />
            {fieldErrors.confirmPassword && <p className="text-xs text-red-600">{fieldErrors.confirmPassword}</p>}
            <Button type="submit" className="w-full" disabled={loading || googleLoading}>
              {loading ? 'Creating...' : 'Create Account'}
            </Button>
            <div className="relative text-center text-xs text-gray-500">
              <span className="bg-white px-2">or</span>
              <div className="absolute left-0 right-0 top-1/2 border-t border-gray-200 -z-10" />
            </div>
            <div className={`flex justify-center ${loading || googleLoading ? 'pointer-events-none opacity-60' : ''}`}>
              <div id="google-register-btn" />
            </div>
            <p className="text-center text-sm text-gray-600">
              Already have an account?{' '}
              <a href="/login" className="text-blue-600 hover:underline">
                Login
              </a>
            </p>
          </form>
        </CardContent>
      </Card>
      <Modal
        isOpen={isOtpOpen}
        onClose={() => setIsOtpOpen(false)}
        title="Verify your email"
        footer={
          <>
            <Button variant="outline" onClick={() => setIsOtpOpen(false)}>Cancel</Button>
            <Button onClick={validateVerificationCode} disabled={otpVerifying}>
              {otpVerifying ? 'Verifying...' : 'Verify'}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-gray-600">Enter the 6-digit code sent to {formData.email}</p>
          <Input
            label="Verification Code"
            placeholder="123456"
            value={verificationCode}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setVerificationCode(e.target.value)}
          />
          {otpError && <p className="text-xs text-red-600">{otpError}</p>}
          {otpExpiresAt && <p className="text-xs text-gray-500">Expires at: {otpExpiresAt.toLocaleTimeString()}</p>}
        </div>
      </Modal>

      <Modal
        isOpen={phoneOtpOpen}
        onClose={() => setPhoneOtpOpen(false)}
        title="Verify your contact number"
        footer={
          <>
            <Button variant="outline" onClick={() => setPhoneOtpOpen(false)}>Cancel</Button>
            <Button onClick={validatePhoneVerificationCode} disabled={phoneOtpVerifying}>
              {phoneOtpVerifying ? 'Verifying...' : 'Verify'}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-gray-600">Enter the 6-digit code sent to {formData.contactNumber}</p>
          <Input
            label="Verification Code"
            placeholder="123456"
            value={phoneVerificationCode}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPhoneVerificationCode(e.target.value)}
          />
          {phoneOtpError && <p className="text-xs text-red-600">{phoneOtpError}</p>}
        </div>
      </Modal>
    </div>
  );
}

export function ForgotPassword() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setError('Email is required');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await fetch(`${API_URL}/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      setSuccess(true);
    } catch (err: any) {
      setError(err.message || 'Failed to send reset link');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-center text-2xl">Reset Password</CardTitle>
        </CardHeader>
        <CardContent>
          {success ? (
            <div className="text-center space-y-4">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-gray-700">If an account with <strong>{email}</strong> exists, we've sent a password reset link to your email.</p>
              <p className="text-sm text-gray-500">Please check your inbox and spam folder.</p>
              <Button onClick={() => navigate('/login')} className="w-full">
                Back to Login
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && <p className="text-sm text-red-600 bg-red-50 p-3 rounded">{error}</p>}
              <p className="text-sm text-gray-600">
                Enter your email address and we'll send you a link to reset your password.
              </p>
              <Input
                type="email"
                label="Email Address"
                placeholder="you@example.com"
                value={email}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
                required
                disabled={loading}
              />
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? 'Sending...' : 'Send Reset Link'}
              </Button>
              <p className="text-center text-sm text-gray-600">
                Remember your password?{' '}
                <a href="/login" className="text-blue-600 hover:underline">
                  Sign in
                </a>
              </p>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export function ResetPassword() {
  const navigate = useNavigate();
  const [token, setToken] = useState('');
  
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get('token');
    if (t) setToken(t);
  }, []);
  
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!token) {
      setError('Invalid or missing reset token');
    }
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await fetch(`${API_URL}/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newPassword: password })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      setSuccess(true);
    } catch (err: any) {
      setError(err.message || 'Failed to reset password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-center text-2xl">Create New Password</CardTitle>
        </CardHeader>
        <CardContent>
          {success ? (
            <div className="text-center space-y-4">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-gray-700">Your password has been reset successfully!</p>
              <Button onClick={() => navigate('/login')} className="w-full">
                Sign In
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && <p className="text-sm text-red-600 bg-red-50 p-3 rounded">{error}</p>}
              <Input
                type="password"
                label="New Password"
                placeholder="••••••••"
                value={password}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
                required
                disabled={loading}
              />
              <Input
                type="password"
                label="Confirm Password"
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setConfirmPassword(e.target.value)}
                required
                disabled={loading}
              />
              <p className="text-xs text-gray-500">Password must be at least 8 characters</p>
              <Button type="submit" className="w-full" disabled={loading || !token}>
                {loading ? 'Resetting...' : 'Reset Password'}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
