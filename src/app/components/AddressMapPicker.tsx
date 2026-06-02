/**
 * AddressMapPicker — Leaflet-based "pick your address on a map" widget.
 *
 * Free stack (no API keys, no billing):
 *   • Tiles: OpenStreetMap
 *   • Reverse + forward geocoding: Nominatim (OpenStreetMap's official
 *     geocoder). Rate-limited to ~1 request/sec for unauthenticated use,
 *     which is fine for an interactive picker.
 *
 * Usage:
 *   <AddressMapPicker
 *     value={shippingAddress}
 *     onChange={(addr) => setShippingAddress(addr)}
 *   />
 *
 * The picker renders an "Open map" button next to a text input. Clicking
 * opens a modal with an interactive map: click anywhere to drop a pin,
 * the address auto-fills, then click Confirm to apply it back.
 */

import React, { useEffect, useRef, useState } from 'react';
import { MapPin, Search, X, Loader2, Crosshair } from 'lucide-react';
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Leaflet's default marker icon paths are broken when bundled by Vite —
// the icons resolve to URLs that 404. Re-point to the CDN copies so the
// pin renders correctly without us having to copy assets into /public.
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// Default center — Metro Manila. Picker pans here on first open if the
// customer doesn't already have an address typed in.
const DEFAULT_CENTER: [number, number] = [14.5995, 120.9842];
const DEFAULT_ZOOM = 12;

interface NominatimResult {
  display_name: string;
  lat: string;
  lon: string;
}

async function reverseGeocode(lat: number, lon: number): Promise<string | null> {
  try {
    const r = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&accept-language=en&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1`,
      // No custom headers — anything beyond a "simple" header set
      // triggers a CORS preflight that Nominatim's free tier rejects.
      // Pass `accept-language` as a URL param instead (Nominatim honors it).
    );
    if (!r.ok) return null;
    const j = await r.json();
    return j?.display_name || null;
  } catch {
    return null;
  }
}

async function forwardGeocode(query: string): Promise<NominatimResult[]> {
  if (!query.trim()) return [];
  try {
    const r = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&accept-language=en&q=${encodeURIComponent(query)}&limit=5&countrycodes=ph&addressdetails=1`,
    );
    if (!r.ok) { console.warn('[map] Nominatim forward returned', r.status); return []; }
    const j = await r.json();
    return Array.isArray(j) ? j : [];
  } catch (err) {
    console.warn('[map] Nominatim forward failed', err);
    return [];
  }
}

