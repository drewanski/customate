import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  contactNumber: { 
    type: String, 
    required: false,
    validate: {
      validator: function(v) {
        // Allow empty values for social login
        if (!v) return true;
        // Philippine phone number format: +639XXXXXXXXX or 09XXXXXXXXX
        return /^(\+639|09)\d{9}$/.test(v);
      },
      message: 'Please enter a valid Philippine phone number (e.g., +639XXXXXXXXX or 09XXXXXXXXX)'
    }
  },
  password: { type: String },
  avatar: { type: String },
  googleId: { type: String },
  // Role hierarchy (ascending privilege):
  //   guest             — pre-registration placeholder
  //   customer          — public shoppers
  //   production_staff  — floor workers; queue-only access, no PII / no $
  //   production_manager— supervisor; bridges floor + admin (no $ either)
  //   admin             — full system access including finance + accounts
  role: {
    type: String,
    enum: ['customer', 'admin', 'guest', 'production_staff', 'production_manager'],
    default: 'customer',
    index: true,
  },
  status: { type: String, enum: ['active', 'inactive', 'suspended'], default: 'active' },
  notificationPreference: { type: String, enum: ['sms', 'email'], default: 'email' },
  savedAddresses: [{
    label: { type: String, default: 'Home' }, // Home, Office, etc.
    fullName: { type: String },
    contactNumber: { type: String },
    addressLine1: { type: String },
    addressLine2: { type: String },
    city: { type: String },
    province: { type: String },
    postalCode: { type: String },
    isDefault: { type: Boolean, default: false }
  }],
  lastLogin: { type: Date },
  createdAt: { type: Date, default: Date.now },
  // True once the user has completed an email OTP flow (either during
  // password registration or during first-time Google sign-in).
  isEmailVerified: { type: Boolean, default: false },
  // Expo push token — stored after the mobile app requests notification permission.
  // Cleared automatically when the device unregisters (DeviceNotRegistered error).
  expoPushToken: { type: String, default: null },
});

export default mongoose.model('User', userSchema);
