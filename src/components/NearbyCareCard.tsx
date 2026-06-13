import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  MapPin,
  ArrowRight,
  Hospital,
  Stethoscope,
  Pill,
  Crosshair,
  AlertTriangle,
  Loader2,
  Navigation,
} from 'lucide-react';
import { useSettings } from '../context/SettingsContext';
import { getCurrentPositionSafe } from '../services/sosService';
import {
  fetchNearbyPlaces,
  formatDistance,
  type Amenity,
  type Place,
} from '../services/overpassService';

interface NearbyCareCardProps {
  onOpen?: () => void;
}

const AMENITY_COLORS: Record<Amenity, string> = {
  hospital: '#ef4444',
  clinic: '#f59e0b',
  pharmacy: '#10b981',
};

const PREVIEW_PLACE_LIMIT = 8;
const LIST_PLACE_LIMIT = 3;

const amenityIcon = (a: Amenity, size = 12) => {
  const cls = 'shrink-0';
  if (a === 'hospital') return <Hospital size={size} className={cls} style={{ color: AMENITY_COLORS.hospital }} />;
  if (a === 'clinic') return <Stethoscope size={size} className={cls} style={{ color: AMENITY_COLORS.clinic }} />;
  return <Pill size={size} className={cls} style={{ color: AMENITY_COLORS.pharmacy }} />;
};