/** Click-anywhere-on-map handler. */
function ClickHandler({ onPick }: { onPick: (lat: number, lon: number) => void }) {
  useMapEvents({
    click(e) {
      onPick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

/** Programmatically pan the map when the pin changes (search hits). */
function FlyToPin({ pin }: { pin: [number, number] | null }) {
  const map = useMap();
  useEffect(() => {
    if (pin) map.flyTo(pin, Math.max(map.getZoom(), 15), { duration: 0.6 });
  }, [pin?.[0], pin?.[1]]);
  return null;
}

interface Props {
  value: string;
  onChange: (address: string) => void;
  /** Optional disabled state — typically the parent's `loading` flag. */
  disabled?: boolean;
  /** Optional class for the wrapper. */
  className?: string;
  label?: string;
}

export function AddressMapPicker({ value, onChange, disabled, className = '', label = 'Shipping Address' }: Props) {
  const [open, setOpen] = useState(false);
  const [pin, setPin] = useState<[number, number] | null>(null);
  const [resolved, setResolved] = useState(''); // current map-derived address (preview, not committed yet)
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState<NominatimResult[]>([]);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<any>(null);

  // Reset every time the modal opens.
  useEffect(() => {
    if (!open) return;
    setPin(null);
    setResolved('');
    setSearch('');
    setSearchResults([]);
  }, [open]);

  // Debounced forward-geocode as the user types in the search box.
  useEffect(() => {
    if (!open) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!search.trim()) { setSearchResults([]); return; }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const r = await forwardGeocode(search);
        setSearchResults(r);
      } finally { setSearching(false); }
    }, 350);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [search, open]);

  const onMapClick = async (lat: number, lon: number) => {
    setPin([lat, lon]);
    setBusy(true);
    try {
      const addr = await reverseGeocode(lat, lon);
      setResolved(addr || `${lat.toFixed(6)}, ${lon.toFixed(6)}`);
    } finally { setBusy(false); }
  };

  const pickResult = (r: NominatimResult) => {
    const lat = parseFloat(r.lat);
    const lon = parseFloat(r.lon);
    setPin([lat, lon]);
    setResolved(r.display_name);
    setSearch('');
    setSearchResults([]);
  };

  const confirm = () => {
    if (!resolved) return;
    onChange(resolved);
    setOpen(false);
  };

  return (
    <div className={className}>
      {label && (
        <label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
      )}
      <div className="flex gap-2">
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={2}
          placeholder="Street, Barangay, City, Province"
          disabled={disabled}
          className="flex-1 px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-4 focus:ring-blue-100 focus:border-blue-400 disabled:bg-slate-50 disabled:opacity-70"
        />
        <button
          type="button"
          onClick={() => setOpen(true)}
          disabled={disabled}
          className="self-start inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white font-bold text-xs shadow-md hover:shadow-lg disabled:opacity-50"
          title="Pick exact location on the map"
        >
          <MapPin className="w-3.5 h-3.5" /> Pin on map
        </button>
      </div>
      <p className="text-[10px] text-slate-500 mt-1">Type your address, or click <strong>Pin on map</strong> to choose a precise location.</p>

      {/* Modal */}
      {open && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-slate-900/70 backdrop-blur-sm p-4" onClick={() => setOpen(false)}>
          <div className="bg-white w-full max-w-3xl rounded-3xl shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-slate-100 bg-gradient-to-br from-blue-600 to-indigo-700 text-white flex items-center justify-between">
              <div>
                <h3 className="text-lg font-black flex items-center gap-2"><MapPin className="w-5 h-5" /> Pick delivery location</h3>
                <p className="text-xs opacity-90 mt-0.5">Search or click anywhere on the map. The address auto-fills.</p>
              </div>
              <button onClick={() => setOpen(false)} className="w-8 h-8 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 border-b border-slate-100 relative">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search a place (street, barangay, mall, city…)"
                  className="w-full pl-10 pr-9 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-4 focus:ring-blue-100 focus:border-blue-400"
                />
                {searching && <Loader2 className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-blue-500 animate-spin" />}
                {search && !searching && (
                  <button onClick={() => { setSearch(''); setSearchResults([]); }} className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-lg hover:bg-slate-100 flex items-center justify-center">
                    <X className="w-3.5 h-3.5 text-slate-400" />
                  </button>
                )}
              </div>
              {/* Dropdown — always rendered when there's a query so the
                  customer sees the searching/no-results state. Helps
                  diagnose "search is broken" feedback. */}
              {search.trim().length >= 2 && (
                <div className="absolute left-4 right-4 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-lg max-h-56 overflow-y-auto z-20">
                  {searching && (
                    <p className="px-3 py-2 text-xs text-slate-500 inline-flex items-center gap-1.5">
                      <Loader2 className="w-3 h-3 animate-spin" /> Searching OpenStreetMap…
                    </p>
                  )}
                  {!searching && searchResults.length === 0 && (
                    <p className="px-3 py-2 text-xs text-slate-500">No matches. Try a broader term (e.g. "Las Piñas") or click the map directly.</p>
                  )}
                  {!searching && searchResults.map((r, i) => (
                    <button
                      key={i}
                      onClick={() => pickResult(r)}
                      className="w-full text-left px-3 py-2 hover:bg-blue-50 border-b border-slate-100 last:border-b-0 text-xs"
                    >
                      <p className="font-semibold text-slate-900 line-clamp-1">{r.display_name}</p>
                      <p className="text-[10px] text-slate-500 mt-0.5">{parseFloat(r.lat).toFixed(4)}, {parseFloat(r.lon).toFixed(4)}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="h-[420px] relative">
              <MapContainer
                center={DEFAULT_CENTER}
                zoom={DEFAULT_ZOOM}
                style={{ height: '100%', width: '100%' }}
              >
                <TileLayer
                  attribution='&copy; <a href="https://osm.org/copyright">OpenStreetMap</a>'
                  url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <ClickHandler onPick={onMapClick} />
                <FlyToPin pin={pin} />
                {pin && <Marker position={pin} />}
              </MapContainer>
              <div className="absolute top-3 right-3 px-2 py-1 rounded-lg bg-white/90 backdrop-blur text-[10px] font-bold text-slate-600 shadow-md inline-flex items-center gap-1">
                <Crosshair className="w-3 h-3" /> Click the map to drop a pin
              </div>
            </div>

            <div className="px-5 py-4 border-t border-slate-100 bg-slate-50">
              <p className="text-[10px] font-bold text-slate-600 uppercase tracking-wider mb-1">Picked address</p>
              {busy ? (
                <p className="text-xs text-slate-500 flex items-center gap-1.5"><Loader2 className="w-3 h-3 animate-spin" /> Looking up the address…</p>
              ) : resolved ? (
                <p className="text-sm font-semibold text-slate-900 leading-snug">{resolved}</p>
              ) : (
                <p className="text-sm text-slate-400 italic">Click on the map or use the search above.</p>
              )}
            </div>

            <div className="px-5 py-4 flex gap-2">
              <button onClick={() => setOpen(false)} className="flex-1 px-4 py-2.5 rounded-xl bg-slate-100 text-slate-700 font-bold text-sm">Cancel</button>
              <button onClick={confirm} disabled={!resolved || busy} className="flex-1 px-4 py-2.5 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white font-black text-sm shadow-md disabled:opacity-50">
                Use this address
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default AddressMapPicker;
