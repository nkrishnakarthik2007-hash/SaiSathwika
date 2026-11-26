import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from './lib/supabase';
import { ArrowLeft, CheckCircle2, Clock3, MapPin, Navigation, Phone, RefreshCw, Truck } from 'lucide-react';

type DeliveryOrder = {
  id: string;
  order_number: number;
  status: string;
  total: number;
  payment_method: string;
  payment_status: string;
  created_at: string;
  delivery_address_snapshot: { recipient_name?: string; phone?: string; address_line?: string; landmark?: string; latitude?: number; longitude?: number };
  order_items?: { product_name_snapshot: string; quantity: number }[];
};
type Assignment = { order_id: string; assigned_at: string; orders: DeliveryOrder | DeliveryOrder[] | null };

export default function DeliveryDashboard({ onSignOut }: { onSignOut: () => void }) {
  const [orders, setOrders] = useState<DeliveryOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyOrder, setBusyOrder] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [locationState, setLocationState] = useState('Location sharing is off');

  const refresh = useCallback(async () => {
    if (!supabase) return;
    const { data, error } = await supabase
      .from('order_assignments')
      .select('order_id,assigned_at,orders(id,order_number,status,total,payment_method,payment_status,created_at,delivery_address_snapshot,order_items(product_name_snapshot,quantity))')
      .order('assigned_at', { ascending: false });
    if (error) setMessage(error.message);
    else {
      const rows = (data ?? []) as unknown as Assignment[];
      setOrders(rows.map(row => Array.isArray(row.orders) ? row.orders[0] : row.orders).filter((order): order is DeliveryOrder => !!order && !['delivered','cancelled'].includes(order.status)));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 12000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const activeOrder = useMemo(() => orders.find(order => order.status === 'out_for_delivery') ?? null, [orders]);

  useEffect(() => {
    if (!activeOrder || !supabase) {
      setLocationState('Location sharing is off');
      return;
    }
    if (!navigator.geolocation) {
      setLocationState('GPS is not available on this device');
      return;
    }
    setLocationState('Waiting for GPS permission…');
    const watchId = navigator.geolocation.watchPosition(async position => {
      const { error } = await supabase!.rpc('record_delivery_location', {
        p_order_id: activeOrder.id,
        p_latitude: position.coords.latitude,
        p_longitude: position.coords.longitude,
        p_accuracy_m: position.coords.accuracy
      });
      setLocationState(error ? 'Could not share location: ' + error.message : 'Sharing live location for this delivery');
    }, error => {
      setLocationState(error.code === 1 ? 'Location permission denied' : 'GPS signal unavailable. Keep the app open and try again.');
    }, { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 });
    return () => navigator.geolocation.clearWatch(watchId);
  }, [activeOrder?.id]);

  async function runAction(order: DeliveryOrder, action: 'start_assigned_delivery' | 'complete_assigned_delivery') {
    if (!supabase) return;
    setBusyOrder(order.id);
    setMessage('');
    const { error } = await supabase.rpc(action, { p_order_id: order.id });
    if (error) setMessage(error.message);
    else setMessage(action === 'start_assigned_delivery' ? 'Delivery started. Keep Sai Sathwika open to share your live location.' : 'Order marked as delivered.');
    await refresh();
    setBusyOrder(null);
  }

  function openNavigation(order: DeliveryOrder) {
    const address = order.delivery_address_snapshot;
    const destination = typeof address.latitude === 'number' && typeof address.longitude === 'number'
      ? `${address.latitude},${address.longitude}`
      : [address.address_line, address.landmark].filter(Boolean).join(', ');
    if (!destination) { setMessage('This order does not have a delivery address.'); return; }
    window.open('https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(destination) + '&travelmode=driving', '_blank', 'noopener,noreferrer');
  }

  return <main className="delivery-portal">
    <header className="delivery-header">
      <div className="delivery-brand"><span className="delivery-mark">S</span><div><strong>Sai Sathwika</strong><small>DELIVERY PARTNER</small></div></div>
      <button type="button" onClick={onSignOut}>Sign out</button>
    </header>
    <section className="delivery-welcome">
      <span className="eyebrow">YOUR DELIVERY DESK</span>
      <h1>Good day. Ready to deliver?</h1>
      <p>Only orders assigned to your account appear here.</p>
      <div className="delivery-live-state"><span className={activeOrder ? 'delivery-live-dot on' : 'delivery-live-dot'}/>{locationState}</div>
    </section>
    <section className="delivery-list">
      <div className="delivery-list-heading"><div><span className="eyebrow">ASSIGNED TO YOU</span><h2>Your deliveries</h2></div><button type="button" onClick={() => void refresh()}><RefreshCw size={16}/> Refresh</button></div>
      {message && <div className="delivery-message" role="status">{message}</div>}
      {loading ? <div className="delivery-empty"><Clock3/> Loading assigned orders…</div> :
        orders.length === 0 ? <div className="delivery-empty"><Truck/><strong>No active deliveries</strong><span>New assignments from the shop will appear here automatically.</span></div> :
        orders.map(order => {
          const address = order.delivery_address_snapshot ?? {};
          const phone = (address.phone ?? '').replace(/[^+0-9]/g, '');
          return <article className="delivery-order-card" key={order.id}>
            <div className="delivery-order-top"><div><small>ORDER NUMBER</small><strong>#{order.order_number}</strong></div><span className={'delivery-status '+order.status}>{order.status.replaceAll('_',' ')}</span></div>
            <div className="delivery-customer"><strong>{address.recipient_name || 'Customer'}</strong><span>{address.address_line || 'Address not available'}{address.landmark ? ' · ' + address.landmark : ''}</span></div>
            <div className="delivery-items">{(order.order_items ?? []).map((item,index) => <span key={index}>{item.product_name_snapshot} × {item.quantity}</span>)}</div>
            <div className="delivery-order-footer"><div className="delivery-amount"><strong>₹{Number(order.total).toFixed(2)}</strong><span className={'delivery-payment '+(order.payment_status==='paid'?'paid':'pending')}><span>{order.payment_status==='paid'?'Paid':order.payment_method==='cash_on_delivery'?'Collect cash':'Payment pending'}</span><small>{order.payment_method==='cash_on_delivery'?'Cash on delivery':order.payment_method==='online'?'Online payment':'Payment method unavailable'}</small></span></div><span>{new Date(order.created_at).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</span></div>
            <div className="delivery-actions">
              {phone && <a href={'tel:'+phone}><Phone size={16}/> Call customer</a>}
              <button type="button" onClick={() => openNavigation(order)}><Navigation size={16}/> Navigate</button>
              {order.status === 'preparing' && <button className="delivery-primary" type="button" disabled={busyOrder===order.id} onClick={() => void runAction(order,'start_assigned_delivery')}>{busyOrder===order.id?'Starting…':'Start delivery'}</button>}
              {order.status === 'out_for_delivery' && <button className="delivery-primary" type="button" disabled={busyOrder===order.id} onClick={() => void runAction(order,'complete_assigned_delivery')}><CheckCircle2 size={16}/>{busyOrder===order.id?'Updating…':'Mark delivered'}</button>}
            </div>
          </article>;
        })}
    </section>
    <p className="delivery-privacy-note">Live location is shared only while you have an active assigned delivery and keep this screen open. Sharing stops when the delivery is completed or you leave this screen.</p>
  </main>;
}
