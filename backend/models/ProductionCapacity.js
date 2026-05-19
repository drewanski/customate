import mongoose from 'mongoose';

/**
 * Singleton settings document for production capacity.
 *
 * `defaultDailyCapacity` is the units/day baseline. `overrides` lets the admin
 * raise or lower a specific date (holidays, extra shifts). `workingDays`
 * controls which days of the week production runs (0 = Sunday … 6 = Saturday).
 *
 * Capacity is expressed in TOTAL UNITS per day (sum of order.totalQty for
 * orders scheduled on that day). The UI compares this against the actual
 * scheduled load and warns when over.
 */
const productionCapacitySchema = new mongoose.Schema({
  singleton: { type: String, default: 'global', unique: true },
  defaultDailyCapacity: { type: Number, default: 100, min: 0 },
  // 0 = Sunday, 6 = Saturday. Defaults to Mon–Sat.
  workingDays: { type: [Number], default: [1, 2, 3, 4, 5, 6] },
  // Per-day capacity overrides. Date should be YYYY-MM-DD (UTC date portion).
  overrides: {
    type: [
      {
        date: { type: String, required: true }, // YYYY-MM-DD
        capacity: { type: Number, required: true, min: 0 },
        reason: { type: String, default: '' },
      },
    ],
    default: [],
  },
  updatedAt: { type: Date, default: Date.now },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
});

productionCapacitySchema.statics.getOrCreate = async function () {
  let doc = await this.findOne({ singleton: 'global' });
  if (!doc) doc = await this.create({ singleton: 'global' });
  return doc;
};

export default mongoose.model('ProductionCapacity', productionCapacitySchema);
