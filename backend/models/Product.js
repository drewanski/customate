import mongoose from 'mongoose';

const templateSchema = new mongoose.Schema(
  {
    id: { type: String },
    name: { type: String },
    thumbnail: { type: String },
    category: { type: String }
  },
  { _id: false }
);

const productSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: String,
  category: { type: String, default: 'General' },
  price: { type: Number, required: true },
  image: String,
  inventory: { type: Number, default: 0 },
  sizes: { type: [String], default: [] },
  colors: { type: [String], default: [] },
  materials: { type: [String], default: [] },
  templates: { type: [templateSchema], default: [] }
});

export default mongoose.model('Product', productSchema);
