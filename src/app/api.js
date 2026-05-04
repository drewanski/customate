// Simple API utility for making requests to the backend
const API_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000/api';

export async function apiRequest(path, options = {}) {
  const token = localStorage.getItem('token');
  const headers = {
    'Content-Type': 'application/json',
    ...(token && { Authorization: `Bearer ${token}` })
  };
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: { ...headers, ...(options.headers || {}) },
  });
  if (!res.ok) throw new Error((await res.json()).message || 'API error');
  return res.json();
}

export async function login(email, password) {
  return apiRequest('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password })
  });
}

export async function register(name, email, password, contactNumber, role = 'customer', notificationPreference = 'email') {
  return apiRequest('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ name, email, password, contactNumber, role, notificationPreference })
  });
}

export async function googleSignIn(credential) {
  return apiRequest('/auth/google', {
    method: 'POST',
    body: JSON.stringify({ credential })
  });
}

export async function sendOtp(email) {
  return apiRequest('/auth/otp/send', {
    method: 'POST',
    body: JSON.stringify({ email })
  });
}

export async function verifyOtp(email, code) {
  return apiRequest('/auth/otp/verify', {
    method: 'POST',
    body: JSON.stringify({ email, code })
  });
}

export async function sendPhoneOtp(contactNumber) {
  return apiRequest('/auth/phone-otp/send', {
    method: 'POST',
    body: JSON.stringify({ contactNumber })
  });
}

export async function verifyPhoneOtp(contactNumber, code) {
  return apiRequest('/auth/phone-otp/verify', {
    method: 'POST',
    body: JSON.stringify({ contactNumber, code })
  });
}

export async function guestLogin(name) {
  return apiRequest('/auth/guest', {
    method: 'POST',
    body: JSON.stringify({ name })
  });
}

export async function getProfile() {
  return apiRequest('/users/me');
}

export async function updateProfile(data) {
  return apiRequest('/users/me', {
    method: 'PUT',
    body: JSON.stringify(data)
  });
}
