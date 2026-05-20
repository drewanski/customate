import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';
import nodemailer from 'nodemailer';
import axios from 'axios';
import User from '../models/User.js';
import EmailOtp from '../models/EmailOtp.js';
import PhoneOtp from '../models/PhoneOtp.js';

const router = express.Router();
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

/**
 * Send SMS via Semaphore API
 * Uses phone number as sender if no sender name is approved
 */
async function sendSemaphoreSMS(phoneNumber, message) {
  const apiKey = process.env.SEMAPHORE_API_KEY;
  const senderName = process.env.SEMAPHORE_SENDER_NAME;
  
  if (!apiKey) {
    throw new Error('Semaphore API key not configured');
  }

  // Clean phone number - remove + and any non-digit characters
  const cleanPhone = phoneNumber.replace(/\D/g, '');
  
  // Build payload
  const payload = {
    apikey: apiKey,
    number: cleanPhone,
    message: message
  };
  
  // Only add sendername if explicitly configured and approved
  if (senderName && senderName.trim()) {
    payload.sendername = senderName.trim();
  }
  
  try {
    console.log('Sending SMS via Semaphore to:', cleanPhone);
    const response = await axios.post('https://api.semaphore.co/api/v4/messages', payload);
    
    console.log('✅ Semaphore SMS sent successfully:', response.data);
    return response.data;
  } catch (error) {
    console.error('❌ Semaphore API error:', error.response?.data || error.message);
    throw error;
  }
}

// Test Google Client initialization
console.log('Google Client initialized with ID:', process.env.GOOGLE_CLIENT_ID);

const OTP_EXPIRY_MINUTES = 5;
const OTP_MAX_ATTEMPTS = 3;

const LOGIN_MAX_ATTEMPTS = 5;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_LOCK_MS = 15 * 60 * 1000;

const loginAttemptStore = new Map();

function getLoginAttemptKey(req, email) {
  const ip = (req.headers['x-forwarded-for'] || req.ip || '').toString().split(',')[0].trim();
  const normalizedEmail = (email || '').toString().trim().toLowerCase();
  return `${ip}::${normalizedEmail}`;
}

function getAttemptRecord(key) {
  const now = Date.now();
  const rec = loginAttemptStore.get(key);
  if (!rec) return { attempts: 0, firstAttemptAt: now, lockedUntil: 0 };

  if (rec.firstAttemptAt && now - rec.firstAttemptAt > LOGIN_WINDOW_MS) {
    loginAttemptStore.delete(key);
    return { attempts: 0, firstAttemptAt: now, lockedUntil: 0 };
  }
  return rec;
}

function setAttemptRecord(key, rec) {
  loginAttemptStore.set(key, rec);
}

/**
 * Register a new customer account.
 *
 * Email OTP is the source of truth for identity verification. The frontend
 * must have already called /api/auth/otp/send and /api/auth/otp/verify so
 * that an EmailOtp record exists with `verified === true` for the email
 * about to be registered. Without that, registration is rejected.
 *
 * Contact number is collected for delivery / SMS notifications but is NOT
 * verified — it can be updated later from the profile page.
 *
 * After registration the EmailOtp record is consumed (deleted) so the same
 * code cannot be replayed for another account.
 */
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, contactNumber, role, notificationPreference } = req.body;

    // Field validation
    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Name, email, and password are required' });
    }
    const normalizedEmail = String(email).trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      return res.status(400).json({ message: 'Please enter a valid email address' });
    }
    if (String(password).length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters' });
    }

    // Optional contact number — kept for delivery / notifications only, NOT verified
    const phone = (contactNumber || '').trim();
    if (phone && !/^(\+639|09)\d{9}$/.test(phone)) {
      return res.status(400).json({
        message: 'Please enter a valid Philippine phone number (e.g., +639XXXXXXXXX or 09XXXXXXXXX)',
      });
    }

    // EMAIL OTP VERIFICATION REQUIRED — frontend must complete /otp/send + /otp/verify
    // before posting here. The verified flag is set on EmailOtp by /otp/verify.
    const otpRecord = await EmailOtp.findOne({ email: normalizedEmail });
    if (!otpRecord || !otpRecord.verified) {
      return res.status(400).json({
        message: 'Email must be verified via OTP before creating an account',
        requiresOtp: true,
      });
    }

    // Uniqueness check (case-insensitive)
    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      return res.status(400).json({ message: 'An account with this email already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({
      name: String(name).trim(),
      email: normalizedEmail,
      password: hashedPassword,
      contactNumber: phone,
      role: role === 'admin' ? 'customer' : (role || 'customer'), // never allow client to self-elevate
      notificationPreference:
        notificationPreference === 'sms' && phone ? 'sms' : 'email',
      isEmailVerified: true,
    });
    await user.save();

    // Consume the OTP — prevents replay for a second account or other actions
    await EmailOtp.deleteOne({ _id: otpRecord._id });

    console.log('✅ User registered with verified email:', normalizedEmail);
    res.status(201).json({ message: 'User registered successfully' });
  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Guest login
