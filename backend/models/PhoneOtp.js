import mongoose from 'mongoose';

const phoneOtpSchema = new mongoose.Schema({
  contactNumber: { type: String, required: true, unique: true },
  code: { type: String, required: true },
  expiresAt: { type: Date, required: true },
  attempts: { type: Number, default: 0 },
  verified: { type: Boolean, default: false }
});

export default mongoose.model('PhoneOtp', phoneOtpSchema);
