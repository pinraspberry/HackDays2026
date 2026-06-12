import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  MapPin,
  Crosshair,
  Phone,
  Clock,
  Navigation,
  AlertTriangle,
  RefreshCw,
  Hospital,
  Stethoscope,
  Pill,
  Loader2,
} from 'lucide-react';
import { useSettings } from '../context/SettingsContext';
import { getCurrentPositionSafe } from '../services/sosService';
import {
  fetchNearbyPlaces,
  formatDistance,
  type Amenity,
  type Place,
} from '../services/overpassService';

type Filter = 'all' | Amenity;
type GeoStatus = 'idle' | 'requesting' | 'granted' | 'denied';

const AMENITY_COLORS: Record<Amenity, string> = {
  hospital: '#ef4444',
  clinic: '#f59e0b',
  pharmacy: '#10b981',
};

const escapeHtml = (s: string): string =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const directionsUrl = (lat: number, lng: number): string =>
  `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;

const amenityIcon = (a: Amenity) => {
  const cls = 'shrink-0';
  if (a === 'hospital') return <Hospital size={16} className={cls} style={{ color: AMENITY_COLORS.hospital }} />;
  if (a === 'clinic') return <Stethoscope size={16} className={cls} style={{ color: AMENITY_COLORS.clinic }} />;
  return <Pill size={16} className={cls} style={{ color: AMENITY_COLORS.pharmacy }} />;
};

const makeDivIcon = (color: string): L.DivIcon =>
  L.divIcon({
    className: 'pulse-amenity-marker',
    html: `<span style="
      display:block;width:22px;height:22px;border-radius:9999px;
      background:${color};border:3px solid #ffffff;
      box-shadow:0 2px 6px rgba(0,0,0,0.4);"></span>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
    popupAnchor: [0, -12],
  });