router.post('/guest', async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ message: 'Guest name is required' });
    }
    const guestId = 'guest_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    const guest = new User({
      name: name.trim(),
      email: `${guestId}@guest.local`,
      contactNumber: '+639000000000',
      role: 'guest',
      notificationPreference: 'email'
    });
    await guest.save();
    const token = jwt.sign({ userId: guest._id, role: 'guest' }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: guest._id, name: guest.name, email: guest.email, role: 'guest' } });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/phone-otp/send', async (req, res) => {
  try {
    const { contactNumber } = req.body;

    if (!contactNumber || typeof contactNumber !== 'string' || !contactNumber.trim()) {
      return res.status(400).json({ message: 'Contact number is required' });
    }

    const normalized = contactNumber.trim();
    if (!/^(\+639|09)\d{9}$/.test(normalized)) {
      return res.status(400).json({ message: 'Please enter a valid Philippine phone number (e.g., +639XXXXXXXXX or 09XXXXXXXXX)' });
    }

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

    const record = await PhoneOtp.findOneAndUpdate(
      { contactNumber: normalized },
      { code, expiresAt, attempts: 0, verified: false },
      { upsert: true, new: true }
    );

    const payload = { message: 'OTP sent' };
    if (process.env.NODE_ENV !== 'production') {
      payload.code = record.code;
      payload.expiresAt = record.expiresAt;
    }
    res.json(payload);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/phone-otp/verify', async (req, res) => {
  try {
    const { contactNumber, code } = req.body;
    if (!contactNumber || !code) {
      return res.status(400).json({ message: 'Contact number and code are required' });
    }

    const normalized = String(contactNumber).trim();
    const record = await PhoneOtp.findOne({ contactNumber: normalized });
    if (!record) return res.status(400).json({ message: 'OTP not found' });
    if (record.verified) return res.json({ message: 'Already verified' });
    if (record.attempts >= OTP_MAX_ATTEMPTS) {
      return res.status(400).json({ message: 'Too many attempts' });
    }
    if (new Date() > record.expiresAt) {
      return res.status(400).json({ message: 'OTP expired' });
    }
    if (record.code !== String(code).trim()) {
      record.attempts += 1;
      await record.save();
      return res.status(400).json({ message: 'Invalid code' });
    }

    record.verified = true;
    await record.save();
    res.json({ message: 'OTP verified' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * Send a 6-digit email OTP.
 *
 * The OTP record is upserted BEFORE attempting SMTP delivery so the code
 * is queryable even if mail fails — important in dev where SMTP creds may
 * be invalid. In production, an SMTP failure returns 500 so the client
 * surfaces the error and prompts the user to retry. In dev, we additionally
 * return the code in the response body so the registration flow can be
 * tested without a working mailbox.
 */
router.post('/otp/send', async (req, res) => {
  try {
    const rawEmail = req.body?.email;
    if (!rawEmail || typeof rawEmail !== 'string') {
      return res.status(400).json({ message: 'Email is required' });
    }
    const email = rawEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ message: 'Please enter a valid email address' });
    }

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

    // Persist BEFORE attempting mail so a misconfigured SMTP doesn't block us.
    const record = await EmailOtp.findOneAndUpdate(
      { email },
      { code, expiresAt, attempts: 0, verified: false },
      { upsert: true, new: true }
    );

    let mailSent = false;
    let mailError = null;
    if (process.env.SMTP_USER && process.env.SMTP_PASS) {
      try {
        // Explicit timeouts so a flaky Gmail handshake fails in seconds
        // instead of hanging the whole request behind nodemailer's generous
        // ~2 min defaults (which is what makes the UI stick on "Sending...").
        const otpTransport = nodemailer.createTransport({
          service: 'gmail',
          auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
          },
          connectionTimeout: 8000,  // 8 s to open TCP socket
          greetingTimeout: 8000,    // 8 s for SMTP greeting
          socketTimeout: 12000,     // 12 s for the whole conversation
        });

        // Race the sendMail against a hard timeout so even if the underlying
        // socket misbehaves we still resolve in <15 s. Gmail's worst-case
        // delivery is single-digit seconds, so anything beyond this is a
        // network issue worth surfacing rather than waiting on.
        const sendPromise = otpTransport.sendMail({
          from: process.env.SMTP_FROM || process.env.SMTP_USER,
          to: email,
          subject: 'Your CustoMate verification code',
          text: `Your verification code is ${code}. It expires in ${OTP_EXPIRY_MINUTES} minutes.`,
          html: `
            <div style="font-family: system-ui, -apple-system, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
              <h2 style="color: #1e293b; margin: 0 0 8px;">Verify your email</h2>
              <p style="color: #475569; margin: 0 0 16px;">Use this code to finish signing up for CustoMate:</p>
              <div style="font-family: monospace; font-size: 32px; letter-spacing: 8px; font-weight: 800; color: #2563eb; background: #f1f5f9; padding: 16px; border-radius: 12px; text-align: center; margin: 16px 0;">
                ${code}
              </div>
              <p style="color: #94a3b8; font-size: 13px;">Expires in ${OTP_EXPIRY_MINUTES} minutes. If you didn't request this, ignore the email.</p>
            </div>
          `,
        });
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('SMTP send timed out after 15s')), 15000),
        );
        await Promise.race([sendPromise, timeoutPromise]);
        mailSent = true;
      } catch (err) {
        mailError = err;
        console.error('OTP mail send failed:', err.message);
      }
    } else {
      mailError = new Error('SMTP credentials missing on server');
      console.error('OTP send aborted: SMTP_USER or SMTP_PASS not set');
    }

    // In production, a failed mail is a hard error — the user needs to know.
    if (!mailSent && process.env.NODE_ENV === 'production') {
      return res.status(503).json({
        message: 'Verification email could not be sent right now. Please try again in a moment.',
        // Surface the underlying reason so it shows in browser DevTools when
        // the admin (us) is debugging a stuck signup.
        debug: mailError?.message || 'unknown SMTP failure',
      });
    }

    const payload = { message: 'OTP sent', expiresAt: record.expiresAt };
    if (process.env.NODE_ENV !== 'production') {
      // Dev convenience: surface the code so flows are testable without SMTP.
      payload.devCode = record.code;
      payload.mailSent = mailSent;
      if (mailError) payload.mailError = mailError.message;
    }
    res.json(payload);
  } catch (err) {
    console.error('OTP send error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * Verify a 6-digit email OTP. On success, marks the EmailOtp record
 * `verified: true` so /register and /google (confirmCreate) will accept it.
 *
 * Tracks failed attempts (max 3) and rejects expired codes. Email is
 * normalized to lowercase to match /otp/send.
 */
router.post('/otp/verify', async (req, res) => {
  try {
    const rawEmail = req.body?.email;
    const rawCode = req.body?.code;
    if (!rawEmail || !rawCode) {
      return res.status(400).json({ message: 'Email and code are required' });
    }
    const email = String(rawEmail).trim().toLowerCase();
    const code = String(rawCode).trim();

    const record = await EmailOtp.findOne({ email });
    if (!record) return res.status(400).json({ message: 'OTP not found — request a new code' });
    if (record.verified) return res.json({ message: 'Already verified' });
    if (record.attempts >= OTP_MAX_ATTEMPTS) {
      return res.status(400).json({ message: 'Too many attempts — request a new code' });
    }
    if (new Date() > record.expiresAt) {
      return res.status(400).json({ message: 'Code expired — request a new one' });
    }
    if (record.code !== code) {
      record.attempts += 1;
      await record.save();
      return res.status(400).json({
        message: 'Invalid code',
        attemptsRemaining: Math.max(0, OTP_MAX_ATTEMPTS - record.attempts),
      });
    }

    record.verified = true;
    await record.save();
    res.json({ message: 'OTP verified' });
  } catch (err) {
    console.error('OTP verify error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const attemptKey = getLoginAttemptKey(req, email);
    const attemptRec = getAttemptRecord(attemptKey);
    const now = Date.now();
    if (attemptRec.lockedUntil && now < attemptRec.lockedUntil) {
      const seconds = Math.max(1, Math.ceil((attemptRec.lockedUntil - now) / 1000));
      const lockedAt = attemptRec.lockedUntil - LOGIN_LOCK_MS;
      return res.status(429).json({ 
        message: `Too many login attempts. Try again in ${seconds}s.`,
        locked: true,
        lockedUntil: attemptRec.lockedUntil,
        lockDuration: LOGIN_LOCK_MS,
        remainingSeconds: seconds
      });
    }

    const user = await User.findOne({ email });

    if (!user || !user.password) {
      const next = {
        attempts: (attemptRec.attempts || 0) + 1,
        firstAttemptAt: attemptRec.firstAttemptAt || now,
        lockedUntil: 0
      };
      if (next.attempts >= LOGIN_MAX_ATTEMPTS) {
        next.lockedUntil = now + LOGIN_LOCK_MS;
      }
      setAttemptRecord(attemptKey, next);
      return res.status(400).json({
        message: !user ? 'Invalid credentials' : 'Use Google sign-in for this account'
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      const next = {
        attempts: (attemptRec.attempts || 0) + 1,
        firstAttemptAt: attemptRec.firstAttemptAt || now,
        lockedUntil: 0
      };
      if (next.attempts >= LOGIN_MAX_ATTEMPTS) {
        next.lockedUntil = now + LOGIN_LOCK_MS;
      }
      setAttemptRecord(attemptKey, next);
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    loginAttemptStore.delete(attemptKey);
    const token = jwt.sign({ userId: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '1d' });
    res.json({ token, user: { id: user._id, name: user.name, email: user.email, role: user.role } });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Dev-only diagnostic endpoints. In production these are 404'd to avoid
// leaking config status, secret presence, or Google Client ID to attackers
// who scrape API surfaces looking for misconfigured deployments.
if (process.env.NODE_ENV !== 'production') {
  router.get('/test-google', async (req, res) => {
    try {
      const testResult = {
        clientInitialized: !!googleClient,
        clientIdSet: !!process.env.GOOGLE_CLIENT_ID,
        clientId: process.env.GOOGLE_CLIENT_ID?.substring(0, 20) + '...'
      };
      res.json(testResult);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/debug', (req, res) => {
    res.json({
      googleClientId: process.env.GOOGLE_CLIENT_ID,
      jwtSecret: process.env.JWT_SECRET ? 'Set' : 'Not set',
      mongoUri: process.env.MONGO_URI ? 'Set' : 'Not set'
    });
  });
}

// Forgot password - send reset link
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: 'Email is required' });

    const user = await User.findOne({ email });
    if (!user) {
      // Don't reveal if email exists
      return res.json({ message: 'If an account exists, a reset link has been sent' });
    }

    // Generate reset token (valid for 1 hour)
    const resetToken = jwt.sign(
      { userId: user._id, purpose: 'password-reset' },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    // Send email with reset link
    const resetTransport = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/reset-password?token=${resetToken}`;

    await resetTransport.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: email,
      subject: 'Reset Your CustoMate Password',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #2563eb;">Password Reset Request</h2>
          <p>Hello ${user.name},</p>
          <p>You requested to reset your password. Click the button below to set a new password:</p>
          <a href="${resetUrl}" style="display: inline-block; background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 16px 0;">Reset Password</a>
          <p>Or copy this link: <code>${resetUrl}</code></p>
          <p style="color: #666; font-size: 14px;">This link expires in 1 hour. If you didn't request this, please ignore this email.</p>
        </div>
      `
    });

    res.json({ message: 'If an account exists, a reset link has been sent' });
  } catch (err) {
    console.error('Forgot password error:', err);
    res.status(500).json({ message: 'Failed to send reset link' });
  }
});

// Reset password with token
router.post('/reset-password', async (req, res) => {
  try {
    const { token, newPassword } = req.body;
    if (!token || !newPassword) {
      return res.status(400).json({ message: 'Token and new password are required' });
    }

    // Validate password
    if (newPassword.length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters' });
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.purpose !== 'password-reset') {
      return res.status(400).json({ message: 'Invalid token' });
    }

    const user = await User.findById(decoded.userId);
    if (!user) return res.status(400).json({ message: 'User not found' });

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedPassword;
    await user.save();

    res.json({ message: 'Password reset successfully' });
  } catch (err) {
    console.error('Reset password error:', err);
    if (err.name === 'TokenExpiredError') {
      return res.status(400).json({ message: 'Reset link has expired' });
    }
    if (err.name === 'JsonWebTokenError') {
      return res.status(400).json({ message: 'Invalid token' });
    }
    res.status(500).json({ message: 'Failed to reset password' });
  }
});

/**
 * Google sign-in.
 *
 * Behavior:
 *   - EXISTING user (email already in DB): logs in immediately.
 *   - NEW Google account (first-time on this site): rejects with HTTP 403 and
 *     `{ status: 'needs_otp', email, name, suggestedAvatar }`. The frontend
 *     then calls /api/auth/otp/send + /otp/verify to confirm the user
 *     actually controls the inbox, then calls THIS endpoint again with
 *     `confirmCreate: true`. We re-verify the Google credential AND check
 *     that EmailOtp.verified === true for the matching email before creating.
 *
 * This stops account-creation drive-bys where someone with a stolen Google
 * credential could spin up an account on our platform without proving
 * mailbox control.
 */
router.post('/google', async (req, res) => {
  try {
    const { credential, confirmCreate } = req.body;
    if (!credential) {
      return res.status(400).json({ message: 'Missing Google credential' });
    }

    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    if (!payload?.email) {
      return res.status(400).json({ message: 'Invalid Google token' });
    }
    // Google flags whether the email is verified on Google's side — we still
    // require our own OTP, but a Google-unverified email is automatic reject.
    if (payload.email_verified === false) {
      return res.status(400).json({
        message: 'Your Google account email is not verified by Google itself',
      });
    }

    const normalizedEmail = payload.email.toLowerCase();
    let user = await User.findOne({ email: normalizedEmail });

    if (user) {
      // EXISTING user — log them in. If this account had no googleId yet
      // (registered via password), link it so future Google sign-ins resolve
      // to the same record.
      if (!user.googleId) {
        user.googleId = payload.sub;
        await user.save();
      }
      user.lastLogin = new Date();
      await user.save();

      const token = jwt.sign(
        { userId: user._id, role: user.role },
        process.env.JWT_SECRET,
        { expiresIn: '1d' }
      );
      return res.json({
        token,
        user: { id: user._id, name: user.name, email: user.email, role: user.role },
      });
    }

    // NEW account path.
    // Step 1 (no confirmCreate): tell the client we need OTP before we'll
    // create. Frontend then sends an OTP and asks user to enter it.
    if (!confirmCreate) {
      return res.status(403).json({
        status: 'needs_otp',
        message: 'Email verification required for first-time Google sign-in',
        email: normalizedEmail,
        name: payload.name || normalizedEmail.split('@')[0],
        avatar: payload.picture || '',
      });
    }

    // Step 2 (confirmCreate=true): the frontend claims OTP is done. Re-check.
    const otpRecord = await EmailOtp.findOne({ email: normalizedEmail });
    if (!otpRecord || !otpRecord.verified) {
      return res.status(403).json({
        status: 'needs_otp',
        message: 'Email OTP must be verified before creating your account',
      });
    }

    user = new User({
      name: payload.name || normalizedEmail.split('@')[0],
      email: normalizedEmail,
      googleId: payload.sub,
      avatar: payload.picture || '',
      role: 'customer',
      isEmailVerified: true,
      lastLogin: new Date(),
    });
    await user.save();

    // Consume the OTP so it can't be replayed
    await EmailOtp.deleteOne({ _id: otpRecord._id });

    const token = jwt.sign(
      { userId: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '1d' }
    );
    res.json({
      token,
      user: { id: user._id, name: user.name, email: user.email, role: user.role },
    });
  } catch (err) {
    console.error('Google auth error:', { name: err.name, message: err.message });
    if (err.message?.includes('wrong audience')) {
      return res.status(400).json({ message: 'Google Client ID mismatch' });
    }
    if (err.message?.includes('Token used too late') || err.message?.includes('invalid token')) {
      return res.status(400).json({ message: 'Invalid or expired Google token' });
    }
    res.status(500).json({ message: 'Google authentication failed' });
  }
});

export default router;
