import { useEffect, useRef, useState } from 'react';
import { Map as MapLibreMap, Marker, NavigationControl, setWorkerUrl } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import 'maplibre-gl/dist/maplibre-gl.css';
import { ArrowLeft, LocateFixed, Search, X } from 'lucide-react';

setWorkerUrl(workerUrl);

type Coordinates = { latitude: number; longitude: number };

export default function MapPicker({ initial, onConfirm, onClose }: {
  initial: Coordinates;
  onConfirm: (point: Coordinates) => void;
  onClose: () => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);
  const marker = useRef<Marker | null>(null);
  const point = useRef<Coordinates>(initial);
  const [selected, setSelected] = useState<Coordinates>(initial);
  const [search, setSearch] = useState('');
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!container.current) return;
    const instance = new MapLibreMap({
      container: container.current,
      style: 'https://tiles.openfreemap.org/styles/liberty',
      center: [initial.longitude, initial.latitude],
      zoom: 16,
      attributionControl: true,
    });
    map.current = instance;
    marker.current = new Marker({ color: '#087c34', draggable: true })
      .setLngLat([initial.longitude, initial.latitude]).addTo(instance);
    marker.current.on('dragend', () => {
      const pos = marker.current!.getLngLat();
      const next = { latitude: pos.lat, longitude: pos.lng };
      point.current = next;
      setSelected(next);
    });
    instance.addControl(new NavigationControl({ showCompass: true }), 'bottom-right');
    return () => { marker.current?.remove(); instance.remove(); map.current = null; };
  }, []);

  async function findPlace() {
    const q = search.trim();
    if (!q) return;
    setSearching(true); setError('');
    try {
      const response = await fetch('https://photon.komoot.io/api/?limit=1&lang=en&q=' + encodeURIComponent(q));
      if (!response.ok) throw new Error('Search is temporarily unavailable.');
      const data = await response.json();
      const feature = data.features?.[0];
      if (!feature) throw new Error('No matching place found. Try a nearby landmark.');
      const [longitude, latitude] = feature.geometry.coordinates as [number, number];
      const next = { latitude, longitude };
      point.current = next; setSelected(next);
      marker.current?.setLngLat([longitude, latitude]);
      map.current?.flyTo({ center: [longitude, latitude], zoom: 17, essential: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not search this place.');
    } finally { setSearching(false); }
  }

  function locateMe() {
    if (!navigator.geolocation) { setError('Location is not supported on this device.'); return; }
    setError('');
    navigator.geolocation.getCurrentPosition(pos => {
      const next = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
      point.current = next; setSelected(next);
      marker.current?.setLngLat([next.longitude, next.latitude]);
      map.current?.flyTo({ center: [next.longitude, next.latitude], zoom: 17, essential: true });
    }, () => setError('Could not get your location. Please allow location access and try again.'), { enableHighAccuracy: true, timeout: 15000 });
  }

  return <div className="map-picker-backdrop" role="dialog" aria-modal="true" aria-label="Choose delivery location">
    <section className="map-picker">
      <header><button onClick={onClose} aria-label="Back"><ArrowLeft size={19}/></button><div><strong>Pin your delivery location</strong><small>Move the pin to your exact doorstep</small></div><button onClick={onClose} aria-label="Close"><X size={19}/></button></header>
      <form className="map-search" onSubmit={e => { e.preventDefault(); void findPlace(); }}>
        <Search size={18}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search area, street or landmark"/><button disabled={searching}>{searching?'...':'Search'}</button>
      </form>
      <div className="map-picker-canvas" ref={container}/>
      {error && <p className="map-picker-error">{error}</p>}
      <div className="map-picker-bottom"><button className="map-locate" onClick={locateMe}><LocateFixed size={17}/> Use my location</button><div><small>PIN COORDINATES</small><span>{selected.latitude.toFixed(6)}, {selected.longitude.toFixed(6)}</span></div><button className="map-confirm" onClick={()=>onConfirm(point.current)}>Confirm location</button></div>
      <p className="map-attribution">© OpenStreetMap contributors · Maps by OpenFreeMap · Powered by MapLibre</p>
    </section>
  </div>;
}