export const NearbyCare: React.FC = () => {
  const { language } = useSettings();

  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [geoStatus, setGeoStatus] = useState<GeoStatus>('idle');
  const [places, setPlaces] = useState<Place[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const mapRef = useRef<L.Map | null>(null);
  const mapDivRef = useRef<HTMLDivElement | null>(null);
  const userMarkerRef = useRef<L.CircleMarker | null>(null);
  const placeLayerRef = useRef<L.LayerGroup | null>(null);
  const markersById = useRef<Map<string, L.Marker>>(new Map());

  const labels = useMemo(() => {
    if (language === 'hi') {
      return {
        title: 'पास की देखभाल',
        subtitle: 'आपके 5 किलोमीटर के दायरे में अस्पताल, क्लिनिक और फार्मेसी',
        locateMe: 'फिर से ढूँढें',
        loading: 'पास की जगहें ढूँढ रहे हैं…',
        denied: 'पास की देखभाल देखने के लिए लोकेशन चालू करें',
        retry: 'फिर कोशिश करें',
        error: 'परिणाम लोड नहीं हो सके — फिर कोशिश करने के लिए टैप करें',
        none: 'पास में कुछ नहीं मिला',
        all: 'सभी',
        hospital: 'अस्पताल',
        clinic: 'क्लिनिक',
        pharmacy: 'फार्मेसी',
        directions: 'दिशा-निर्देश',
        call: 'कॉल करें',
        count: (n: number) => `${n} जगहें मिलीं`,
      };
    }
    if (language === 'ta') {
      return {
        title: 'அருகிலுள்ள கவனிப்பு',
        subtitle: 'உங்களுக்கு 5 கி.மீ. தொலைவில் மருத்துவமனைகள், கிளினிக்குகள், மருந்தகங்கள்',
        locateMe: 'மீண்டும் கண்டுபிடி',
        loading: 'அருகிலுள்ள இடங்களைக் கண்டறிகிறோம்…',
        denied: 'அருகிலுள்ள கவனிப்பைக் காண இடத்தை இயக்கவும்',
        retry: 'மீண்டும் முயற்சிக்கவும்',
        error: 'முடிவுகளை ஏற்ற முடியவில்லை — மீண்டும் முயற்சிக்க தட்டவும்',
        none: 'அருகில் எதுவும் கிடைக்கவில்லை',
        all: 'அனைத்தும்',
        hospital: 'மருத்துவமனைகள்',
        clinic: 'கிளினிக்குகள்',
        pharmacy: 'மருந்தகங்கள்',
        directions: 'வழிகாட்டு',
        call: 'அழை',
        count: (n: number) => `${n} இடங்கள் கிடைத்தன`,
      };
    }
    return {
      title: 'Nearby Care',
      subtitle: 'Hospitals, clinics & pharmacies within 5 km of you',
      locateMe: 'Locate me',
      loading: 'Finding nearby places…',
      denied: 'Enable location to find nearby care',
      retry: 'Try again',
      error: 'Could not load results — tap to retry',
      none: 'No places found nearby',
      all: 'All',
      hospital: 'Hospitals',
      clinic: 'Clinics',
      pharmacy: 'Pharmacies',
      directions: 'Get Directions',
      call: 'Call',
      count: (n: number) => `${n} places found`,
    };
  }, [language]);

  /* ===== Geolocation ===== */
  const requestLocation = useCallback(async () => {
    setGeoStatus('requesting');
    setError(null);
    const pos = await getCurrentPositionSafe();
    if (!pos) {
      setGeoStatus('denied');
      setCoords(null);
      return;
    }
    setGeoStatus('granted');
    setCoords(pos);
  }, []);

  useEffect(() => {
    void requestLocation();
  }, [requestLocation]);

  /* ===== Overpass fetch (re-runs when coords change) ===== */
  useEffect(() => {
    if (!coords) return;
    const ac = new AbortController();
    const myLat = coords.lat;
    const myLng = coords.lng;

    setLoading(true);
    setError(null);
    fetchNearbyPlaces(myLat, myLng, ac.signal)
      .then((res) => {
        // Guard against stale results if the user re-located mid-flight.
        if (ac.signal.aborted) return;
        setPlaces(res);
      })
      .catch((err) => {
        if (ac.signal.aborted) return;
        console.warn('[NearbyCare] overpass failed', err);
        setError(labels.error);
        setPlaces([]);
      })
      .finally(() => {
        if (ac.signal.aborted) return;
        setLoading(false);
      });

    return () => ac.abort();
  }, [coords, labels.error]);

  /* ===== Map init / teardown ===== */
  useEffect(() => {
    if (!coords || !mapDivRef.current) return;
    if (mapRef.current) {
      // Coords changed: just recenter and move the user marker.
      mapRef.current.setView([coords.lat, coords.lng], 14);
      userMarkerRef.current?.setLatLng([coords.lat, coords.lng]);
      return;
    }

    const map = L.map(mapDivRef.current, {
      center: [coords.lat, coords.lng],
      zoom: 14,
      scrollWheelZoom: true,
      attributionControl: true,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(map);

    userMarkerRef.current = L.circleMarker([coords.lat, coords.lng], {
      radius: 9,
      color: '#3b82f6',
      fillColor: '#3b82f6',
      fillOpacity: 0.7,
      weight: 3,
    }).addTo(map);

    placeLayerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    return () => {
      // Component unmount only — coords-driven updates short-circuit above.
      map.remove();
      mapRef.current = null;
      userMarkerRef.current = null;
      placeLayerRef.current = null;
      markersById.current.clear();
    };
    // We intentionally only init once per mount; coord updates are handled
    // inline via setView above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!coords]);

  /* ===== Markers (re-render on places/filter change) ===== */
  useEffect(() => {
    const layer = placeLayerRef.current;
    const map = mapRef.current;
    if (!layer || !map) return;

    layer.clearLayers();
    markersById.current.clear();

    const filtered = filter === 'all' ? places : places.filter((p) => p.amenity === filter);

    filtered.forEach((p) => {
      const marker = L.marker([p.lat, p.lng], {
        icon: makeDivIcon(AMENITY_COLORS[p.amenity]),
      });

      const phoneRow = p.phone
        ? `<div style="margin-top:6px;font-size:12px;">
             <a href="tel:${escapeHtml(p.phone)}" style="color:#3b82f6;text-decoration:none;font-weight:600;">
               ${escapeHtml(p.phone)}
             </a>
           </div>`
        : '';
      const hoursRow = p.openingHours
        ? `<div style="margin-top:4px;font-size:11px;color:#475569;">${escapeHtml(p.openingHours)}</div>`
        : '';

      marker.bindPopup(
        `<div style="min-width:200px;font-family:inherit;">
           <div style="font-weight:700;font-size:14px;color:#0f172a;line-height:1.3;">
             ${escapeHtml(p.name)}
           </div>
           <div style="margin-top:4px;font-size:12px;color:#64748b;font-weight:600;">
             ${formatDistance(p.distanceMeters)}
           </div>
           ${phoneRow}
           ${hoursRow}
           <a href="${directionsUrl(p.lat, p.lng)}" target="_blank" rel="noopener noreferrer"
              style="display:inline-block;margin-top:10px;padding:8px 12px;background:#3b82f6;color:#ffffff;
                     font-weight:700;font-size:12px;border-radius:8px;text-decoration:none;">
             ${escapeHtml(labels.directions)}
           </a>
         </div>`,
        { maxWidth: 260 }
      );

      marker.on('click', () => setSelectedId(p.id));
      marker.addTo(layer);
      markersById.current.set(p.id, marker);
    });
  }, [places, filter, labels.directions]);

  /* ===== List → map interactions ===== */
  const handleSelectFromList = useCallback((p: Place) => {
    setSelectedId(p.id);
    const map = mapRef.current;
    if (!map) return;
    map.flyTo([p.lat, p.lng], Math.max(map.getZoom(), 15), { duration: 0.6 });
    const m = markersById.current.get(p.id);
    if (m) {
      window.setTimeout(() => m.openPopup(), 350);
    }
  }, []);

  /* ===== Render ===== */
  const filteredPlaces = useMemo(
    () => (filter === 'all' ? places : places.filter((p) => p.amenity === filter)),
    [places, filter]
  );

  const filterChips: { id: Filter; label: string; color?: string }[] = [
    { id: 'all', label: labels.all },
    { id: 'hospital', label: labels.hospital, color: AMENITY_COLORS.hospital },
    { id: 'clinic', label: labels.clinic, color: AMENITY_COLORS.clinic },
    { id: 'pharmacy', label: labels.pharmacy, color: AMENITY_COLORS.pharmacy },
  ];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-xl sm:text-2xl font-medium text-navy-50 flex items-center gap-2">
            <MapPin size={22} className="text-accent" />
            <span>{labels.title}</span>
          </h2>
          <p className="text-sm text-navy-700 mt-0.5">{labels.subtitle}</p>
        </div>
        <button
          onClick={requestLocation}
          disabled={geoStatus === 'requesting' || loading}
          className="inline-flex items-center gap-2 bg-navy-900 hover:bg-navy-850 border border-navy-800 text-navy-50 font-medium px-4 rounded-card tactile-btn disabled:opacity-60"
          style={{ minHeight: 48 }}
        >
          {geoStatus === 'requesting' ? (
            <Loader2 size={15} className="animate-spin" />
          ) : (
            <Crosshair size={15} />
          )}
          <span className="text-sm">{labels.locateMe}</span>
        </button>
      </div>

      {/* Filter chips */}
      <div className="flex flex-wrap gap-2">
        {filterChips.map((chip) => {
          const isActive = filter === chip.id;
          return (
            <button
              key={chip.id}
              onClick={() => setFilter(chip.id)}
              className={`inline-flex items-center gap-2 px-4 rounded-card border text-sm font-medium tactile-btn transition-colors ${
                isActive
                  ? 'bg-accent/15 border-accent/50 text-accent'
                  : 'bg-navy-900 border-navy-800 text-navy-100 hover:border-navy-750'
              }`}
              style={{ minHeight: 48 }}
            >
              {chip.color && (
                <span
                  className="inline-block w-3 h-3 rounded-full border-2 border-white/20"
                  style={{ background: chip.color }}
                />
              )}
              <span>{chip.label}</span>
            </button>
          );
        })}
      </div>

      {/* Denied state */}
      {geoStatus === 'denied' && (
        <div className="card-navy text-center py-10">
          <div className="w-14 h-14 rounded-card bg-danger-light border border-danger/30 mx-auto flex items-center justify-center mb-3 text-danger-dark">
            <AlertTriangle size={24} />
          </div>
          <p className="text-base font-medium text-navy-50">{labels.denied}</p>
          <button
            onClick={requestLocation}
            className="mt-4 inline-flex items-center gap-2 bg-accent hover:bg-accent-dark text-white font-medium px-5 rounded-card shadow-soft tactile-btn"
            style={{ minHeight: 48 }}
          >
            <Crosshair size={15} />
            <span className="text-sm">{labels.locateMe}</span>
          </button>
        </div>
      )}

      {/* Map */}
      {geoStatus !== 'denied' && (
        <div className="relative rounded-card overflow-hidden border border-navy-800 bg-navy-900 h-[420px] lg:h-[520px]">
          {!coords && (
            <div className="absolute inset-0 flex items-center justify-center text-navy-700 z-10">
              <div className="flex items-center gap-2">
                <Loader2 size={18} className="animate-spin text-accent" />
                <span className="text-sm font-medium">{labels.loading}</span>
              </div>
            </div>
          )}
          <div ref={mapDivRef} className="absolute inset-0" />
        </div>
      )}

      {/* Status / count line */}
      {coords && !loading && !error && places.length > 0 && (
        <div className="flex items-center justify-between text-xs text-navy-700 font-medium px-1">
          <span>{labels.count(filteredPlaces.length)}</span>
          <span>© OpenStreetMap contributors</span>
        </div>
      )}

      {/* Error state */}
      {error && coords && (
        <button
          onClick={() => setCoords({ ...coords })}
          className="card-navy w-full text-left flex items-start gap-3 border-danger/30 hover:border-danger/50 tactile-btn"
        >
          <AlertTriangle size={20} className="text-danger-dark shrink-0 mt-0.5" />
          <div className="flex-1">
            <div className="text-sm font-medium text-navy-50">{error}</div>
            <div className="text-sm text-danger-dark font-medium mt-1 inline-flex items-center gap-1">
              <RefreshCw size={11} />
              <span>{labels.retry}</span>
            </div>
          </div>
        </button>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="card-navy animate-pulse h-20 flex items-center gap-3"
            >
              <div className="w-10 h-10 rounded-full bg-navy-800" />
              <div className="flex-1 space-y-2">
                <div className="h-3 w-1/2 bg-navy-800 rounded" />
                <div className="h-2 w-1/3 bg-navy-800 rounded" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Results list */}
      {!loading && !error && coords && filteredPlaces.length > 0 && (
        <div className="space-y-2">
          {filteredPlaces.map((p) => {
            const isSelected = selectedId === p.id;
            return (
              <div
                key={p.id}
                className={`card-navy transition-colors ${
                  isSelected ? 'border-accent/60 bg-accent/5' : ''
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                  <button
                    onClick={() => handleSelectFromList(p)}
                    className="flex items-start gap-3 flex-1 min-w-0 text-left tactile-btn"
                    style={{ minHeight: 64 }}
                  >
                    <div
                      className="w-10 h-10 rounded-card flex items-center justify-center shrink-0 border"
                      style={{
                        background: `${AMENITY_COLORS[p.amenity]}1a`,
                        borderColor: `${AMENITY_COLORS[p.amenity]}55`,
                      }}
                    >
                      {amenityIcon(p.amenity)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-navy-50 truncate">
                        {p.name}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-medium text-navy-100">
                        <span className="inline-flex items-center gap-1 text-accent">
                          <Navigation size={11} />
                          {formatDistance(p.distanceMeters)}
                        </span>
                        {p.phone && (
                          <span className="inline-flex items-center gap-1 text-navy-100">
                            <Phone size={11} />
                            <span className="truncate max-w-[160px]">{p.phone}</span>
                          </span>
                        )}
                        {p.openingHours && (
                          <span className="inline-flex items-center gap-1 text-navy-700">
                            <Clock size={11} />
                            <span className="truncate max-w-[180px]">{p.openingHours}</span>
                          </span>
                        )}
                      </div>
                    </div>
                  </button>

                  <div className="flex items-center gap-2 shrink-0">
                    {p.phone && (
                      <a
                        href={`tel:${p.phone}`}
                        className="inline-flex items-center gap-1.5 bg-navy-900 hover:bg-navy-850 border border-navy-800 text-navy-50 text-xs font-medium px-3 rounded-card tactile-btn"
                        style={{ minHeight: 48 }}
                      >
                        <Phone size={13} />
                        <span>{labels.call}</span>
                      </a>
                    )}
                    <a
                      href={directionsUrl(p.lat, p.lng)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 bg-accent hover:bg-accent-dark text-white text-sm font-medium px-4 rounded-card shadow-soft tactile-btn"
                      style={{ minHeight: 48 }}
                    >
                      <Navigation size={13} />
                      <span>{labels.directions}</span>
                    </a>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && coords && filteredPlaces.length === 0 && (
        <div className="card-navy text-center py-8">
          <MapPin size={28} className="mx-auto mb-2 text-navy-700 opacity-50" />
          <p className="text-sm font-medium text-navy-100">{labels.none}</p>
        </div>
      )}
    </div>
  );
};

export default NearbyCare;
