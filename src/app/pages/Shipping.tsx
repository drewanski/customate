import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, Check, Clock3, MapPin, PackageCheck, RefreshCw, Truck } from 'lucide-react';
import { getShippingInfo } from '../api';

interface ShippingRegion {
  id: string;
  name: string;
  description: string;
}

interface ShippingInfo {
  updatedAt: string;
  coverage: string;
  regions: ShippingRegion[];
  couriers: string[];
  fees: {
    deliveryBelowThreshold: number;
    freeDeliveryThreshold: number;
    pickup: number;
    taguigRiderFeeCovered: boolean;
  };
  pickup: { address: string; fee: number };
  deliveryNotes: string[];
  productionTiers: Array<{
    id: string;
    name: string;
    minBusinessDays: number;
    maxBusinessDays: number | null;
    surchargePercent: number;
    description: string;
  }>;
}

export function Shipping() {
  const [info, setInfo] = useState<ShippingInfo | null>(null);
  const [selectedRegions, setSelectedRegions] = useState<string[]>(['metro-manila']);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadShippingInfo = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await getShippingInfo();
      setInfo(response);
      setSelectedRegions((current) => current.length ? current : [response.regions?.[0]?.id].filter(Boolean));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not retrieve shipping information.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadShippingInfo(); }, [loadShippingInfo]);

  const toggleRegion = (regionId: string) => {
    setSelectedRegions((current) => current.includes(regionId)
      ? current.filter((id) => id !== regionId)
      : [...current, regionId]);
  };

  const selectedRegionDetails = info?.regions.filter((region) => selectedRegions.includes(region.id)) || [];

  return (
    <main className="min-h-[70vh] bg-slate-50 px-4 py-10 sm:py-14">
      <div className="mx-auto max-w-5xl">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[.18em] text-blue-600">CustoMate delivery information</p>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900 sm:text-4xl">Shipping &amp; delivery</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
              Review delivery coverage, fees, pickup details, and production lead-time options. Choose multiple regions to compare their delivery notes.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadShippingInfo()}
            disabled={loading}
            className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh information
          </button>
        </div>

        {error && (
          <div role="alert" className="mt-6 flex items-start justify-between gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
            <span className="flex items-start gap-2"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</span>
            <button type="button" onClick={() => void loadShippingInfo()} className="shrink-0 font-bold underline">Try again</button>
          </div>
        )}

        {loading && !info && (
          <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500" role="status">
            <RefreshCw className="mx-auto mb-3 h-5 w-5 animate-spin text-blue-600" />
            Retrieving current shipping information…
          </div>
        )}

        {info && (
          <>
            <section className="mt-8 grid gap-4 md:grid-cols-3" aria-label="Shipping summary">
              <div className="rounded-2xl border border-blue-100 bg-white p-5 shadow-sm">
                <Truck className="h-5 w-5 text-blue-600" />
                <h2 className="mt-3 font-bold text-slate-900">Delivery coverage</h2>
                <p className="mt-1 text-sm leading-5 text-slate-600">{info.coverage}</p>
              </div>
              <div className="rounded-2xl border border-blue-100 bg-white p-5 shadow-sm">
                <PackageCheck className="h-5 w-5 text-emerald-600" />
                <h2 className="mt-3 font-bold text-slate-900">System shipping fee</h2>
                <p className="mt-1 text-sm leading-5 text-slate-600">
                  ₱{info.fees.deliveryBelowThreshold} when the merchandise subtotal is below ₱{info.fees.freeDeliveryThreshold}; free at or above that amount. Pickup is free.
                </p>
              </div>
              <div className="rounded-2xl border border-blue-100 bg-white p-5 shadow-sm">
                <MapPin className="h-5 w-5 text-violet-600" />
                <h2 className="mt-3 font-bold text-slate-900">In-store pickup</h2>
                <p className="mt-1 text-sm leading-5 text-slate-600">{info.pickup.address}</p>
                <p className="mt-2 text-xs font-semibold text-emerald-700">No shipping fee</p>
              </div>
            </section>

            <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7" aria-labelledby="region-title">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h2 id="region-title" className="text-xl font-black text-slate-900">Select delivery regions</h2>
                  <p className="mt-1 text-sm text-slate-600">Select one or more areas to display the matching delivery notes.</p>
                </div>
                <span className="text-xs font-medium text-slate-500" aria-live="polite">{selectedRegions.length} selected</span>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {info.regions.map((region) => {
                  const selected = selectedRegions.includes(region.id);
                  return (
                    <button
                      key={region.id}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => toggleRegion(region.id)}
                      className={`flex min-h-16 items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left text-sm font-bold transition-colors ${selected ? 'border-blue-500 bg-blue-50 text-blue-800 ring-2 ring-blue-100' : 'border-slate-200 bg-white text-slate-700 hover:border-blue-300 hover:bg-slate-50'}`}
                    >
                      <span>{region.name}</span>
                      <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${selected ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300 text-transparent'}`}><Check className="h-3 w-3" /></span>
                    </button>
                  );
                })}
              </div>

              {selectedRegionDetails.length ? (
                <div className="mt-5 grid gap-3 md:grid-cols-2" aria-live="polite">
                  {selectedRegionDetails.map((region) => (
                    <article key={region.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                      <div className="flex items-center gap-2 font-bold text-slate-900"><MapPin className="h-4 w-4 text-blue-600" />{region.name}</div>
                      <p className="mt-2 text-sm leading-5 text-slate-600">{region.description}</p>
                      <p className="mt-2 text-xs text-slate-500">Partner couriers: {info.couriers.join(', ')}.</p>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="mt-5 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">Select at least one region to see its delivery details.</p>
              )}
            </section>

            <section className="mt-6 grid gap-4 lg:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
                <div className="flex items-center gap-2"><Clock3 className="h-5 w-5 text-amber-600" /><h2 className="text-lg font-black text-slate-900">Production lead-time options</h2></div>
                <p className="mt-2 text-sm text-slate-600">These are production lead times from the checkout date selector, not courier transit estimates. Availability is checked for the requested date.</p>
                <div className="mt-4 divide-y divide-slate-100">
                  {info.productionTiers.map((tier) => (
                    <div key={tier.id} className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0">
                      <div>
                        <p className="text-sm font-bold text-slate-900">{tier.name}</p>
                        <p className="mt-0.5 text-xs text-slate-500">{tier.description}</p>
                      </div>
                      <div className="shrink-0 text-right text-sm font-semibold text-slate-700">
                        <div>{tier.maxBusinessDays == null ? `${tier.minBusinessDays}+` : `${tier.minBusinessDays}–${tier.maxBusinessDays}`} business days</div>
                        <div className="text-xs font-medium text-slate-500">{tier.surchargePercent}% rush surcharge</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
                <h2 className="text-lg font-black text-slate-900">Delivery notes</h2>
                <ul className="mt-3 space-y-3">
                  {info.deliveryNotes.map((note) => <li key={note} className="flex gap-2 text-sm leading-5 text-slate-600"><Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />{note}</li>)}
                </ul>
                <Link to="/products" className="mt-5 inline-flex items-center justify-center rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-700">Browse products</Link>
              </div>
            </section>

            <p className="mt-5 text-right text-[11px] text-slate-400">Shipping policies retrieved {new Date(info.updatedAt).toLocaleString()}</p>
          </>
        )}
      </div>
    </main>
  );
}
