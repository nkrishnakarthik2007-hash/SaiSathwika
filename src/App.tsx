import { useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { ArrowRight, CheckCircle2, Clock3, IceCream, Leaf, MapPin, Milk, Search, ShieldCheck, ShoppingBag, UserRound, X, Minus, Plus, PackageCheck, LocateFixed } from 'lucide-react';
import { isSupabaseConfigured, supabase } from './lib/supabase';
import AdminDashboard from './AdminDashboard';

type Product = { id: string; category_id?: string | null; name: string; price: number; mrp: number | null; image_urls: string[]; variant_label: string | null; unit: string | null; brands?: { name: string }[] | null };
type Category = { id: string; name: string };

const categoryIcons = [Milk, Leaf, IceCream, Milk];
const fallbackCategories = ['Milk & Varieties', 'Curd & Buttermilk', 'Ice Creams', 'Butter, Ghee & Paneer'];

export default function App() {
  const [query, setQuery] = useState('');
  const [activeCategory,setActiveCategory]=useState<string|null>(null);
  const [cart, setCart] = useState<Record<string, number>>(() => {
    try { const saved=localStorage.getItem('sai-sathwika-cart'); return saved ? JSON.parse(saved) as Record<string,number> : {}; }
    catch { return {}; }
  });
  const [session, setSession] = useState<Session | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loginOpen, setLoginOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');
  const [adminRole, setAdminRole] = useState('customer');
  const [adminView, setAdminView] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [address, setAddress] = useState({recipient_name:'',phone:'',address_line:'',landmark:''});
  const [coords, setCoords] = useState<{latitude:number;longitude:number}|null>(null);
  const [locationBusy, setLocationBusy] = useState(false);
  const [customerOrders, setCustomerOrders] = useState<any[]>([]);
  const [ordersOpen, setOrdersOpen] = useState(false);
  const [customerNote, setCustomerNote] = useState('');

  useEffect(() => {
    try { localStorage.setItem('sai-sathwika-cart',JSON.stringify(cart)); } catch { /* storage may be unavailable */ }
  }, [cart]);

  useEffect(() => {
    if (!supabase) { setLoading(false); return; }
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); if(data.session) void loadRole(data.session.user.id); });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => { setSession(next); if(next) void loadRole(next.user.id); else { setAdminRole('customer'); setAdminView(false); } });
    return () => listener.subscription.unsubscribe();
  }, []);

  async function loadRole(userId: string) {
    if(!supabase)return;
    const {data}=await supabase.from('profiles').select('role').eq('id',userId).maybeSingle();
    setAdminRole(data?.role ?? 'customer');
  }

  useEffect(() => {
    if (!supabase) return;
    let alive = true;
    Promise.all([
      supabase.from('products').select('id,category_id,name,price,mrp,image_urls,variant_label,unit,brands(name)').eq('is_available', true).gt('stock_quantity', 0).order('sort_order'),
      supabase.from('categories').select('id,name').eq('is_active', true).order('sort_order'),
    ]).then(([productResult, categoryResult]) => {
      if (!alive) return;
      if (!productResult.error) setProducts((productResult.data ?? []) as Product[]);
      if (!categoryResult.error) setCategories(categoryResult.data ?? []);
      setLoading(false);
    });
    return () => { alive = false; };
  }, []);

  const cartCount = Object.values(cart).reduce((a, b) => a + b, 0);
  const cartProducts = products.filter(p => cart[p.id]);
  const cartSubtotal = cartProducts.reduce((sum,p) => sum + Number(p.price) * (cart[p.id] ?? 0), 0);
  const changeQty = (id:string, delta:number) => setCart(current => {
    const next={...current}; const qty=(next[id] ?? 0)+delta;
    if(qty<=0) delete next[id]; else next[id]=qty;
    return next;
  });
  async function loadOrders() {
    if(!supabase || !session) return;
    const {data,error}=await supabase.from('orders').select('id,order_number,status,total,created_at,order_items(product_name_snapshot,quantity,line_total)').eq('customer_id',session.user.id).order('created_at',{ascending:false}).limit(20);
    if(error) setNotice(error.message); else setCustomerOrders(data ?? []);
  }
  function captureLocation() {
    if(!navigator.geolocation){setNotice('Location is not supported on this device.');return;}
    setLocationBusy(true);
    navigator.geolocation.getCurrentPosition(pos=>{
      setCoords({latitude:pos.coords.latitude,longitude:pos.coords.longitude});
      setLocationBusy(false); setNotice('Delivery location captured.');
    },err=>{
      setLocationBusy(false);
      setNotice(err.code===1?'Please allow location access to verify delivery.':'Could not get your location. Try again outdoors.');
    },{enableHighAccuracy:true,timeout:15000,maximumAge:60000});
  }
  async function placeOrder() {
    if(!supabase || !session){setCartOpen(false);setLoginOpen(true);return;}
    if(!cartProducts.length){setNotice('Your cart is empty.');return;}
    if(!address.recipient_name.trim() || !address.phone.trim() || !address.address_line.trim()){setNotice('Enter your name, phone number and delivery address.');return;}
    if(!coords){setNotice('Capture your delivery location before placing the order.');return;}
    setCheckoutBusy(true);
    try {
      const {data:addressRow,error:addressError}=await supabase.from('customer_addresses').insert({
        customer_id:session.user.id,label:'Home',recipient_name:address.recipient_name.trim(),phone:address.phone.trim(),
        address_line:address.address_line.trim(),landmark:address.landmark.trim()||null,
        latitude:coords.latitude,longitude:coords.longitude,is_default:true
      }).select('id').single();
      if(addressError) throw addressError;
      const items=cartProducts.map(p=>({product_id:p.id,quantity:cart[p.id]}));
      const {data,error}=await supabase.rpc('place_order',{p_items:items,p_address_id:addressRow.id,p_customer_note:customerNote.trim()||null});
      if(error) throw error;
      const result=Array.isArray(data)?data[0]:data;
      setCart({}); setCartOpen(false); setCustomerNote('');
      setNotice(result?.order_number ? `Order #${result.order_number} placed successfully!` : 'Your order was placed successfully!');
      await loadOrders();
    } catch(error:any) { setNotice(error?.message ?? 'Could not place your order. Please try again.'); }
    finally { setCheckoutBusy(false); }
  }
  const filtered = useMemo(() => products.filter(p => (!activeCategory || p.category_id===activeCategory) && (p.name.toLowerCase().includes(query.toLowerCase()) || (p.brands?.[0]?.name ?? '').toLowerCase().includes(query.toLowerCase()))), [products, query, activeCategory]);

  async function signIn() {
    if (!supabase) { setNotice('The shop database is being connected. Please check back soon.'); return; }
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
    if (error) setNotice(error.message);
  }

  if(adminView && ['admin','super_admin'].includes(adminRole)) return <AdminDashboard onBack={()=>setAdminView(false)}/>;

  return <main>
    <div className="announcement">Fresh dairy from your neighbourhood · Free delivery at launch</div>
    <header className="header shell">
      <a className="brand" href="#"><span className="brand-mark">S</span><span><strong>Sai Sathwika</strong><small>AUTHORISED HERITAGE OUTLET</small></span></a>
      <div className="location"><MapPin size={17}/><span><small>DELIVERING TO</small><strong>Select your address</strong></span></div>
      <div className="header-actions">
        <button className="account" onClick={() => session ? supabase?.auth.signOut() : setLoginOpen(true)}><UserRound size={17}/>{session ? 'Sign out' : 'Sign in'}</button>
        {['admin','super_admin'].includes(adminRole) && <button className="account" onClick={()=>setAdminView(true)}><ShieldCheck size={17}/> Admin</button>}
        <button className="cart" onClick={() => setCartOpen(true)}><ShoppingBag size={19}/> Cart <b>{cartCount}</b></button>
      </div>
    </header>

    <section className="hero shell">
      <div className="hero-copy">
        <span className="eyebrow"><span className="dot"/> YOUR NEIGHBOURHOOD DAIRY STORE</span>
        <h1>Goodness that<br/><em>comes to you.</em></h1>
        <p>Your daily dairy favourites, ice creams and more — fresh from Sai Sathwika to your doorstep.</p>
        <div className="hero-actions"><a className="primary" href="#shop">Explore products <ArrowRight size={17}/></a><span><ShieldCheck size={17}/> Local. Fresh. Convenient.</span></div>
      </div>
      <div className="hero-art"><div className="sun"></div><div className="leaf leaf-one"></div><div className="leaf leaf-two"></div><div className="milk-pack"><span>Heritage</span><strong>Fresh<br/>Milk</strong><small>PURE DAIRY GOODNESS</small></div><div className="curd-pot"><span>✳</span><strong>Curd</strong></div><div className="ice-cream">🍦</div><div className="art-caption">A little freshness, every day.</div></div>
    </section>

    <section className="benefits shell">
      <div><MapPin/><span><strong>Neighbourhood delivery</strong><small>2 km service area to start</small></span></div>
      <div><Clock3/><span><strong>Easy ordering</strong><small>Order in just a few taps</small></span></div>
      <div><ShieldCheck/><span><strong>Trusted local store</strong><small>Personal service, every time</small></span></div>
    </section>

    <section className="shop shell" id="shop">
      <div className="section-heading"><div><span className="eyebrow">THE GOODNESS COLLECTION</span><h2>Shop by category</h2></div><span className="muted">Fresh picks from your local store</span></div>
      <div className="search"><Search size={19}/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search products or brands..."/></div>
      <div className="categories">
        {(categories.length ? categories : fallbackCategories.map((name, i) => ({id: String(i), name}))).map((category, i) => { const Icon = categoryIcons[i % categoryIcons.length]; return <article className={activeCategory===category.id?"category active-category":"category"} key={category.id} onClick={()=>setActiveCategory(activeCategory===category.id?null:category.id)} role="button" tabIndex={0} onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();setActiveCategory(activeCategory===category.id?null:category.id);}}}><div className="category-icon"><Icon size={29}/></div><div><h3>{category.name}</h3><p>Explore our {category.name.toLowerCase()}</p></div><ArrowRight className="category-arrow" size={18}/></article>; })}
      </div>
      <div className="section-heading product-heading"><div><span className="eyebrow">SHOP YOUR FAVOURITES</span><h2>Available products</h2></div><span className="muted">{activeCategory?categories.find(x=>x.id===activeCategory)?.name+" · ":""}{filtered.length} products {activeCategory&&<button className="clear-filter" onClick={()=>setActiveCategory(null)}>Clear filter</button>}</span></div>
      {!isSupabaseConfigured && <div className="empty-products"><div className="empty-icon"><ShoppingBag size={25}/></div><h3>We're getting the shop ready</h3><p>Product catalogue and sign-in will become live when the secure shop connection is configured.</p></div>}
      {isSupabaseConfigured && loading && <p className="loading-text">Loading fresh picks…</p>}
      {isSupabaseConfigured && !loading && products.length === 0 && <div className="empty-products"><div className="empty-icon"><ShoppingBag size={25}/></div><h3>Products are coming soon</h3><p>Our team is preparing the catalogue. Check back soon for fresh milk, curd, ice creams and more.</p></div>}
      {filtered.length > 0 && <div className="product-grid">{filtered.map(product => <article className="product-card" key={product.id}><div className="product-photo">{product.image_urls?.[0] ? <img src={product.image_urls[0]} alt={product.name}/> : <div className="photo-placeholder"><Milk size={35}/></div>}</div><div className="product-info"><small>{product.brands?.[0]?.name ?? 'Sai Sathwika'}</small><h3>{product.name}</h3><p>{[product.variant_label, product.unit].filter(Boolean).join(' · ')}</p><div className="product-bottom"><strong>₹{Number(product.price).toFixed(2)}</strong><button onClick={() => setCart(c => ({...c, [product.id]: (c[product.id] ?? 0) + 1}))}>Add +</button></div></div></article>)}</div>}
    </section>

    <footer><div className="shell footer-inner"><div className="brand footer-brand"><span className="brand-mark">S</span><span><strong>Sai Sathwika</strong><small>AUTHORISED HERITAGE OUTLET</small></span></div><p>Made with care for your neighbourhood.</p><small>© {new Date().getFullYear()} Sai Sathwika</small></div></footer>

    {cartOpen && <div className="modal-backdrop" onClick={()=>setCartOpen(false)}><section className="cart-modal" onClick={e=>e.stopPropagation()}>
      <div className="cart-modal-head"><div><span className="eyebrow">YOUR BASKET</span><h2>Shopping cart <small>({cartCount} items)</small></h2></div><button className="modal-close" onClick={()=>setCartOpen(false)}><X/></button></div>
      {cartProducts.length===0 ? <div className="cart-empty"><ShoppingBag size={34}/><h3>Your cart is empty</h3><p>Add a few favourites to get started.</p><button className="primary" onClick={()=>setCartOpen(false)}>Continue shopping</button></div> :
      <>
        <div className="cart-lines">{cartProducts.map(p=><article className="cart-line" key={p.id}><div className="cart-thumb">{p.image_urls?.[0]?<img src={p.image_urls[0]} alt=""/>:<Milk/>}</div><div className="cart-line-info"><strong>{p.name}</strong><small>₹{Number(p.price).toFixed(2)} each</small><b>₹{(Number(p.price)*(cart[p.id]??0)).toFixed(2)}</b></div><div className="qty-control"><button onClick={()=>changeQty(p.id,-1)} aria-label="Decrease quantity"><Minus size={14}/></button><b>{cart[p.id]}</b><button onClick={()=>changeQty(p.id,1)} aria-label="Increase quantity"><Plus size={14}/></button></div></article>)}</div>
        <div className="cart-total"><span>Subtotal</span><strong>₹{cartSubtotal.toFixed(2)}</strong></div>
        {!session ? <div className="checkout-signin"><p>Sign in with Google to continue to delivery details and checkout.</p><button className="google-button" onClick={signIn}>Continue with Google</button></div> :
        <div className="checkout-form"><h3>Delivery details</h3>
          <label>Your name<input value={address.recipient_name} onChange={e=>setAddress(a=>({...a,recipient_name:e.target.value}))} placeholder="Recipient name"/></label>
          <label>Phone number<input value={address.phone} onChange={e=>setAddress(a=>({...a,phone:e.target.value}))} inputMode="tel" placeholder="10-digit mobile number"/></label>
          <label>Full delivery address<input value={address.address_line} onChange={e=>setAddress(a=>({...a,address_line:e.target.value}))} placeholder="House / flat, street, area"/></label>
          <label>Landmark (optional)<input value={address.landmark} onChange={e=>setAddress(a=>({...a,landmark:e.target.value}))} placeholder="Nearby landmark"/></label>
          <button className={coords?'location-captured':'location-button'} onClick={captureLocation} disabled={locationBusy}><LocateFixed size={17}/>{locationBusy?'Getting location…':coords?'Delivery location captured':'Use my current location'}</button>
          <label>Note for the store (optional)<textarea value={customerNote} onChange={e=>setCustomerNote(e.target.value)} placeholder="Any delivery instructions?"/></label>
          <button className="place-order-button" onClick={placeOrder} disabled={checkoutBusy}>{checkoutBusy?'Placing order…': 'Place order · ₹'+cartSubtotal.toFixed(2)}</button>
          <small className="checkout-footnote">Cash on delivery. Final delivery eligibility and charges are verified securely by the store.</small>
        </div>}
      </>}
    </section></div>}
    {session && <section className="orders-strip shell"><button onClick={()=>{setOrdersOpen(v=>!v);if(!ordersOpen)void loadOrders();}}><PackageCheck size={17}/> {ordersOpen?'Hide':'View'} my orders</button>{ordersOpen && <div className="orders-list">{customerOrders.length===0?<p>No orders yet.</p>:customerOrders.map(o=><article key={o.id}><div><strong>Order #{o.order_number}</strong><small>{new Date(o.created_at).toLocaleString()}</small>{(o.order_items??[]).map((i:any)=><small key={i.product_name_snapshot}>{i.product_name_snapshot} × {i.quantity}</small>)}</div><div><b>₹{Number(o.total).toFixed(2)}</b><span className={'order-status '+o.status}>{String(o.status).replaceAll('_',' ')}</span></div></article>)}</div>}</section>}
    {loginOpen && <div className="modal-backdrop" onClick={() => setLoginOpen(false)}><section className="login-modal" onClick={e => e.stopPropagation()}><button className="modal-close" onClick={() => setLoginOpen(false)}><X size={19}/></button><div className="login-logo">S</div><span className="eyebrow">WELCOME TO SAI SATHWIKA</span><h2>Freshness is one tap away.</h2><p>Sign in securely with your Google account to save your address and orders.</p><button className="google-button" onClick={signIn}><span className="google-g">G</span> Continue with Google</button><small>Your account details are protected. We never ask for your Google password.</small></section></div>}
    {notice && <div className="notice" role="status"><CheckCircle2 size={17}/>{notice}<button onClick={() => setNotice('')}><X size={16}/></button></div>}
  </main>;
}