const makeDivIcon = (color: string): L.DivIcon =>
  L.divIcon({
    className: 'pulse-amenity-marker',
    html: `<span style="
      display:block;width:16px;height:16px;border-radius:9999px;
      background:${color};border:2px solid #ffffff;
      box-shadow:0 1px 4px rgba(0,0,0,0.4);"></span>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });

/**
 * Compact dashboard preview window for the Nearby Care feature.
 * Embeds a small non-interactive Leaflet map and the three nearest
 * places. The whole card is clickable: tapping anywhere opens the
 * full Nearby Care tab via the parent's `onOpen` handler.
 */
export const NearbyCareCard: React.FC<NearbyCareCardProps> = ({ onOpen }) => {
  const { language } = useSettings();

  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [denied, setDenied] = useState(false);
  const [places, setPlaces] = useState<Place[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const mapDivRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const placeLayerRef = useRef<L.LayerGroup | null>(null);

  const labels = (() => {
    if (language === 'hi') {
      return {
        title: 'पास की देखभाल',
        subtitle: 'पास के अस्पताल, क्लिनिक और फार्मेसी',
        openFull: 'पूरा देखें',
        loading: 'पास की जगहें ढूँढ रहे हैं…',
        denied: 'पास की जगहें देखने के लिए लोकेशन चालू करें',
        error: 'अभी लोड नहीं हो सका',
        none: 'पास में कुछ नहीं मिला',
        chips: ['अस्पताल', 'क्लिनिक', 'फार्मेसी'],
      };
    }
    if (language === 'ta') {
      return {
        title: 'அருகிலுள்ள கவனிப்பு',
        subtitle: 'அருகிலுள்ள மருத்துவமனைகள், கிளினிக்குகள், மருந்தகங்கள்',
        openFull: 'முழுவதையும் பார்',
        loading: 'அருகிலுள்ள இடங்களைக் கண்டறிகிறோம்…',
        denied: 'அருகிலுள்ள இடங்களைக் காண இடத்தை இயக்கவும்',
        error: 'இப்போது ஏற்ற முடியவில்லை',
        none: 'அருகில் எதுவும் கிடைக்கவில்லை',
        chips: ['மருத்துவமனை', 'கிளினிக்', 'மருந்தகம்'],
      };
    }
    return {
      title: 'Nearby Care',
      subtitle: 'Hospitals, clinics & pharmacies around you',
      openFull: 'Open full map',
      loading: 'Finding nearby places…',
      denied: 'Enable location to preview nearby care',
      error: "Couldn't load preview",
      none: 'No places found nearby',
      chips: ['Hospitals', 'Clinics', 'Pharmacies'],
    };
  })();

  /* ===== Geolocation on mount ===== */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const pos = await getCurrentPositionSafe();
      if (cancelled) return;
      if (!pos) {
        setDenied(true);
        setLoading(false);
        return;
      }
      setCoords(pos);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /* ===== Overpass fetch when coords resolve ===== */
  useEffect(() => {
    if (!coords) return;
    const ac = new AbortController();
    setLoading(true);
    setError(false);
    fetchNearbyPlaces(coords.lat, coords.lng, ac.signal)
      .then((res) => {
        if (ac.signal.aborted) return;
        setPlaces(res);
      })
      .catch((err) => {
        if (ac.signal.aborted) return;
        console.warn('[NearbyCareCard] overpass failed', err);
        setError(true);
        setPlaces([]);
      })
      .finally(() => {
        if (ac.signal.aborted) return;
        setLoading(false);
      });
    return () => ac.abort();
  }, [coords]);

  /* ===== Mini-map init / teardown ===== */
  useEffect(() => {
    if (!coords || !mapDivRef.current) return;
    if (mapRef.current) {
      mapRef.current.setView([coords.lat, coords.lng], 14);
      return;
    }

    // Non-interactive preview: kill dragging, zoom, keyboard, scroll.
    const map = L.map(mapDivRef.current, {
      center: [coords.lat, coords.lng],
      zoom: 14,
      zoomControl: false,
      attributionControl: false,
      dragging: false,
      scrollWheelZoom: false,
      doubleClickZoom: false,
      boxZoom: false,
      keyboard: false,
      touchZoom: false,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map);

    L.circleMarker([coords.lat, coords.lng], {
      radius: 7,
      color: '#3b82f6',
      fillColor: '#3b82f6',
      fillOpacity: 0.7,
      weight: 2,
    }).addTo(map);

    placeLayerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      placeLayerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!coords]);

  /* ===== Render the markers on the mini-map ===== */
  useEffect(() => {
    const layer = placeLayerRef.current;
    if (!layer) return;
    layer.clearLayers();
    places.slice(0, PREVIEW_PLACE_LIMIT).forEach((p) => {
      L.marker([p.lat, p.lng], {
        icon: makeDivIcon(AMENITY_COLORS[p.amenity]),
        interactive: false,
        keyboard: false,
      }).addTo(layer);
    });
  }, [places]);

  const handleClick = () => {
    onOpen?.();
  };

  const top3 = places.slice(0, LIST_PLACE_LIMIT);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleClick();
        }
      }}
      className="card-navy cursor-pointer transition-colors hover:border-accent/40 focus:outline-none focus:border-accent/60 group"
    >
      {/* Header */}
      <div className="flex items-start gap-3 mb-3">
        <div className="w-11 h-11 rounded-card bg-accent/10 border border-accent/30 flex items-center justify-center text-accent shrink-0">
          <MapPin size={20} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-base font-medium text-navy-50 truncate">{labels.title}</div>
          <p className="text-xs text-navy-700 leading-snug truncate">
            {labels.subtitle}
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 text-accent font-medium text-xs uppercase tracking-wider shrink-0 group-hover:translate-x-0.5 transition-transform">
          <span className="hidden sm:inline">{labels.openFull}</span>
          <ArrowRight size={14} />
        </span>
      </div>

      {/* ===== Preview body ===== */}
      {denied ? (
        <div className="bg-navy-950 border border-dashed border-navy-800 rounded-card p-4 flex items-center gap-3">
          <div className="w-12 h-12 rounded-card bg-danger-light border border-danger/30 flex items-center justify-center text-danger-dark shrink-0">
            <Crosshair size={18} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-navy-50">{labels.denied}</div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-medium text-navy-100">
              <span className="inline-flex items-center gap-1">
                <Hospital size={14} className="text-danger" />
                <span>{labels.chips[0]}</span>
              </span>
              <span className="inline-flex items-center gap-1">
                <Stethoscope size={14} className="text-warning-dark" />
                <span>{labels.chips[1]}</span>
              </span>
              <span className="inline-flex items-center gap-1">
                <Pill size={14} className="text-success-dark" />
                <span>{labels.chips[2]}</span>
              </span>
            </div>
          </div>
        </div>
      ) : error ? (
        <div className="bg-danger-light border border-danger/30 rounded-card p-3 flex items-center gap-2">
          <AlertTriangle size={16} className="text-danger-dark shrink-0" />
          <span className="text-xs font-medium text-navy-50">{labels.error}</span>
        </div>
      ) : (
        <>
          {/* Mini map (or skeleton) */}
          <div className="relative h-[180px] rounded-card overflow-hidden border border-navy-800 bg-navy-900">
            {(loading || !coords) && (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-navy-900/80">
                <div className="flex items-center gap-2 text-navy-700">
                  <Loader2 size={16} className="animate-spin text-accent" />
                  <span className="text-xs font-medium">{labels.loading}</span>
                </div>
              </div>
            )}
            <div ref={mapDivRef} className="absolute inset-0" />
            <span className="absolute bottom-1 right-1.5 text-xs text-white font-medium pointer-events-none bg-navy-50/70 px-1.5 py-0.5 rounded-md">
              © OpenStreetMap
            </span>
          </div>

          {/* Top 3 places */}
          {!loading && top3.length > 0 && (
            <ul className="mt-3 space-y-1.5">
              {top3.map((p) => (
                <li
                  key={p.id}
                  className="flex items-center gap-2 bg-navy-950 border border-navy-800 rounded-card px-3 py-2"
                >
                  <span
                    className="w-7 h-7 rounded-card flex items-center justify-center shrink-0 border"
                    style={{
                      background: `${AMENITY_COLORS[p.amenity]}1a`,
                      borderColor: `${AMENITY_COLORS[p.amenity]}55`,
                    }}
                  >
                    {amenityIcon(p.amenity)}
                  </span>
                  <span className="flex-1 min-w-0 text-xs font-medium text-navy-50 truncate">
                    {p.name}
                  </span>
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-accent shrink-0">
                    <Navigation size={10} />
                    {formatDistance(p.distanceMeters)}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {!loading && coords && top3.length === 0 && !error && (
            <div className="mt-3 text-center text-xs font-medium text-navy-700 py-2">
              {labels.none}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default NearbyCareCard;
