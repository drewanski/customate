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

// Register
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, contactNumber, role } = req.body;
    
    // Validate contact number
    if (!contactNumber || typeof contactNumber !== 'string' || !contactNumber.trim()) {
      return res.status(400).json({ message: 'Contact number is required' });
    }
    if (!/^(\+639|09)\d{9}$/.test(contactNumber.trim())) {
      return res.status(400).json({ message: 'Please enter a valid Philippine phone number (e.g., +639XXXXXXXXX or 09XXXXXXXXX)' });
    }

    const phoneRecord = await PhoneOtp.findOne({ contactNumber: contactNumber.trim() });
    if (!phoneRecord || !phoneRecord.verified) {
      return res.status(400).json({ message: 'Contact number must be verified' });
    }
    
    const existingUser = await User.findOne({ email });
    if (existingUser) return res.status(400).json({ message: 'User already exists' });
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({ 
      name, 
      email, 
      password: hashedPassword, 
      contactNumber: contactNumber.trim(),
      role: role || 'customer',
      notificationPreference: notificationPreference || 'email'
    });
    await user.save();
    res.status(201).json({ message: 'User registered' });
  } catch (err) {
    console.error('OTP send error:', err);
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

// Send OTP email
router.post('/otp/send', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: 'Email is required' });
    console.log('SMTP_USER:', process.env.SMTP_USER);
    console.log('SMTP_PASS loaded?', !!process.env.SMTP_PASS);
    console.log('SMTP_PASS length:', process.env.SMTP_PASS?.length);
    const otpTransport = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

    await EmailOtp.findOneAndUpdate(
      { email },
      { code, expiresAt, attempts: 0, verified: false },
      { upsert: true, new: true }
    );

    await otpTransport.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: email,
      subject: 'Your CustoMate Verification Code',
      text: `Your verification code is ${code}. It expires in ${OTP_EXPIRY_MINUTES} minutes.`
    });
    console.log('OTP email sent to:', email);

    res.json({ message: 'OTP sent' });
  } catch (err) {
    console.error('OTP send error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Verify OTP
router.post('/otp/verify', async (req, res) => {
  try {
    const { email, code } = req.body;
    if (!email || !code) return res.status(400).json({ message: 'Email and code are required' });

    const record = await EmailOtp.findOne({ email });
    if (!record) return res.status(400).json({ message: 'OTP not found' });
    if (record.verified) return res.json({ message: 'Already verified' });
    if (record.attempts >= OTP_MAX_ATTEMPTS) {
      return res.status(400).json({ message: 'Too many attempts' });
    }
    if (new Date() > record.expiresAt) {
      return res.status(400).json({ message: 'OTP expired' });
    }
    if (record.code !== code) {
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

// Test Google Client
router.get('/test-google', async (req, res) => {
  try {
    console.log('Testing Google Client initialization...');
    console.log('Client ID:', process.env.GOOGLE_CLIENT_ID);
    
    // Test with a dummy token to see if client is properly initialized
    const testResult = {
      clientInitialized: !!googleClient,
      clientIdSet: !!process.env.GOOGLE_CLIENT_ID,
      clientId: process.env.GOOGLE_CLIENT_ID?.substring(0, 20) + '...'
    };
    
    res.json(testResult);
  } catch (err) {
    console.error('Google Client test error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Debug endpoint
router.get('/debug', (req, res) => {
  res.json({
    googleClientId: process.env.GOOGLE_CLIENT_ID,
    jwtSecret: process.env.JWT_SECRET ? 'Set' : 'Not set',
    mongoUri: process.env.MONGO_URI ? 'Set' : 'Not set'
  });
});

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

// Google sign-in
router.post('/google', async (req, res) => {
  try {
    const { credential } = req.body;
    console.log('Google auth request received:', { hasCredential: !!credential });
    
    if (!credential) {
      console.log('Missing Google credential');
      return res.status(400).json({ message: 'Missing Google credential' });
    }

    console.log('Verifying Google token...');
    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID
    });

    const payload = ticket.getPayload();
    console.log('Google token payload received:', { hasEmail: !!payload?.email });

    if (!payload?.email) {
      console.log('Invalid Google token - no email');
      return res.status(400).json({ message: 'Invalid Google token' });
    }

    let user = await User.findOne({ email: payload.email });
    console.log('User lookup:', { found: !!user });

    if (!user) {
      console.log('Creating new Google user');
      user = new User({
        name: payload.name || payload.email.split('@')[0],
        email: payload.email,
        googleId: payload.sub,
        role: 'customer'
      });
      await user.save();
      console.log('New user created');
    }

    const token = jwt.sign({ userId: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '1d' });
    console.log('JWT token created');
    res.json({ token, user: { id: user._id, name: user.name, email: user.email, role: user.role } });
  } catch (err) {
    console.error('Google auth error details:', {
      name: err.name,
      message: err.message,
      stack: err.stack?.split('\n')[0] // Just first line of stack
    });
    
    // Specific error handling
    if (err.message?.includes('wrong audience')) {
      return res.status(400).json({ message: 'Google Client ID mismatch' });
    }
    if (err.message?.includes('invalid token')) {
      return res.status(400).json({ message: 'Invalid Google token' });
    }
    if (err.message?.includes('issuer')) {
      return res.status(400).json({ message: 'Invalid Google token issuer' });
    }
    
    res.status(500).json({ message: 'Google authentication failed: ' + err.message });
  }
});

export default router;
