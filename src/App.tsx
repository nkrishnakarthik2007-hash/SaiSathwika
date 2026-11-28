import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { SplashScreen } from '@capacitor/splash-screen';
import { App as NativeApp } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import type { Session } from '@supabase/supabase-js';
import { ArrowLeft, RefreshCw, ArrowRight, CheckCircle2, Clock3, IceCream, Leaf, MapPin, Milk, Search, ShieldCheck, ShoppingBag, UserRound, X, Minus, Plus, PackageCheck, LocateFixed, Home, Store, ClipboardList, LogOut, UserCircle2, ChevronRight } from 'lucide-react';
import { isSupabaseConfigured, supabase } from './lib/supabase';
import { AppUpdater } from './lib/app-updater';
import { flushAppDiagnostics, installAppDiagnostics, recordAppDiagnostic } from './lib/diagnostics';
import { getDeviceLocation } from './lib/location';

installAppDiagnostics();
const AdminDashboard = lazy(() => import('./AdminDashboard'));
const DeliveryDashboard = lazy(() => import('./DeliveryDashboard'));
const MapPicker = lazy(() => import('./MapPicker'));

type Product = { id: string; category_id?: string | null; name: string; price: number; stock_quantity:number; mrp: number | null; image_urls: string[]; variant_label: string | null; unit: string | null; brands?: { name: string }[] | null };
type Category = { id: string; name: string };
type CustomerPage = 'home' | 'shop' | 'orders' | 'profile' | 'login' | 'updates';
type AppUpdate = { tagName: string; apkUrl: string; releaseNotes: string; versionCode: number; sha256: string };

const categoryIcons = [Milk, Leaf, IceCream, Milk];
const fallbackCategories = ['Milk & Varieties', 'Curd & Buttermilk', 'Ice Creams', 'Butter, Ghee & Paneer'];

