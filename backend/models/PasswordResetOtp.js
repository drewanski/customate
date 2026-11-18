import mongoose from 'mongoose';

const passwordResetOtpSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  codeHash: { type: String, required: true },
  expiresAt: { type: Date, required: true, index: { expires: 0 } },
  attempts: { type: Number, default: 0 },
}, { timestamps: true });

export default mongoose.model('PasswordResetOtp', passwordResetOtpSchema);
