import mongoose from 'mongoose';

const designSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    product:    { type: String, default: 'tshirt' },
    color:      { type: String, default: '#FFFFFF' },
    size:       { type: String, default: 'M' },
    elements:   { type: mongoose.Schema.Types.Mixed, default: [] },
    previewUrl: { type: String, default: null }, // base64 JPEG data URI from WebView snapshot
    ts:         { type: Number, default: () => Date.now() },
  },
  { timestamps: true }
);

export default mongoose.model('Design', designSchema);