export default function App() {
  const [customerPage, setCustomerPage] = useState<CustomerPage>(() => {
    const saved = localStorage.getItem('sai-sathwika-last-page');
    return saved && ['home','shop','orders','profile','login','updates'].includes(saved) ? saved as CustomerPage : 'home';
  });
  const [query, setQuery] = useState('');
  const [activeCategory,setActiveCategory]=useState<string|null>(null);
  const [cart, setCart] = useState<Record<string, number>>(() => {
    try { const saved=localStorage.getItem('sai-sathwika-cart'); return saved ? JSON.parse(saved) as Record<string,number> : {}; }
    catch { return {}; }
  });
  const [session, setSession] = useState<Session | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [installedAppVersion, setInstalledAppVersion] = useState('Checking…');
  const [installedBuild, setInstalledBuild] = useState('');
  const [updateStatus, setUpdateStatus] = useState('Not checked yet');
  const [loading, setLoading] = useState(true);
  const [storeAccepting,setStoreAccepting]=useState<boolean|null>(null);
  const [deliveryRadius,setDeliveryRadius]=useState(2);
  const [storeCoordinates,setStoreCoordinates]=useState<{latitude:number;longitude:number}|null>(null);
  const [addressMapOpen,setAddressMapOpen]=useState(false);
  const [newAddressLabel,setNewAddressLabel]=useState('Home');
  const [savingAddress,setSavingAddress]=useState(false);
  const [showAddressForm,setShowAddressForm]=useState(false);
  const [notice, setNotice] = useState('');
  const [adminRole, setAdminRole] = useState('customer');
  const [adminView, setAdminView] = useState(() => localStorage.getItem('sai-sathwika-admin-view') === '1');
  const [roleResolved, setRoleResolved] = useState(false);
  const [sessionResolved, setSessionResolved] = useState(false);
  const [adminPortalRequested, setAdminPortalRequested] = useState(() => {
    const requested = new URLSearchParams(window.location.search).get('admin') === '1';
    if (requested) localStorage.setItem('sai-sathwika-admin-portal', '1');
    return requested || localStorage.getItem('sai-sathwika-admin-portal') === '1';
  });
  const [cartOpen, setCartOpen] = useState(false);
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [address, setAddress] = useState({recipient_name:'',phone:'',address_line:'',landmark:''});
  const [coords, setCoords] = useState<{latitude:number;longitude:number}|null>(null);
  const [locationBusy, setLocationBusy] = useState(false);
  const [cartCloudUserId, setCartCloudUserId] = useState<string | null>(null);
  const cartSyncQueue = useRef<Promise<void>>(Promise.resolve());
  const locationPromptedUser = useRef<string | null>(null);
  const [customerOrders, setCustomerOrders] = useState<any[]>([]);
  const [orderStatusEvents, setOrderStatusEvents] = useState<Record<string,any[]>>({});
  const [deliveryOtps, setDeliveryOtps] = useState<Record<string,string>>({});
  const [deliveryOtpBusy, setDeliveryOtpBusy] = useState<string|null>(null);
  const [customerAddresses, setCustomerAddresses] = useState<any[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState('');
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [profileLoading, setProfileLoading] = useState(false);
  const [customerNote, setCustomerNote] = useState('');
  const [couponCode,setCouponCode]=useState('');
  const [appliedCoupon,setAppliedCoupon]=useState<{code:string;discount:number;subtotal:number;name:string}|null>(null);
  const [couponBusy,setCouponBusy]=useState(false);
  const [appUpdate, setAppUpdate] = useState<AppUpdate | null>(null);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [installingUpdate, setInstallingUpdate] = useState(false);
  const [updateProgress, setUpdateProgress] = useState(0);

  async function generateDeliveryOtp(orderId: string) {
    if (!supabase) return;
    setDeliveryOtpBusy(orderId);
    const { data, error } = await supabase.rpc('customer_get_delivery_otp', { p_order_id: orderId });
    if (error) setNotice(error.message);
    else setDeliveryOtps(current => ({ ...current, [orderId]: String(data) }));
    setDeliveryOtpBusy(null);
  }

  async function checkForUpdates() {
    if (Capacitor.getPlatform() !== 'android') { setNotice('App updates are available from the Android app only.'); return; }
    setCheckingUpdate(true);
    try {
      const [installed, response] = await Promise.all([
        NativeApp.getInfo(),
        fetch('https://api.github.com/repos/nkrishnakarthik2007-hash/SaiSathwika/releases?per_page=1', { headers: { Accept: 'application/vnd.github+json' }, cache: 'no-store' }),
      ]);
      if (!response.ok) throw new Error('Could not check GitHub releases. Please try again.');
      const releases = await response.json() as Array<{ tag_name: string; body?: string; assets?: Array<{ name: string; browser_download_url: string; digest?: string }> }>;
      const latest = releases[0];
      const apk = latest?.assets?.find(asset => asset.name.toLowerCase() === 'saisathwika.apk');
      const latestVersionCode = Number(latest?.tag_name?.split('.').at(-1));
      const installedVersionCode = Number(installed.build ?? 0);
      setInstalledAppVersion(installed.version || 'Unknown');
      setInstalledBuild(String(installed.build ?? ''));
      if (!latest || !apk || !Number.isFinite(latestVersionCode)) throw new Error('The latest release does not contain a valid Android APK.');
      if (latestVersionCode > installedVersionCode) {
        setAppUpdate({ tagName: latest.tag_name, apkUrl: apk.browser_download_url, releaseNotes: latest.body ?? '', versionCode: latestVersionCode, sha256: apk.digest ?? '' });
        setUpdateStatus('A new version is available: ' + latest.tag_name);
        setNotice('A new version (' + latest.tag_name + ') is available.');
      } else { setAppUpdate(null); setUpdateStatus('You are using the latest version.'); setNotice('You are using the latest Sai Sathwika version.'); }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not check for updates.';
      recordAppDiagnostic('Update check failed: ' + message, error instanceof Error ? error.stack : null);
      setNotice(message);
    }
    finally { setCheckingUpdate(false); }
  }

  async function startAppUpdate() {
    if (!appUpdate || installingUpdate) return;
    setInstallingUpdate(true);
    setUpdateProgress(0);
    let progressListener: { remove: () => Promise<void> } | undefined;
    try {
      progressListener = await AppUpdater.addListener('downloadProgress', (progress) => {
        setUpdateProgress(Math.max(0, Math.min(100, progress.percent || 0)));
      });
      const result = await AppUpdater.downloadAndInstall({
        url: appUpdate.apkUrl,
        sha256: appUpdate.sha256,
      });
      recordAppDiagnostic('APK downloaded and handed to Android installer. Version code: ' + result.versionCode, null, 'warning');
      setNotice('Update downloaded. Complete the installation in the Android installer.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not download the update.';
      recordAppDiagnostic('In-app update failed: ' + message, error instanceof Error ? error.stack : null);
      if (message.includes('INSTALL_PERMISSION_REQUIRED')) {
        setNotice('Allow Sai Sathwika to install apps in Android settings. Return here and tap Update again.');
      } else {
        setNotice(message);
      }
    } finally {
      await progressListener?.remove().catch(() => undefined);
      setInstallingUpdate(false);
    }
  }

  useEffect(() => { localStorage.setItem('sai-sathwika-last-page', customerPage); }, [customerPage]);
  useEffect(() => {
    if (adminView && roleResolved && !['admin','owner','super_admin','delivery_staff'].includes(adminRole)) {
      setAdminView(false); localStorage.removeItem('sai-sathwika-admin-view');
    } else if (adminView && ['admin','owner','super_admin','delivery_staff'].includes(adminRole)) {
      localStorage.setItem('sai-sathwika-admin-view', '1');
    } else if (!adminView) localStorage.removeItem('sai-sathwika-admin-view');
  }, [adminView, roleResolved, adminRole]);

  useEffect(() => {
    if (Capacitor.getPlatform() !== 'android') { setInstalledAppVersion('Web version'); return; }
    void NativeApp.getInfo().then(info => { setInstalledAppVersion(info.version || 'Unknown'); setInstalledBuild(String(info.build ?? '')); }).catch(() => setInstalledAppVersion('Unable to read version'));
  }, []);

  useEffect(() => {
    if (customerPage === 'updates' && Capacitor.getPlatform() === 'android') void checkForUpdates();
  }, [customerPage]);
  const [bootFailsafeElapsed, setBootFailsafeElapsed] = useState(false);

  useEffect(() => {
    const failsafe = window.setTimeout(() => setBootFailsafeElapsed(true), 4500);
    return () => window.clearTimeout(failsafe);
  }, []);

  useEffect(() => {
    let active = true;
    let revealTimer: number | undefined;
    let removeTimer: number | undefined;
    const bootStartedAt = Number(document.body.dataset.bootStartedAt || Date.now());
    const bootScreen = document.getElementById('app-boot-screen');
    const appDataReady = !supabase || sessionResolved;

    // Never uncover a blank React root. Wait for the first usable app state,
    // with a failsafe for slow or unavailable networks.
    if (!appDataReady && !bootFailsafeElapsed) return;

    const revealRenderedApp = () => {
      if (!active) return;
      document.body.dataset.appReady = 'true';
      bootScreen?.classList.add('app-boot-screen-hidden');
      removeTimer = window.setTimeout(() => bootScreen?.remove(), 460);
    };

    const reveal = () => {
      if (!active) return;
      if (Capacitor.isNativePlatform()) {
        void SplashScreen.hide({ fadeOutDuration: 500 })
          .then(() => window.requestAnimationFrame(revealRenderedApp))
          .catch((error) => {
            recordAppDiagnostic('Native splash handoff failed: ' + String(error));
            revealRenderedApp();
          });
      } else {
        revealRenderedApp();
      }
    };

    const remaining = Math.max(0, 900 - (Date.now() - bootStartedAt));
    revealTimer = window.setTimeout(reveal, remaining);
    return () => {
      active = false;
      if (revealTimer !== undefined) window.clearTimeout(revealTimer);
      if (removeTimer !== undefined) window.clearTimeout(removeTimer);
    };
  }, [loading, sessionResolved, bootFailsafeElapsed]);

  useEffect(() => {
    try { localStorage.setItem('sai-sathwika-cart',JSON.stringify(cart)); } catch { /* storage may be unavailable */ }
  }, [cart]);

  useEffect(() => {
    const client = supabase;
    if (!client) { setSessionResolved(true); setRoleResolved(true); setLoading(false); return; }
    const authFallback = window.setTimeout(() => {
      setSessionResolved(true);
      setRoleResolved(true);
    }, 9000);
    client.auth.getSession().then(({ data }) => {
      window.clearTimeout(authFallback);
      setSessionResolved(true);
      setSession(data.session);
      if (data.session) {
        setRoleResolved(false);
        void loadRole(data.session.user.id);
        void flushAppDiagnostics(client, data.session.user.id);
      } else {
        setRoleResolved(true);
      }
    }).catch((error) => {
      window.clearTimeout(authFallback);
      recordAppDiagnostic('Initial session restore failed: ' + String(error));
      setSessionResolved(true);
      setRoleResolved(true);
    });
    const { data: listener } = client.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      if (next) {
        setRoleResolved(false);
        Promise.resolve().then(() => {
          void loadRole(next.user.id);
          void flushAppDiagnostics(client, next.user.id);
        });
      } else {
        setRoleResolved(true);
        setAdminRole('customer');
        setAdminView(false);
        localStorage.removeItem('sai-sathwika-admin-view');
        setCartCloudUserId(null);
        setCart({});
      }
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!adminPortalRequested || !sessionResolved) return;
    if (!session) {
      setCustomerPage('login');
      return;
    }
    if (!roleResolved) return;
    if (['admin','owner','super_admin','delivery_staff'].includes(adminRole)) {
      setCustomerPage('home');
      setAdminView(true);
    } else {
      setAdminView(false);
      setAdminPortalRequested(false);
      localStorage.removeItem('sai-sathwika-admin-portal');
      setNotice('This Google account does not have permission to manage the store. Please use the store admin account.');
    }
  }, [adminPortalRequested, sessionResolved, session?.user.id, roleResolved, adminRole]);

  useEffect(() => {
    if (session && roleResolved && adminRole === 'delivery_staff') setAdminView(true);
  }, [session?.user.id, roleResolved, adminRole]);

  useEffect(() => {
    if (!supabase || !session) return;
    const client = supabase;
    const userId = session.user.id;
    const flush = () => { void flushAppDiagnostics(client, userId); };
    window.addEventListener('error', flush);
    window.addEventListener('unhandledrejection', flush);
    window.addEventListener('online', flush);
    return () => {
      window.removeEventListener('error', flush);
      window.removeEventListener('unhandledrejection', flush);
      window.removeEventListener('online', flush);
    };
  }, [session?.user.id]);

  useEffect(() => {
    const supabaseClient = supabase;
    if (Capacitor.getPlatform() !== 'android' || !supabaseClient) return;
    let active = true;
    let appUrlListener: { remove: () => Promise<void> } | undefined;
    let handledCode: string | null = null;

    const handleAuthCallback = async (rawUrl: string) => {
      try {
        const callbackUrl = new URL(rawUrl);
        if (callbackUrl.protocol !== 'in.saisathwika.shop:' || callbackUrl.hostname !== 'login-callback') return;

        const callbackParams = new URLSearchParams(callbackUrl.search);
        const hashParams = new URLSearchParams(callbackUrl.hash.replace(/^#/, ''));
        const authError = callbackParams.get('error_description') || callbackParams.get('error')
          || hashParams.get('error_description') || hashParams.get('error');
        if (authError) throw new Error(authError);

        const code = callbackParams.get('code') || hashParams.get('code');
        if (!code || code === handledCode) return;
        handledCode = code;

        await Browser.close().catch(() => undefined);
        const { error } = await supabaseClient.auth.exchangeCodeForSession(code);
        if (error) throw error;
        if (active) {
          setCustomerPage('home');
          setNotice('Google sign-in successful.');
        }
      } catch (error) {
        if (active) setNotice(error instanceof Error ? error.message : 'Google sign-in could not be completed.');
      }
    };

    void NativeApp.addListener('appUrlOpen', ({ url }) => {
      void handleAuthCallback(url);
    }).then((listener) => {
      appUrlListener = listener;
      if (!active) void listener.remove();
    });

    void NativeApp.getLaunchUrl().then((launch) => {
      if (launch?.url) void handleAuthCallback(launch.url);
    });

    return () => {
      active = false;
      void appUrlListener?.remove();
    };
  }, []);

  

  async function loadRole(userId: string) {
    if(!supabase)return;
    const {error:inviteError}=await supabase.functions.invoke('team-invitations',{body:{action:'accept'}});
    if(inviteError)recordAppDiagnostic('Invitation check failed: '+inviteError.message);
    const {data,error}=await supabase.from('profiles').select('role').eq('id',userId).maybeSingle();
    if(error)recordAppDiagnostic('Could not load account role: '+error.message);
    setAdminRole(data?.role ?? 'customer');
    setRoleResolved(true);
  }

  useEffect(() => {
    if (!supabase) return;
    let alive = true;
    const loadingFallback = window.setTimeout(() => { if (alive) setLoading(false); }, 9000);
    Promise.all([
      supabase.from('products').select('id,category_id,name,price,mrp,stock_quantity,image_urls,variant_label,unit,brands(name)').eq('is_available', true).gt('stock_quantity', 0).order('sort_order'),
      supabase.from('categories').select('id,name').eq('is_active', true).order('sort_order'),
      supabase.from('store_settings').select('accepting_orders,delivery_radius_km,store_latitude,store_longitude').eq('id',1).maybeSingle(),
    ]).then(([productResult, categoryResult, storeResult]) => {
      if (!alive) return;
      if (!productResult.error) setProducts((productResult.data ?? []) as Product[]);
      if (!categoryResult.error) setCategories(categoryResult.data ?? []);
      if (!storeResult.error) { setStoreAccepting(storeResult.data?.accepting_orders ?? false); setDeliveryRadius(Number(storeResult.data?.delivery_radius_km ?? 2)); setStoreCoordinates(storeResult.data?.store_latitude!=null&&storeResult.data?.store_longitude!=null?{latitude:Number(storeResult.data.store_latitude),longitude:Number(storeResult.data.store_longitude)}:null); }
    }).catch((error) => {
      recordAppDiagnostic('Store data loading failed: ' + String(error));
    }).finally(() => {
      window.clearTimeout(loadingFallback);
      if (alive) setLoading(false);
    });
    return () => { alive = false; window.clearTimeout(loadingFallback); };
  }, []);

  const cartProducts = products.filter(p => cart[p.id]);
  const cartCount = cartProducts.reduce((total,p)=>total+(cart[p.id]??0),0);
  const cartSubtotal = cartProducts.reduce((sum,p) => sum + Number(p.price) * (cart[p.id] ?? 0), 0);
  const changeQty = (id:string, delta:number) => {
    const product=products.find(p=>p.id===id);
    if(!product)return;
    const maxQuantity=Math.min(50,Math.max(0,Math.floor(Number(product.stock_quantity)||0)));
    setCart(current=>{
      const next={...current};
      const currentQuantity=Math.max(0,Math.floor(Number(current[id])||0));
      const requestedQuantity=currentQuantity+delta;
      if(requestedQuantity<=0)delete next[id];
      else next[id]=Math.min(requestedQuantity,maxQuantity);
      return next;
    });
    if(delta>0&&(Number(cart[id])||0)>=maxQuantity){
      setNotice(maxQuantity===0?'This product is currently out of stock.':'You can add up to '+maxQuantity+' units of this product.');
    }
  };

  useEffect(() => {
    const client = supabase;
    const userId = session?.user.id;
    if (!client || !userId) {
      setCartCloudUserId(null);
      return;
    }

    let active = true;
    const restoreCart = async () => {
      try {
        const { data, error } = await client
          .from('cart_items')
          .select('product_id,quantity')
          .eq('customer_id', userId);
        if (error) throw error;

        const remoteCart: Record<string, number> = {};
        for (const item of data ?? []) {
          remoteCart[item.product_id] = Number(item.quantity);
        }

        let localCart: Record<string, number> = {};
        try {
          const saved = localStorage.getItem('sai-sathwika-cart');
          localCart = saved ? JSON.parse(saved) as Record<string, number> : {};
        } catch {
          localCart = {};
        }

        // Keep the cloud account as the source of truth, while carrying over
        // any guest cart items the customer added before signing in.
        const mergedCart = { ...remoteCart };
        for (const [productId, quantity] of Object.entries(localCart)) {
          if (!mergedCart[productId]) mergedCart[productId] = quantity;
        }

        if (!active) return;
        setCart(mergedCart);
        setCartCloudUserId(userId);
        setNotice(Object.keys(remoteCart).length ? 'Your cloud cart has been restored.' : 'Your cart is now linked to your Google account.');
      } catch (error) {
        recordAppDiagnostic('Cloud cart restore failed: ' + (error instanceof Error ? error.message : String(error)), error instanceof Error ? error.stack : null);
        if (active) setNotice('Could not sync your cloud cart yet. Your current cart remains saved on this device.');
      }
    };

    void restoreCart();
    return () => { active = false; };
  }, [session?.user.id]);

  useEffect(() => {
    const client = supabase;
    const userId = session?.user.id;
    if (!client || !userId || cartCloudUserId !== userId) return;

    const snapshot = { ...cart };
    cartSyncQueue.current = cartSyncQueue.current
      .then(async () => {
        const rows = Object.entries(snapshot)
          .filter(([, quantity]) => Number.isInteger(quantity) && quantity > 0)
          .map(([productId, quantity]) => ({
            customer_id: userId,
            product_id: productId,
            quantity: Math.min(50, quantity),
            updated_at: new Date().toISOString(),
          }));

        if (rows.length) {
          const { error } = await client.from('cart_items').upsert(rows, { onConflict: 'customer_id,product_id' });
          if (error) throw error;
        }

        const { data: existing, error: lookupError } = await client
          .from('cart_items')
          .select('product_id')
          .eq('customer_id', userId);
        if (lookupError) throw lookupError;

        const keep = new Set(rows.map(row => row.product_id));
        const staleIds = (existing ?? []).map(row => row.product_id).filter(id => !keep.has(id));
        if (staleIds.length) {
          const { error } = await client
            .from('cart_items')
            .delete()
            .eq('customer_id', userId)
            .in('product_id', staleIds);
          if (error) throw error;
        }
      })
      .catch(error => {
        recordAppDiagnostic('Cloud cart sync failed: ' + (error instanceof Error ? error.message : String(error)), error instanceof Error ? error.stack : null);
      });
  }, [cart, session?.user.id, cartCloudUserId]);
  async function loadOrders() {
    if (!supabase || !session) return;
    setOrdersLoading(true);
    try {
      const { data, error } = await supabase
        .from('orders')
        .select('id,order_number,status,total,payment_method,payment_status,created_at,delivery_address_snapshot,order_items(product_name_snapshot,quantity,line_total)')
        .eq('customer_id', session.user.id)
        .order('created_at', { ascending: false })
        .limit(30);
      if (error) throw error;
      setCustomerOrders(data ?? []);
      const orderIds = (data ?? []).map((order:any) => order.id);
      if (orderIds.length) {
        const { data: events } = await supabase.from('order_status_events').select('id,order_id,old_status,new_status,changed_at').in('order_id', orderIds).order('changed_at', { ascending: true });
        const grouped: Record<string,any[]> = {};
        for (const event of events ?? []) (grouped[event.order_id] ??= []).push(event);
        setOrderStatusEvents(grouped);
      } else setOrderStatusEvents({});
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not load your orders.');
    } finally {
      setOrdersLoading(false);
    }
  }

  useEffect(() => {
    const client = supabase;
    const userId = session?.user.id;
    if (!client || !userId || customerPage !== 'orders') return;
    let active = true;
    const refreshOrderStatus = async () => {
      const { data, error } = await client
        .from('orders')
        .select('id,order_number,status,total,payment_method,payment_status,created_at,delivery_address_snapshot,order_items(product_name_snapshot,quantity,line_total)')
        .eq('customer_id', userId)
        .order('created_at', { ascending: false })
        .limit(30);
      if (active && !error) setCustomerOrders(data ?? []);
    };
    const timer = window.setInterval(() => { void refreshOrderStatus(); }, 20000);
    return () => { active = false; window.clearInterval(timer); };
  }, [customerPage, session?.user.id]);

  async function loadCustomerAddresses() {
    if (!supabase || !session) return;
    setProfileLoading(true);
    try {
      const { data, error } = await supabase
        .from('customer_addresses')
        .select('id,label,recipient_name,phone,address_line,landmark,latitude,longitude,is_default')
        .eq('customer_id', session.user.id)
        .order('is_default', { ascending: false })
        .order('created_at', { ascending: false });
      if (error) throw error;
      setCustomerAddresses(data ?? []);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not load your saved addresses.');
    } finally {
      setProfileLoading(false);
    }
  }

  function navigateCustomerPage(page: CustomerPage) {
    if ((page === 'orders' || page === 'profile') && !session) {
      setCustomerPage('login');
      setNotice('Sign in with Google to view your account and orders.');
      return;
    }
    setCustomerPage(page);
    setCartOpen(false);
    if (page === 'orders') void loadOrders();
    if (page === 'profile') void loadCustomerAddresses();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function signOutCustomer() {
    if (!supabase) return;
    const { error } = await supabase.auth.signOut();
    if (error) {
      setNotice(error.message);
      return;
    }
    setCustomerPage('home');
    localStorage.removeItem('sai-sathwika-admin-view');
    setCustomerAddresses([]);
    setSelectedAddressId('');
    setAddress({recipient_name:'',phone:'',address_line:'',landmark:''});
    setCoords(null);
    setCustomerOrders([]);
    setCartCloudUserId(null);
    setCart({});
    setNotice('You have signed out successfully.');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function captureLocation() {
    setLocationBusy(true);
    try {
      const point=await getDeviceLocation();
      setCoords(point);
      setNotice('GPS location captured. It will be saved with your delivery address when you place an order.');
    } catch(error) {
      setNotice(error instanceof Error?error.message:'Could not get your location. Try again outdoors.');
    } finally { setLocationBusy(false); }
  }

  async function openAddressMap() {
    setLocationBusy(true);
    try {
      const point=await getDeviceLocation();
      setCoords(point);
      setAddressMapOpen(true);
    } catch(error) {
      setNotice(error instanceof Error?error.message:'Could not get your GPS location. Try again.');
    } finally { setLocationBusy(false); }
  }

  async function saveProfileAddress() {
    if(!supabase||!session)return;
    if(!address.recipient_name.trim()||!address.phone.trim()||!address.address_line.trim()||!coords){setNotice('Enter your name, phone, address and choose a GPS location.');return;}
    setSavingAddress(true);
    try {
      const {data,error}=await supabase.from('customer_addresses').insert({customer_id:session.user.id,label:newAddressLabel.trim()||'Home',recipient_name:address.recipient_name.trim(),phone:address.phone.trim(),address_line:address.address_line.trim(),landmark:address.landmark.trim()||null,latitude:coords.latitude,longitude:coords.longitude,is_default:customerAddresses.length===0}).select('id,label,recipient_name,phone,address_line,landmark,latitude,longitude,is_default').single();
      if(error)throw error;
      setCustomerAddresses(current=>[data,...current]);setSelectedAddressId(data.id);setNotice('Delivery address saved.');
      setAddressMapOpen(false);setNewAddressLabel('Home');setShowAddressForm(false);
    } catch(error) {setNotice(error instanceof Error?error.message:'Could not save this address.');}
    finally {setSavingAddress(false);}
  }

  function openShopDirections() {
    if(!storeCoordinates){setNotice('The store location has not been added yet. Please contact the store.');return;}
    const destination=storeCoordinates.latitude+','+storeCoordinates.longitude;
    const url='https://www.google.com/maps/dir/?api=1&origin=My%20Location&destination='+encodeURIComponent(destination)+'&travelmode=driving';
    window.location.href=url;
  }

  function selectSavedAddress(id: string) {
    setSelectedAddressId(id);
    if (id === '__new__') {
      setAddress({recipient_name:'',phone:'',address_line:'',landmark:''});
      setCoords(null);
      return;
    }
    const saved = customerAddresses.find(item => item.id === id);
    if (!saved) return;
    setAddress({recipient_name:saved.recipient_name ?? '',phone:saved.phone ?? '',address_line:saved.address_line ?? '',landmark:saved.landmark ?? ''});
    setCoords(typeof saved.latitude === 'number' && typeof saved.longitude === 'number'
      ? {latitude:saved.latitude,longitude:saved.longitude}
      : null);
    setNotice('Saved delivery address selected.');
  }

  useEffect(() => {
    if (!supabase || !session || !roleResolved || adminRole !== 'customer' || adminView) return;
    const client = supabase;
    let active = true;
    const loadDefaultAddress = async () => {
      const {data,error} = await client
        .from('customer_addresses')
        .select('id,label,recipient_name,phone,address_line,landmark,latitude,longitude,is_default')
        .eq('customer_id',session.user.id)
        .order('is_default',{ascending:false})
        .order('created_at',{ascending:false});
      if (!active) return;
      if (error) {
        setNotice('Could not load saved delivery addresses: '+error.message);
        return;
      }
      const saved = data ?? [];
      setCustomerAddresses(saved);
      if (saved.length) {
        const preferred = saved.find(item=>item.is_default) ?? saved[0];
        setSelectedAddressId(preferred.id);
        setAddress({recipient_name:preferred.recipient_name ?? '',phone:preferred.phone ?? '',address_line:preferred.address_line ?? '',landmark:preferred.landmark ?? ''});
        setCoords(typeof preferred.latitude === 'number' && typeof preferred.longitude === 'number'
          ? {latitude:preferred.latitude,longitude:preferred.longitude}
          : null);
      } else if (locationPromptedUser.current !== session.user.id) {
        locationPromptedUser.current = session.user.id;
        captureLocation();
      }
    };
    void loadDefaultAddress();
    return () => { active = false; };
  }, [session?.user.id, roleResolved, adminRole, adminView]);
  async function applyCoupon(){
    if(!supabase||!session){setNotice('Sign in before applying a coupon.');return;}
    const code=couponCode.trim().toUpperCase();
    if(!code){setNotice('Enter a coupon code first.');return;}
    setCouponBusy(true);
    try{
      const {data,error}=await supabase.rpc('validate_coupon',{p_coupon_code:code,p_subtotal:cartSubtotal});
      if(error)throw error;
      const result=Array.isArray(data)?data[0]:data;
      setAppliedCoupon({code:result.coupon_code,discount:Number(result.discount),subtotal:cartSubtotal,name:result.promotion_name});
      setNotice('Coupon '+result.coupon_code+' applied. You save ₹'+Number(result.discount).toFixed(2)+'.');
    }catch(error:any){setAppliedCoupon(null);setNotice(error?.message??'Could not validate this coupon.');}
    finally{setCouponBusy(false);}
  }

  async function placeOrder() {
    if(storeAccepting===false){setNotice('Online ordering is currently closed. Please check back later.');return;}
    if(!supabase || !session){setCartOpen(false);setCustomerPage('login');return;}
    if(!cartProducts.length){setNotice('Your cart is empty.');return;}
    if(!address.recipient_name.trim() || !address.phone.trim() || !address.address_line.trim()){setNotice('Enter your name, phone number and delivery address.');return;}
    const digits=address.phone.replace(/\D/g,'');
    if(digits.length<10 || digits.length>13){setNotice('Enter a valid phone number with 10 to 13 digits.');return;}
    if(!coords){setNotice('Capture your delivery location before placing the order.');return;}
    setCheckoutBusy(true);
    try {
      const {data:existingAddresses,error:lookupError}=await supabase.from('customer_addresses').select('id,recipient_name,phone,address_line,landmark,latitude,longitude').eq('customer_id',session.user.id).eq('address_line',address.address_line.trim()).eq('phone',address.phone.trim()).limit(1);
      if(lookupError) throw lookupError;
      let addressId=existingAddresses?.[0]?.id as string|undefined;
      if(addressId){
        const {error:updateAddressError}=await supabase.from('customer_addresses').update({
          recipient_name:address.recipient_name.trim(),landmark:address.landmark.trim()||null,
          latitude:coords.latitude,longitude:coords.longitude
        }).eq('id',addressId);
        if(updateAddressError) throw updateAddressError;
      } else {
        const {data:addressRow,error:addressError}=await supabase.from('customer_addresses').insert({
          customer_id:session.user.id,label:'Home',recipient_name:address.recipient_name.trim(),phone:address.phone.trim(),
          address_line:address.address_line.trim(),landmark:address.landmark.trim()||null,
          latitude:coords.latitude,longitude:coords.longitude,is_default:true
        }).select('id').single();
        if(addressError) throw addressError;
        addressId=addressRow.id;
      }
      if (!addressId) throw new Error('Could not save your delivery address. Please try again.');
      const items=cartProducts.map(p=>({product_id:p.id,quantity:cart[p.id]}));
      const validCoupon=appliedCoupon&&appliedCoupon.subtotal===cartSubtotal?appliedCoupon:null;
      const {data,error}=await supabase.rpc('place_order',{p_items:items,p_address_id:addressId,p_customer_note:customerNote.trim()||null,p_coupon_code:validCoupon?.code??null});
      if(error) throw error;
      const result=Array.isArray(data)?data[0]:data;
      setSelectedAddressId(addressId);
      setCart({}); setCartOpen(false); setCustomerNote(''); setCouponCode(''); setAppliedCoupon(null);
      setNotice(result?.order_number ? `Order #${result.order_number} placed successfully!` : 'Your order was placed successfully!');
      await loadOrders();
      await loadCustomerAddresses();
    } catch(error:any) { setNotice(error?.message ?? 'Could not place your order. Please try again.'); }
    finally { setCheckoutBusy(false); }
  }
  const filtered = useMemo(() => products.filter(p => (!activeCategory || p.category_id===activeCategory) && (p.name.toLowerCase().includes(query.toLowerCase()) || (p.brands?.[0]?.name ?? '').toLowerCase().includes(query.toLowerCase()))), [products, query, activeCategory]);

  async function signIn() {
    if (!supabase) { setNotice('The shop database is being connected. Please check back soon.'); return; }
    const isAndroid = Capacitor.getPlatform() === 'android';
    const redirectTo = isAndroid
      ? 'in.saisathwika.shop://login-callback'
      : new URL(import.meta.env.BASE_URL, window.location.href).href;
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo,
        skipBrowserRedirect: isAndroid,
      },
    });
    if (error) {
      setNotice(error.message);
      return;
    }
    if (isAndroid && data.url) {
      try {
        await Browser.open({ url: data.url });
      } catch (openError) {
        setNotice(openError instanceof Error ? openError.message : 'Could not open Google sign-in.');
      }
    }
  }

  if(adminView && adminRole === 'delivery_staff') return <Suspense fallback={<div className="admin-map-loading">Opening delivery desk…</div>}><DeliveryDashboard
    onSignOut={async()=>{await supabase?.auth.signOut();setAdminView(false);setAdminPortalRequested(false);localStorage.removeItem('sai-sathwika-admin-portal');}}
  /></Suspense>;

  if(adminView && ['admin','owner','super_admin'].includes(adminRole)) return <>
    <Suspense fallback={<div className="admin-map-loading">Opening store management…</div>}><AdminDashboard
      role={adminRole}
      onBack={()=>{setAdminView(false);setAdminPortalRequested(false);localStorage.removeItem('sai-sathwika-admin-portal');}}
      onSignOut={async()=>{await supabase?.auth.signOut();setAdminView(false);setAdminPortalRequested(false);localStorage.removeItem('sai-sathwika-admin-portal');}}
    /></Suspense>
    <nav className="mobile-store-nav admin-customer-dock" aria-label="Customer app navigation">
      <button onClick={()=>{setAdminView(false);navigateCustomerPage('home');}}><Home size={19}/><span>Home</span></button>
      <button onClick={()=>{setAdminView(false);navigateCustomerPage('shop');}}><Store size={19}/><span>Shop</span></button>
      <button onClick={()=>{setAdminView(false);navigateCustomerPage('orders');}}><ClipboardList size={19}/><span>Orders</span></button>
      <button onClick={()=>{setAdminView(false);navigateCustomerPage('profile');}}><UserRound size={19}/><span>Profile</span></button>
      <button className="mobile-admin-nav active" aria-current="page" onClick={()=>setAdminView(true)}><ShieldCheck size={19}/><span>Admin</span></button>
      <button onClick={()=>{setAdminView(false);setCartOpen(true);}}><ShoppingBag size={19}/><span>Cart{cartCount?' · '+cartCount:''}</span></button>
    </nav>
  </>;

  return <main>
    <div className="announcement"><span>{storeAccepting===true?'We are accepting orders · Fresh dairy from your neighbourhood':storeAccepting===false?'Online ordering is not open yet · Browse our products':'Fresh dairy from your neighbourhood · Free delivery at launch'}</span></div>
    <header className="header shell">
      <a className="brand" href="#" onClick={event => { event.preventDefault(); navigateCustomerPage('home'); }}><span className="brand-mark">S</span><span><strong>Sai Sathwika</strong><small>AUTHORISED HERITAGE OUTLET</small></span></a>
      <div className="location"><MapPin size={17}/><span><small>DELIVERING TO</small><strong>{address.address_line ? address.address_line.split(',')[0] : 'Select your address'}</strong></span></div>
      <nav className="desktop-store-nav" aria-label="Store navigation">
        <button className={customerPage === 'home' ? 'active' : ''} onClick={() => navigateCustomerPage('home')}>Home</button>
        <button className={customerPage === 'shop' ? 'active' : ''} onClick={() => navigateCustomerPage('shop')}>Shop</button>
        <button className={customerPage === 'orders' ? 'active' : ''} onClick={() => navigateCustomerPage('orders')}>My orders</button>
      </nav>
      <div className="header-actions">
        <button className="header-update-shortcut" onClick={() => navigateCustomerPage('updates')} aria-label="App updates"><RefreshCw size={17}/><span>Updates</span></button>
        <button className="profile-trigger" aria-label={session ? 'Open my profile' : 'Sign in'} onClick={() => session && ['admin','owner','super_admin'].includes(adminRole) ? setAdminView(true) : session ? navigateCustomerPage('profile') : setCustomerPage('login')}>
          {session?.user.user_metadata?.avatar_url || session?.user.user_metadata?.picture
            ? <img src={session.user.user_metadata.avatar_url || session.user.user_metadata.picture} alt="" referrerPolicy="no-referrer"/>
            : <UserRound size={19}/>}
          <span>{session && ['admin','owner','super_admin'].includes(adminRole) ? 'Admin' : session ? 'Profile' : 'Sign in'}</span>
        </button>
        <button className="cart" onClick={() => setCartOpen(true)} aria-label={'Open cart with ' + cartCount + ' items'}><ShoppingBag size={19}/> Cart <b>{cartCount}</b></button>
      </div>
    </header>

    {customerPage === 'home' && <>
    <section className="hero shell">
      <div className="hero-copy">
        <span className="eyebrow"><span className="dot"/> YOUR NEIGHBOURHOOD DAIRY STORE</span>
        <h1>Goodness that<br/><em>comes to you.</em></h1>
        <p>Your daily dairy favourites, ice creams and more — fresh from Sai Sathwika to your doorstep.</p>
        <div className="hero-actions"><button className="primary" onClick={() => navigateCustomerPage('shop')}>Explore products <ArrowRight size={17}/></button><button className="go-to-shop-button" onClick={openShopDirections}><MapPin size={16}/> Go to shop</button><span><ShieldCheck size={17}/> Local. Fresh. Convenient.</span></div>
      </div>
      <div className="hero-art"><div className="sun"></div><div className="leaf leaf-one"></div><div className="leaf leaf-two"></div><div className="milk-pack"><span>Heritage</span><strong>Fresh<br/>Milk</strong><small>PURE DAIRY GOODNESS</small></div><div className="curd-pot"><span>✳</span><strong>Curd</strong></div><div className="ice-cream">🍦</div><div className="art-caption">A little freshness, every day.</div></div>
    </section>

    <section className="benefits shell">
      <div><MapPin/><span><strong>Neighbourhood delivery</strong><small>Within {deliveryRadius} km of our store</small></span></div>
      <div><Clock3/><span><strong>Easy ordering</strong><small>Order in just a few taps</small></span></div>
      <div><ShieldCheck/><span><strong>Trusted local store</strong><small>Personal service, every time</small></span></div>
    </section>
      <section className="home-discovery shell">
        <div><span className="eyebrow">SHOP THE SAI SATHWIKA WAY</span><h2>Everyday essentials, made easy.</h2><p>Find your regular dairy favourites, explore new products and get them delivered from your neighbourhood store.</p></div>
        <button className="primary" onClick={() => navigateCustomerPage('shop')}>Explore the collection <ArrowRight size={17}/></button>
        <div className="home-discovery-trust"><span><ShieldCheck size={17}/> Secure Google sign-in</span><span><PackageCheck size={17}/> Order tracking</span><span><MapPin size={17}/> Local delivery</span></div>
      </section>
    </>}



    {customerPage === 'shop' &&     <section className="shop shell" id="shop">
      <div className="section-heading"><div><span className="eyebrow">THE GOODNESS COLLECTION</span><h2>Shop by category</h2></div><span className="muted">Fresh picks from your local store</span></div>
      <div className="search"><Search size={19}/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search products or brands..."/></div>
      <div className="categories">
        {(categories.length ? categories : fallbackCategories.map((name, i) => ({id: String(i), name}))).map((category, i) => { const Icon = categoryIcons[i % categoryIcons.length]; return <article className={activeCategory===category.id?"category active-category":"category"} key={category.id} onClick={()=>setActiveCategory(activeCategory===category.id?null:category.id)} role="button" tabIndex={0} onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();setActiveCategory(activeCategory===category.id?null:category.id);}}}><div className="category-icon"><Icon size={29}/></div><div><h3>{category.name}</h3><p>Explore our {category.name.toLowerCase()}</p></div><ArrowRight className="category-arrow" size={18}/></article>; })}
      </div>
      <div className="section-heading product-heading"><div><span className="eyebrow">SHOP YOUR FAVOURITES</span><h2>Available products</h2></div><span className="muted">{activeCategory?categories.find(x=>x.id===activeCategory)?.name+" · ":""}{filtered.length} products {activeCategory&&<button className="clear-filter" onClick={()=>setActiveCategory(null)}>Clear filter</button>}</span></div>
      {!isSupabaseConfigured && <div className="empty-products"><div className="empty-icon"><ShoppingBag size={25}/></div><h3>We're getting the shop ready</h3><p>Product catalogue and sign-in will become live when the secure shop connection is configured.</p></div>}
      {isSupabaseConfigured && loading && <p className="loading-text">Loading fresh picks…</p>}
      {isSupabaseConfigured && !loading && products.length === 0 && <div className="empty-products"><div className="empty-icon"><ShoppingBag size={25}/></div><h3>Products are coming soon</h3><p>Our team is preparing the catalogue. Check back soon for fresh milk, curd, ice creams and more.</p></div>}
      {!loading && products.length>0 && filtered.length===0 && <div className="empty-products"><div className="empty-icon"><Search size={25}/></div><h3>No matching products</h3><p>Try another product name or choose a different category.</p><button className="clear-filter" onClick={()=>{setQuery('');setActiveCategory(null);}}>Clear search and filters</button></div>}
      {filtered.length > 0 && <div className="product-grid">{filtered.map(product => <article className="product-card" key={product.id}><div className="product-photo">{product.image_urls?.[0] ? <img src={product.image_urls[0]} alt={product.name}/> : <div className="photo-placeholder"><Milk size={35}/></div>}</div><div className="product-info"><small>{product.brands?.[0]?.name ?? 'Sai Sathwika'}</small><h3>{product.name}</h3><p>{[product.variant_label, product.unit].filter(Boolean).join(' · ')}</p><div className="product-bottom"><strong>₹{Number(product.price).toFixed(2)}</strong><button onClick={() => changeQty(product.id,1)} disabled={(cart[product.id]??0)>=product.stock_quantity}>{(cart[product.id]??0)>0?'Add more +':'Add +'}</button></div></div></article>)}</div>}
    </section>}

    {customerPage === 'orders' && <section className="customer-page shell">
      <div className="customer-page-heading customer-orders-heading"><div><span className="eyebrow">YOUR SAI SATHWIKA ACCOUNT</span><h1>My orders</h1><p>Follow your delivery and see everything you've ordered.</p></div><button className="customer-orders-refresh" type="button" onClick={() => void loadOrders()} disabled={ordersLoading}><RefreshCw size={16} className={ordersLoading?'spin':''}/>{ordersLoading?'Refreshing…':'Refresh status'}</button></div>
      {ordersLoading ? <div className="customer-empty-state"><div className="loading-orbit"/><strong>Loading your orders…</strong></div>
        : customerOrders.length === 0 ? <div className="customer-empty-state"><div className="customer-empty-icon"><PackageCheck size={28}/></div><h2>No orders yet</h2><p>Your orders will appear here after you place your first order.</p><button className="primary" onClick={() => navigateCustomerPage('shop')}>Start shopping <ArrowRight size={16}/></button></div>
        : <div className="customer-orders-grid">{customerOrders.map(order => <article className="customer-order-card" key={order.id}>
            <div className="customer-order-top"><div><small>ORDER NUMBER</small><strong>#{order.order_number}</strong></div><span className={'customer-order-status ' + order.status}>{String(order.status).replaceAll('_',' ')}</span><small className="customer-payment-status">Payment: {(order.payment_method??'cash_on_delivery').replaceAll('_',' ')} · {(order.payment_status??'pending').replaceAll('_',' ')}</small></div>
            <div className="customer-order-items">{(order.order_items ?? []).map((item:any) => <div key={item.product_name_snapshot}><span>{item.product_name_snapshot} × {item.quantity}</span><strong>₹{Number(item.line_total ?? 0).toFixed(2)}</strong></div>)}</div>
            {order.delivery_address_snapshot?.address_line && <p className="customer-order-address"><MapPin size={14}/>{order.delivery_address_snapshot.address_line}</p>}
            <div className="customer-order-timeline"><strong>Order progress</strong><div className="customer-order-timeline-steps">{(order.status === 'cancelled' ? ['placed','confirmed','preparing','cancelled'] : ['placed','confirmed','preparing','ready_for_dispatch','out_for_delivery','delivered']).map((stage:string,index:number) => { const sequence=['placed','confirmed','preparing','ready_for_dispatch','out_for_delivery','delivered']; const currentIndex=sequence.indexOf(order.status); const completed=order.status==='cancelled' ? stage==='placed'||stage==='confirmed'||stage==='preparing' : sequence.indexOf(stage)<=currentIndex; const event=(orderStatusEvents[order.id]??[]).find((item:any)=>item.new_status===stage); return <div className={'customer-order-timeline-step '+(completed?'completed':'')+(stage===order.status?' current':'')} key={stage}><span className="customer-order-timeline-dot"/><div><b>{stage.replaceAll('_',' ')}</b>{event && <small>{new Date(event.changed_at).toLocaleString()}</small>}</div></div>;})}</div></div>
            {order.status === 'out_for_delivery' && <div className="customer-delivery-otp"><div><strong>Delivery confirmation OTP</strong><small>Share this code with the delivery partner only when your order arrives. It expires in 10 minutes.</small></div>{deliveryOtps[order.id] ? <strong className="customer-otp-code">{deliveryOtps[order.id]}</strong> : <button type="button" disabled={deliveryOtpBusy===order.id} onClick={() => void generateDeliveryOtp(order.id)}>{deliveryOtpBusy===order.id?'Generating…':'Show delivery OTP'}</button>}</div>}
            <div className="customer-order-bottom"><small>{new Date(order.created_at).toLocaleString()}</small><strong>₹{Number(order.total).toFixed(2)}</strong></div>
          </article>)}</div>}
    </section>}

    {customerPage === 'profile' && session && <section className="customer-page shell">
      <div className="customer-page-heading"><span className="eyebrow">YOUR ACCOUNT</span><h1>My profile</h1><p>Manage your account and saved delivery details.</p></div>
      <section className="profile-summary-card">
        <div className="profile-summary-avatar">{session.user.user_metadata?.avatar_url || session.user.user_metadata?.picture ? <img src={session.user.user_metadata.avatar_url || session.user.user_metadata.picture} alt="" referrerPolicy="no-referrer"/> : <UserCircle2 size={36}/>}</div>
        <div className="profile-summary-info"><strong>{session.user.user_metadata?.full_name || session.user.user_metadata?.name || 'Sai Sathwika customer'}</strong><span>{session.user.email}</span><small><ShieldCheck size={13}/> Google account connected</small></div>
        <button className="profile-signout" onClick={() => void signOutCustomer()}><LogOut size={16}/> Sign out</button>
      </section>
      <div className="profile-content-grid">
        <section className="profile-content-card"><div className="profile-card-heading"><div><span className="eyebrow">DELIVERY DETAILS</span><h2>Saved addresses</h2></div><button type="button" className="profile-add-address-trigger" onClick={()=>{setAddress({recipient_name:'',phone:'',address_line:'',landmark:''});setCoords(null);setNewAddressLabel('Home');setShowAddressForm(true);}}><MapPin size={16}/> Add address</button></div>
          {profileLoading ? <p className="profile-muted">Loading saved addresses…</p> : customerAddresses.length === 0 ? <p className="profile-muted">No saved addresses yet. Add your delivery address and choose its location on the map.</p> : customerAddresses.map(saved => <article className="saved-address" key={saved.id}><div><strong>{saved.label || 'Delivery address'} {saved.is_default && <span className="default-address-pill">Default</span>}</strong><p>{saved.recipient_name} · {saved.phone}</p><small>{saved.address_line}{saved.landmark ? ', ' + saved.landmark : ''}</small><small>{typeof saved.latitude === 'number' && typeof saved.longitude === 'number' ? 'GPS location saved' : 'GPS location not saved'}</small><button type="button" className="saved-address-select" onClick={()=>selectSavedAddress(saved.id)}>Use this address</button></div></article>)}
          {showAddressForm&&<div className="profile-add-address"><h3>Add a delivery address</h3><label>Address name<input value={newAddressLabel} onChange={e=>setNewAddressLabel(e.target.value)} placeholder="Home / Work"/></label><label>Your name<input value={address.recipient_name} onChange={e=>setAddress(a=>({...a,recipient_name:e.target.value}))} placeholder="Recipient name"/></label><label>Phone number<input value={address.phone} onChange={e=>setAddress(a=>({...a,phone:e.target.value}))} inputMode="tel" placeholder="10-digit mobile number"/></label><label>Full address<input value={address.address_line} onChange={e=>setAddress(a=>({...a,address_line:e.target.value}))} placeholder="House, street, area"/></label><label>Landmark (optional)<input value={address.landmark} onChange={e=>setAddress(a=>({...a,landmark:e.target.value}))} placeholder="Nearby landmark"/></label><button type="button" className="location-button" onClick={openAddressMap} disabled={locationBusy}><LocateFixed size={17}/>{locationBusy?'Getting GPS location…':coords?'GPS captured · Choose / adjust on map':'Allow GPS & choose location on map'}</button>{coords&&<small className="checkout-footnote">GPS: {coords.latitude.toFixed(5)}, {coords.longitude.toFixed(5)}</small>}<button type="button" className="place-order-button" onClick={()=>void saveProfileAddress()} disabled={savingAddress}>{savingAddress?'Saving address…':'Save delivery address'}</button><button type="button" className="saved-address-select" onClick={()=>setShowAddressForm(false)}>Cancel</button></div>}
        </section>
        <section className="profile-content-card profile-quick-actions"><div className="profile-card-heading"><div><span className="eyebrow">QUICK ACCESS</span><h2>Your shopping</h2></div><ShoppingBag size={20}/></div>
          <button onClick={() => navigateCustomerPage('orders')}><PackageCheck size={17}/> View my orders <ChevronRight size={16}/></button>
          <button onClick={() => navigateCustomerPage('shop')}><Store size={17}/> Browse products <ChevronRight size={16}/></button>
          <button onClick={() => setCartOpen(true)}><ShoppingBag size={17}/> Open my cart <ChevronRight size={16}/></button>
          {['admin','owner','super_admin'].includes(adminRole) && <button onClick={() => setAdminView(true)}><ShieldCheck size={17}/> Open admin panel <ChevronRight size={16}/></button>}
          <button onClick={() => navigateCustomerPage('updates')}><RefreshCw size={17}/> App updates & version <ChevronRight size={16}/></button>
        </section>
      </div>
    </section>}

    {customerPage === 'updates' && <section className="customer-page shell app-updates-page">
      <button className="login-back-button" onClick={() => navigateCustomerPage(session ? 'profile' : 'home')}><ArrowLeft size={17}/> Back</button>
      <div className="customer-page-heading"><span className="eyebrow">APP SETTINGS</span><h1>App updates</h1><p>Check your installed version and get the latest Sai Sathwika improvements.</p></div>
      <section className="profile-content-card app-version-card"><div className="app-version-icon"><ShieldCheck size={25}/></div><div><span className="eyebrow">CURRENT VERSION</span><h2>Version {installedAppVersion}</h2><p>{installedBuild ? 'Build number '+installedBuild : 'Installed application version'}</p></div></section>
      <section className="profile-content-card app-update-check-card"><span className="eyebrow">UPDATE STATUS</span><h2>{appUpdate ? 'An update is ready' : checkingUpdate ? 'Checking for updates…' : 'Stay up to date'}</h2><p>{updateStatus}</p>
        {appUpdate && <div className="app-release-notes"><strong>Latest release: {appUpdate.tagName}</strong>{appUpdate.releaseNotes && <p>{appUpdate.releaseNotes}</p>}</div>}
        <button className="primary app-update-action" onClick={appUpdate ? startAppUpdate : checkForUpdates} disabled={checkingUpdate || installingUpdate || Capacitor.getPlatform() !== 'android'}>{checkingUpdate ? 'Checking…' : installingUpdate ? 'Downloading '+updateProgress+'%' : appUpdate ? 'Download and install update' : 'Check for updates'}</button>
        {installingUpdate && <div className="app-update-progress"><span style={{width:updateProgress+'%'}}/></div>}
        {Capacitor.getPlatform() !== 'android' && <small>In-app APK updates are available in the Android app.</small>}
      </section>
    </section>}

    {customerPage !== 'login' && <nav className="mobile-store-nav" aria-label="Mobile store navigation">
      <button className={customerPage === 'home' ? 'active' : ''} onClick={() => navigateCustomerPage('home')}><Home size={19}/><span>Home</span></button>
      <button className={customerPage === 'shop' ? 'active' : ''} onClick={() => navigateCustomerPage('shop')}><Store size={19}/><span>Shop</span></button>
      <button className={customerPage === 'orders' ? 'active' : ''} onClick={() => navigateCustomerPage('orders')}><ClipboardList size={19}/><span>Orders</span></button>
      <button className={customerPage === 'profile' ? 'active' : ''} onClick={() => navigateCustomerPage('profile')}><UserRound size={19}/><span>Profile</span></button>
      {['admin','owner','super_admin'].includes(adminRole) && <button className="mobile-admin-nav" onClick={() => setAdminView(true)} aria-label="Open admin panel"><ShieldCheck size={19}/><span>Admin</span></button>}
      <button onClick={() => setCartOpen(true)}><ShoppingBag size={19}/><span>Cart{cartCount ? ' · ' + cartCount : ''}</span></button>
    </nav>}

    <footer><div className="shell footer-inner"><div className="brand footer-brand"><span className="brand-mark">S</span><span><strong>Sai Sathwika</strong><small>AUTHORISED HERITAGE OUTLET</small></span></div><p>Freshness for your family, delivered with care.</p><button className="footer-update-link" onClick={() => navigateCustomerPage('updates')}>App updates & current version</button><div className="footer-creator"><strong>Made with love by Krishna Karthik</strong><span>Created in Andhra Pradesh, India</span><small>© {new Date().getFullYear()} Sai Sathwika</small></div></div></footer>

    {cartOpen && <div className="modal-backdrop" onClick={()=>setCartOpen(false)}><section className="cart-modal" onClick={e=>e.stopPropagation()}>
      <div className="cart-modal-head"><div><span className="eyebrow">YOUR BASKET</span><h2>Shopping cart <small>({cartCount} items)</small></h2></div><button className="modal-close" onClick={()=>setCartOpen(false)}><X/></button></div>
      {cartProducts.length===0 ? <div className="cart-empty"><ShoppingBag size={34}/><h3>Your cart is empty</h3><p>Add a few favourites to get started.</p><button className="primary" onClick={()=>setCartOpen(false)}>Continue shopping</button></div> :
      <>
        <div className="cart-lines">{cartProducts.map(p=><article className="cart-line" key={p.id}><div className="cart-thumb">{p.image_urls?.[0]?<img src={p.image_urls[0]} alt=""/>:<Milk/>}</div><div className="cart-line-info"><strong>{p.name}</strong><small>₹{Number(p.price).toFixed(2)} each</small><b>₹{(Number(p.price)*(cart[p.id]??0)).toFixed(2)}</b></div><div className="qty-control"><button onClick={()=>changeQty(p.id,-1)} aria-label="Decrease quantity"><Minus size={14}/></button><b>{cart[p.id]}</b><button onClick={()=>changeQty(p.id,1)} aria-label="Increase quantity" disabled={cart[p.id]>=p.stock_quantity}><Plus size={14}/></button></div></article>)}</div>
        <div className="cart-total"><span>Subtotal</span><strong>₹{cartSubtotal.toFixed(2)}</strong></div>
        {!session ? <div className="checkout-signin"><p>Sign in with Google to continue to delivery details and checkout.</p><button className="google-button" onClick={signIn}>Continue with Google</button></div> :
        <div className="checkout-form"><h3>Delivery details</h3>
          {customerAddresses.length > 0 && <label>Saved delivery address<select value={selectedAddressId || '__new__'} onChange={e=>selectSavedAddress(e.target.value)}><option value="__new__">Use a new delivery address</option>{customerAddresses.map(saved=><option key={saved.id} value={saved.id}>{saved.label || saved.address_line || 'Saved address'}{saved.is_default?' (Default)':''}</option>)}</select></label>}
          <label>Your name<input value={address.recipient_name} onChange={e=>setAddress(a=>({...a,recipient_name:e.target.value}))} placeholder="Recipient name"/></label>
          <label>Phone number<input value={address.phone} onChange={e=>setAddress(a=>({...a,phone:e.target.value}))} inputMode="tel" placeholder="10-digit mobile number"/></label>
          <label>Full delivery address<input value={address.address_line} onChange={e=>setAddress(a=>({...a,address_line:e.target.value}))} placeholder="House / flat, street, area"/></label>
          <label>Landmark (optional)<input value={address.landmark} onChange={e=>setAddress(a=>({...a,landmark:e.target.value}))} placeholder="Nearby landmark"/></label>
          <button className={coords?'location-captured':'location-button'} onClick={captureLocation} disabled={locationBusy}><LocateFixed size={17}/>{locationBusy?'Getting location…':coords?'Delivery location captured':'Use my current location'}</button>
          {coords && <small className="checkout-footnote">GPS coordinates captured: {coords.latitude.toFixed(6)}, {coords.longitude.toFixed(6)}. These coordinates will be saved with this address when you place the order.</small>}
          <div className="coupon-entry">
            <label htmlFor="checkout-coupon">Have a coupon?</label>
            <div className="coupon-entry-row"><input id="checkout-coupon" value={couponCode} onChange={e=>{setCouponCode(e.target.value.toUpperCase());setAppliedCoupon(null);}} placeholder="Enter coupon code" autoCapitalize="characters"/><button type="button" onClick={()=>void applyCoupon()} disabled={couponBusy||!couponCode.trim()}>{couponBusy?'Checking…':'Apply'}</button></div>
            {appliedCoupon&&appliedCoupon.subtotal===cartSubtotal&&<div className="coupon-applied"><span>{appliedCoupon.code} · {appliedCoupon.name}</span><button type="button" onClick={()=>{setAppliedCoupon(null);setCouponCode('');}}>Remove</button></div>}
          </div>
          {appliedCoupon&&appliedCoupon.subtotal===cartSubtotal&&<div className="checkout-discount-summary"><span>Coupon discount</span><strong>−₹{appliedCoupon.discount.toFixed(2)}</strong><span>Order total before delivery</span><strong>₹{Math.max(0,cartSubtotal-appliedCoupon.discount).toFixed(2)}</strong></div>}
          <label>Note for the store (optional)<textarea value={customerNote} onChange={e=>setCustomerNote(e.target.value)} placeholder="Any delivery instructions?"/></label>
          <div className="payment-method-card"><span className="payment-cod-icon">₹</span><div><strong>Cash on delivery</strong><small>Pay when your order arrives. No online payment needed.</small></div><span className="payment-selected">Selected</span></div>
          <button className="place-order-button" onClick={placeOrder} disabled={checkoutBusy || storeAccepting===false}>{checkoutBusy?'Placing order…':storeAccepting===false?'Ordering currently closed':'Place order · ₹'+Math.max(0,cartSubtotal-(appliedCoupon&&appliedCoupon.subtotal===cartSubtotal?appliedCoupon.discount:0)).toFixed(2)}</button>
          <small className="checkout-footnote">{storeAccepting===false?'This store is not accepting online orders right now. Your cart will be saved.':'Cash on delivery. Final delivery eligibility and charges are verified securely by the store.'}</small>
        </div>}
      </>}
    </section></div>}

    {customerPage === 'login' && <section className="dedicated-login-page">
      <button className="login-back-button" onClick={() => navigateCustomerPage('home')}><ArrowLeft size={17}/> Back to shop</button>
      <div className="dedicated-login-card">
        <div className="login-logo">S</div>
        <span className="eyebrow">WELCOME TO SAI SATHWIKA</span>
        <h1>Freshness is one tap away.</h1>
        <p>Sign in with Google to save your delivery address, keep your cart synced and follow your orders.</p>
        <button className="google-button" onClick={signIn}><span className="google-g">G</span> Continue with Google</button>
        <small>Secure Google sign-in. Sai Sathwika never sees or stores your Google password.</small>
        <div className="login-benefits"><span><ShieldCheck size={16}/> Secure account</span><span><ShoppingBag size={16}/> Saved cart</span><span><MapPin size={16}/> Delivery details</span></div>
      </div>
    </section>}

    {addressMapOpen && coords && <Suspense fallback={<div className="map-picker-loading">Opening map…</div>}><MapPicker initial={coords} onClose={()=>setAddressMapOpen(false)} onConfirm={point=>{setCoords(point);setAddressMapOpen(false);setNotice('Map location selected. Enter your house and street details, then save.');}}/></Suspense>}
    {notice && <div className="notice" role="status"><CheckCircle2 size={17}/>{notice}<button onClick={() => setNotice('')}><X size={16}/></button></div>}
  </main>;
}
