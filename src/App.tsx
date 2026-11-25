import { useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { ArrowRight, CheckCircle2, Clock3, IceCream, Leaf, MapPin, Milk, Search, ShieldCheck, ShoppingBag, UserRound, X } from 'lucide-react';
import { isSupabaseConfigured, supabase } from './lib/supabase';
import AdminDashboard from './AdminDashboard';

type Product = { id: string; name: string; price: number; mrp: number | null; image_urls: string[]; variant_label: string | null; unit: string | null; brands?: { name: string }[] | null };
type Category = { id: string; name: string };

const categoryIcons = [Milk, Leaf, IceCream, Milk];
const fallbackCategories = ['Milk & Varieties', 'Curd & Buttermilk', 'Ice Creams', 'Butter, Ghee & Paneer'];

export default function App() {
  const [query, setQuery] = useState('');
  const [cart, setCart] = useState<Record<string, number>>({});
  const [session, setSession] = useState<Session | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loginOpen, setLoginOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');
  const [adminRole, setAdminRole] = useState('customer');
  const [adminView, setAdminView] = useState(false);

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
      supabase.from('products').select('id,name,price,mrp,image_urls,variant_label,unit,brands(name)').eq('is_available', true).gt('stock_quantity', 0).order('sort_order'),
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
  const filtered = useMemo(() => products.filter(p => p.name.toLowerCase().includes(query.toLowerCase()) || (p.brands?.[0]?.name ?? '').toLowerCase().includes(query.toLowerCase())), [products, query]);

  async function signIn() {
    if (!supabase) { setNotice('The shop database is being connected. Please check back soon.'); return; }
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
    if (error) setNotice(error.message);
  }

  if(adminView && ['admin','super_admin','staff'].includes(adminRole)) return <AdminDashboard onBack={()=>setAdminView(false)}/>;

  return <main>
    <div className="announcement">Fresh dairy from your neighbourhood · Free delivery at launch</div>
    <header className="header shell">
      <a className="brand" href="#"><span className="brand-mark">S</span><span><strong>Sai Sathwika</strong><small>AUTHORISED HERITAGE OUTLET</small></span></a>
      <div className="location"><MapPin size={17}/><span><small>DELIVERING TO</small><strong>Select your address</strong></span></div>
      <div className="header-actions">
        <button className="account" onClick={() => session ? supabase?.auth.signOut() : setLoginOpen(true)}><UserRound size={17}/>{session ? 'Sign out' : 'Sign in'}</button>
        {['admin','super_admin','staff'].includes(adminRole) && <button className="account" onClick={()=>setAdminView(true)}><ShieldCheck size={17}/> Admin</button>}
        <button className="cart" onClick={() => setNotice('Cart is ready for the checkout feature.')}><ShoppingBag size={19}/> Cart <b>{cartCount}</b></button>
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
        {(categories.length ? categories : fallbackCategories.map((name, i) => ({id: String(i), name}))).map((category, i) => { const Icon = categoryIcons[i % categoryIcons.length]; return <article className="category" key={category.id}><div className="category-icon"><Icon size={29}/></div><div><h3>{category.name}</h3><p>Explore our {category.name.toLowerCase()}</p></div><ArrowRight className="category-arrow" size={18}/></article>; })}
      </div>
      <div className="section-heading product-heading"><div><span className="eyebrow">SHOP YOUR FAVOURITES</span><h2>Available products</h2></div><span className="muted">{products.length} products</span></div>
      {!isSupabaseConfigured && <div className="empty-products"><div className="empty-icon"><ShoppingBag size={25}/></div><h3>We're getting the shop ready</h3><p>Product catalogue and sign-in will become live when the secure shop connection is configured.</p></div>}
      {isSupabaseConfigured && loading && <p className="loading-text">Loading fresh picks…</p>}
      {isSupabaseConfigured && !loading && products.length === 0 && <div className="empty-products"><div className="empty-icon"><ShoppingBag size={25}/></div><h3>Products are coming soon</h3><p>Our team is preparing the catalogue. Check back soon for fresh milk, curd, ice creams and more.</p></div>}
      {filtered.length > 0 && <div className="product-grid">{filtered.map(product => <article className="product-card" key={product.id}><div className="product-photo">{product.image_urls?.[0] ? <img src={product.image_urls[0]} alt={product.name}/> : <div className="photo-placeholder"><Milk size={35}/></div>}</div><div className="product-info"><small>{product.brands?.[0]?.name ?? 'Sai Sathwika'}</small><h3>{product.name}</h3><p>{[product.variant_label, product.unit].filter(Boolean).join(' · ')}</p><div className="product-bottom"><strong>₹{Number(product.price).toFixed(2)}</strong><button onClick={() => setCart(c => ({...c, [product.id]: (c[product.id] ?? 0) + 1}))}>Add +</button></div></div></article>)}</div>}
    </section>

    <footer><div className="shell footer-inner"><div className="brand footer-brand"><span className="brand-mark">S</span><span><strong>Sai Sathwika</strong><small>AUTHORISED HERITAGE OUTLET</small></span></div><p>Made with care for your neighbourhood.</p><small>© {new Date().getFullYear()} Sai Sathwika</small></div></footer>

    {loginOpen && <div className="modal-backdrop" onClick={() => setLoginOpen(false)}><section className="login-modal" onClick={e => e.stopPropagation()}><button className="modal-close" onClick={() => setLoginOpen(false)}><X size={19}/></button><div className="login-logo">S</div><span className="eyebrow">WELCOME TO SAI SATHWIKA</span><h2>Freshness is one tap away.</h2><p>Sign in securely with your Google account to save your address and orders.</p><button className="google-button" onClick={signIn}><span className="google-g">G</span> Continue with Google</button><small>Your account details are protected. We never ask for your Google password.</small></section></div>}
    {notice && <div className="notice" role="status"><CheckCircle2 size={17}/>{notice}<button onClick={() => setNotice('')}><X size={16}/></button></div>}
  </main>;
}
