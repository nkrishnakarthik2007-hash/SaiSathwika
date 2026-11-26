import { useEffect, useState } from 'react';
import { ImagePlus, PackagePlus, Tags, Store, ArrowLeft, Save, ShieldCheck, LocateFixed, ClipboardList, Pencil, X, LayoutDashboard, Users, Percent, Activity, ShoppingBag, RefreshCw, TrendingUp, Truck } from 'lucide-react';
import { supabase } from './lib/supabase';

type Option = { id: string; name: string };
type AdminTab = 'overview' | 'products' | 'orders' | 'customers' | 'promotions' | 'store' | 'diagnostics';
const adminTabs: { id: AdminTab; label: string; icon: any }[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'products', label: 'Products', icon: PackagePlus },
  { id: 'orders', label: 'Orders', icon: ClipboardList },
  { id: 'customers', label: 'Customers', icon: Users },
  { id: 'promotions', label: 'Promotions', icon: Percent },
  { id: 'store', label: 'Store settings', icon: Store },
  { id: 'diagnostics', label: 'Live health', icon: Activity },
];

const orderStatusTransitions: Record<string, string[]> = {
  placed: ['confirmed', 'cancelled'],
  confirmed: ['preparing', 'cancelled'],
  preparing: ['out_for_delivery', 'cancelled'],
  out_for_delivery: ['delivered', 'cancelled'],
  delivered: [],
  cancelled: [],
};

async function optimizeProductImage(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file);
  try {
    const maxDimension = 1600;
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Could not process this image.');
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(result => result ? resolve(result) : reject(new Error('Image compression failed.')), 'image/webp', 0.82);
    });
    const baseName = file.name.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '-');
    return new File([blob], `${baseName || 'product'}.webp`, { type: 'image/webp', lastModified: Date.now() });
  } finally {
    bitmap.close();
  }
}
export default function AdminDashboard({ onBack }: { onBack: () => void }) {
  const [brands,setBrands]=useState<Option[]>([]);
  const [categories,setCategories]=useState<Option[]>([]);
  const [products,setProducts]=useState<any[]>([]);
  const [name,setName]=useState('');
  const [brand,setBrand]=useState('');
  const [category,setCategory]=useState('');
  const [price,setPrice]=useState('');
  const [mrp,setMrp]=useState('');
  const [stock,setStock]=useState('0');
  const [variant,setVariant]=useState('');
  const [unit,setUnit]=useState('');
  const [description,setDescription]=useState('');
  const [image,setImage]=useState<File|null>(null);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const [newBrand,setNewBrand]=useState('');
  const [newCategory,setNewCategory]=useState('');
  const [radius,setRadius]=useState('2');
  const [deliveryFee,setDeliveryFee]=useState('0');
  const [accepting,setAccepting]=useState(false);
  const [storeLat,setStoreLat]=useState('');
  const [storeLng,setStoreLng]=useState('');
  const [storeLocationBusy,setStoreLocationBusy]=useState(false);
  const [orders,setOrders]=useState<any[]>([]);
  const [ordersBusy,setOrdersBusy]=useState(false);
  const [editingId,setEditingId]=useState<string|null>(null);
  const [editName,setEditName]=useState('');
  const [editPrice,setEditPrice]=useState('');
  const [editMrp,setEditMrp]=useState('');
  const [editStock,setEditStock]=useState('');
  const [editBusy,setEditBusy]=useState(false);
  const [editImage,setEditImage]=useState<File|null>(null);
  const [inventorySearch,setInventorySearch]=useState('');
  const [lowStockOnly,setLowStockOnly]=useState(false);
  const [activeTab,setActiveTab]=useState<AdminTab>('overview');
  const [customers,setCustomers]=useState<any[]>([]);
  const [customerSearch,setCustomerSearch]=useState('');
  const [promotions,setPromotions]=useState<any[]>([]);
  const [promotionName,setPromotionName]=useState('');
  const [promotionDescription,setPromotionDescription]=useState('');
  const [promotionType,setPromotionType]=useState('percentage');
  const [promotionRules,setPromotionRules]=useState('10');
  const [promotionBusy,setPromotionBusy]=useState(false);
  const [diagnostics,setDiagnostics]=useState<any[]>([]);
  const [diagnosticsBusy,setDiagnosticsBusy]=useState(false);
  const [lastRefreshed,setLastRefreshed]=useState<Date|null>(null);

  async function refresh(){
    if(!supabase)return;
    const [b,c,p,s]=await Promise.all([
      supabase.from('brands').select('id,name').eq('is_active',true).order('name'),
      supabase.from('categories').select('id,name').eq('is_active',true).order('sort_order'),
      supabase.from('products').select('id,name,price,mrp,stock_quantity,is_available,image_urls,brands(name)').order('created_at',{ascending:false}),
      supabase.from('store_settings').select('delivery_radius_km,delivery_fee,accepting_orders,store_latitude,store_longitude').eq('id',1).single()
    ]);
    setBrands(b.data??[]);setCategories(c.data??[]);setProducts(p.data??[]);
    if(s.data){setRadius(String(s.data.delivery_radius_km));setDeliveryFee(String(s.data.delivery_fee));setAccepting(s.data.accepting_orders);setStoreLat(s.data.store_latitude==null?'':String(s.data.store_latitude));setStoreLng(s.data.store_longitude==null?'':String(s.data.store_longitude));}
  }
  async function refreshOrders(){
    if(!supabase)return;
    setOrdersBusy(true);
    const {data,error}=await supabase.from('orders').select('id,order_number,status,total,payment_method,payment_status,created_at,customer_id,delivery_address_snapshot,profiles(full_name,phone),order_items(product_name_snapshot,quantity)').order('created_at',{ascending:false}).limit(50);
    if(error)setMessage(error.message);else{setOrders(data??[]);setLastRefreshed(new Date());}
    setOrdersBusy(false);
  }
  async function refreshCustomers(){
    if(!supabase)return;
    const {data,error}=await supabase.from('profiles').select('id,full_name,phone,avatar_url,role,is_active,created_at').order('created_at',{ascending:false}).limit(200);
    if(error)setMessage('Customer list: '+error.message);else setCustomers(data??[]);
  }
  async function refreshPromotions(){
    if(!supabase)return;
    const {data,error}=await supabase.from('promotions').select('id,name,description,promotion_type,rules,is_active,starts_at,ends_at,created_at').order('created_at',{ascending:false});
    if(error)setMessage('Promotions: '+error.message);else setPromotions(data??[]);
  }
  async function refreshDiagnostics(){
    if(!supabase)return;
    setDiagnosticsBusy(true);
    const {data,error}=await supabase.from('app_diagnostics').select('id,received_at,app_version,platform,level,message,stack').order('received_at',{ascending:false}).limit(100);
    if(error)setMessage('Live health is restricted to the super-admin account. '+error.message);
    else setDiagnostics(data??[]);
    setDiagnosticsBusy(false);
  }
  useEffect(()=>{
    void refresh();
    void refreshOrders();
    const channel=supabase?.channel('sai-sathwika-admin-live')
      .on('postgres_changes',{event:'*',schema:'public',table:'orders'},()=>void refreshOrders())
      .on('postgres_changes',{event:'*',schema:'public',table:'products'},()=>void refresh())
      .on('postgres_changes',{event:'*',schema:'public',table:'app_diagnostics'},()=>{if(activeTab==='diagnostics')void refreshDiagnostics();})
      .subscribe();
    return ()=>{if(channel)void supabase?.removeChannel(channel);};
  },[]);
  useEffect(()=>{
    if(activeTab==='customers')void refreshCustomers();
    if(activeTab==='promotions')void refreshPromotions();
    if(activeTab==='diagnostics')void refreshDiagnostics();
    if(activeTab==='orders')void refreshOrders();
  },[activeTab]);
  function captureStoreLocation(){
    if(!navigator.geolocation){setMessage('Location is not supported on this device.');return;}
    setStoreLocationBusy(true);
    navigator.geolocation.getCurrentPosition(pos=>{
      setStoreLat(String(pos.coords.latitude));setStoreLng(String(pos.coords.longitude));
      setStoreLocationBusy(false);setMessage('Store location captured. Save settings to apply it.');
    },err=>{setStoreLocationBusy(false);setMessage(err.code===1?'Allow location access to capture the store location.':'Could not get location. Try again.');},
    {enableHighAccuracy:true,timeout:15000,maximumAge:0});
  }
  async function adjustStock(id:string,current:number,delta:number){
    if(!supabase)return;
    const next=Math.max(0,current+delta);
    const {error}=await supabase.from('products').update({stock_quantity:next}).eq('id',id);
    if(error)setMessage(error.message);else{setMessage('Stock updated.');void refresh();}
  }
  function beginEdit(product:any){
    setEditingId(product.id);setEditImage(null);setEditName(product.name);setEditPrice(String(product.price));
    setEditMrp(product.mrp==null?'':String(product.mrp));setEditStock(String(product.stock_quantity));
  }
  async function saveProductEdit(id:string){
    if(!supabase)return;
    const priceValue=Number(editPrice),stockValue=Number(editStock),mrpValue=editMrp===''?null:Number(editMrp);
    if(!editName.trim()){setMessage('Product name is required.');return;}
    if(!Number.isFinite(priceValue)||priceValue<=0){setMessage('Enter a valid selling price greater than ₹0.');return;}
    if(!Number.isInteger(stockValue)||stockValue<0){setMessage('Stock must be a whole number of 0 or more.');return;}
    if(mrpValue!==null&&(!Number.isFinite(mrpValue)||mrpValue<priceValue)){setMessage('MRP must be valid and cannot be lower than the selling price.');return;}
    setEditBusy(true);
    try{
      const product=products.find(p=>p.id===id);
      let imageUrls:string[]=product?.image_urls??[];
      let uploadedPath:string|null=null;
      if(editImage){
        if(editImage.size>15*1024*1024)throw new Error('Choose a product image smaller than 15 MB.');
        const optimized=await optimizeProductImage(editImage);
        uploadedPath=`${crypto.randomUUID()}-${optimized.name}`;
        const {error:uploadError}=await supabase.storage.from('product-images').upload(uploadedPath,optimized,{upsert:false,contentType:'image/webp',cacheControl:'31536000'});
        if(uploadError)throw uploadError;
        const {data}=supabase.storage.from('product-images').getPublicUrl(uploadedPath);
        imageUrls=[data.publicUrl];
      }
      const {error}=await supabase.from('products').update({name:editName.trim(),price:priceValue,mrp:mrpValue,stock_quantity:stockValue,...(editImage?{image_urls:imageUrls}:{})}).eq('id',id);
      if(error){
        if(uploadedPath)await supabase.storage.from('product-images').remove([uploadedPath]);
        throw error;
      }
      if(editImage&&product?.image_urls?.length){
        const oldPaths=product.image_urls.map((url:string)=>url.split('/storage/v1/object/public/product-images/')[1]).filter((path:string|undefined):path is string=>!!path&&!path.includes('://')).map((path:string)=>decodeURIComponent(path));
        if(oldPaths.length)await supabase.storage.from('product-images').remove(oldPaths);
      }
      setMessage('Product details updated.');setEditingId(null);setEditImage(null);void refresh();
    }catch(error:any){setMessage(error?.message??'Could not update product.');}
    finally{setEditBusy(false);}
  }
  async function toggleProduct(id:string,available:boolean){
    if(!supabase)return;
    const {error}=await supabase.from('products').update({is_available:!available}).eq('id',id);
    if(error)setMessage(error.message);else{setMessage('Product visibility updated.');void refresh();}
  }
  async function updateOrderStatus(id:string,currentStatus:string,status:string){
    if(!supabase)return;
    if(!orderStatusTransitions[currentStatus]?.includes(status)){setMessage('This order status change is not allowed.');return;}
    const {error}=await supabase.from('orders').update({status}).eq('id',id).eq('status',currentStatus);
    if(error)setMessage(error.message);else{setMessage('Order status updated.');void refreshOrders();}
  }
  async function addBrand(){
    if(!supabase||!newBrand.trim())return;
    const {error}=await supabase.from('brands').insert({name:newBrand.trim()});
    setMessage(error?.message??'Brand added');setNewBrand('');void refresh();
  }
  async function addCategory(){
    if(!supabase||!newCategory.trim())return;
    const {error}=await supabase.from('categories').insert({name:newCategory.trim()});
    setMessage(error?.message??'Category added');setNewCategory('');void refresh();
  }
  async function addProduct(e:React.FormEvent){
    e.preventDefault();if(!supabase)return;
    setBusy(true);setMessage('');
    try{
      let image_urls:string[]=[];
      if(image){
        if(image.size>15*1024*1024)throw new Error('Choose a product image smaller than 15 MB.');
        const optimized=await optimizeProductImage(image);
        const path=`${crypto.randomUUID()}-${optimized.name}`;
        const {error:uploadError}=await supabase.storage.from('product-images').upload(path,optimized,{upsert:false,contentType:'image/webp',cacheControl:'31536000'});
        if(uploadError)throw uploadError;
        const {data}=supabase.storage.from('product-images').getPublicUrl(path);
        image_urls=[data.publicUrl];
      }
      const priceValue=Number(price),stockValue=Number(stock),mrpValue=mrp===''?null:Number(mrp);
      if(!Number.isFinite(priceValue)||priceValue<=0)throw new Error('Enter a valid selling price greater than ₹0.');
      if(!Number.isInteger(stockValue)||stockValue<0)throw new Error('Stock quantity must be a whole number of 0 or more.');
      if(mrpValue!==null&&(!Number.isFinite(mrpValue)||mrpValue<priceValue))throw new Error('MRP must be valid and cannot be lower than the selling price.');
      const {error}=await supabase.from('products').insert({
        name:name.trim(),brand_id:brand||null,category_id:category||null,
        price:priceValue,mrp:mrpValue,stock_quantity:stockValue,
        variant_label:variant||null,unit:unit||null,description:description||null,
        image_urls,is_available:true
      });
      if(error)throw error;
      setMessage('Product saved successfully');
      setName('');setPrice('');setMrp('');setStock('0');setVariant('');setUnit('');setDescription('');setImage(null);
      void refresh();
    }catch(err){setMessage(err instanceof Error?err.message:'Unable to save product');}
    finally{setBusy(false);}
  }
  async function addPromotion(){
    if(!supabase||!promotionName.trim())return;
    const rawValue=Number(promotionRules);
    if(!Number.isFinite(rawValue)||rawValue<=0){setMessage('Enter a valid promotion value greater than zero.');return;}
    if(promotionType==='percentage'&&rawValue>100){setMessage('Percentage discount cannot be more than 100%.');return;}
    setPromotionBusy(true);
    const rules=promotionType==='percentage'?{percentage:rawValue}:promotionType==='fixed_amount'?{amount:rawValue}:{minimum_quantity:1};
    const {error}=await supabase.from('promotions').insert({
      name:promotionName.trim(),
      description:promotionDescription.trim()||null,
      promotion_type:promotionType,
      rules,
      is_active:false
    });
    if(error)setMessage(error.message);
    else{setMessage('Promotion created. Activate it when it is ready.');setPromotionName('');setPromotionDescription('');setPromotionRules('10');void refreshPromotions();}
    setPromotionBusy(false);
  }
  async function togglePromotion(id:string,isActive:boolean){
    if(!supabase)return;
    const {error}=await supabase.from('promotions').update({is_active:!isActive}).eq('id',id);
    if(error)setMessage(error.message);else{setMessage('Promotion status updated.');void refreshPromotions();}
  }

  async function saveStore(){
    if(!supabase)return;
    const radiusValue=Number(radius),feeValue=Number(deliveryFee);
    const latitude=storeLat===''?null:Number(storeLat),longitude=storeLng===''?null:Number(storeLng);
    if(!Number.isFinite(radiusValue)||radiusValue<=0||radiusValue>100){setMessage('Enter a delivery radius greater than 0 and no more than 100 km.');return;}
    if(!Number.isFinite(feeValue)||feeValue<0){setMessage('Enter a valid delivery fee of ₹0 or more.');return;}
    if((latitude===null)!==(longitude===null)){setMessage('Enter both store coordinates, or capture the store location.');return;}
    if(latitude!==null&&(!Number.isFinite(latitude)||latitude < -90||latitude > 90)){setMessage('Store latitude must be between -90 and 90.');return;}
    if(longitude!==null&&(!Number.isFinite(longitude)||longitude < -180||longitude > 180)){setMessage('Store longitude must be between -180 and 180.');return;}
    if(accepting&&(latitude===null||longitude===null)){setMessage('Capture the actual store location before enabling online orders.');return;}
    const {error}=await supabase.from('store_settings').update({delivery_radius_km:radiusValue,delivery_fee:feeValue,accepting_orders:accepting,store_latitude:latitude,store_longitude:longitude}).eq('id',1);
    setMessage(error?.message??'Store settings saved');
  }
  const visibleInventory=products.filter(p=>(p.name+' '+(p.brands?.[0]?.name??'')).toLowerCase().includes(inventorySearch.trim().toLowerCase())&&(!lowStockOnly||p.stock_quantity<=5));
  const visibleCustomers=customers.filter(c=>(c.full_name??'').toLowerCase().includes(customerSearch.toLowerCase())||(c.phone??'').includes(customerSearch)||(c.role??'').toLowerCase().includes(customerSearch.toLowerCase()));
  const recentValue=orders.reduce((sum,o)=>sum+Number(o.total??0),0);
  const pendingOrders=orders.filter(o=>!['delivered','cancelled'].includes(o.status)).length;

  return <main className="admin-page">
    <header className="admin-top"><button onClick={onBack}><ArrowLeft size={17}/> Storefront</button><div><ShieldCheck size={19}/> Sai Sathwika · Admin</div><button className="admin-refresh-button" type="button" onClick={()=>{void refresh();void refreshOrders();}}><RefreshCw size={15}/> Refresh</button></header>
    <section className="admin-shell">
      <div className="admin-heading"><span className="eyebrow">STORE CONTROL CENTRE</span><h1>{activeTab==='overview'?'Good morning, Admin.':adminTabs.find(tab=>tab.id===activeTab)?.label}</h1><p>{activeTab==='overview'?'Your ecommerce operations, in one place.':'Manage '+(adminTabs.find(tab=>tab.id===activeTab)?.label.toLowerCase()??'store operations')+' for Sai Sathwika.'}</p></div>
      <nav className="admin-navigation" aria-label="Admin sections">{adminTabs.map(tab=>{const Icon=tab.icon;return <button key={tab.id} className={activeTab===tab.id?'active':''} onClick={()=>setActiveTab(tab.id)}><Icon size={16}/><span>{tab.label}</span></button>;})}</nav>
      <div className="admin-stats"><article><PackagePlus/><strong>{products.length}</strong><span>Products</span></article><article><ShoppingBag/><strong>{pendingOrders}</strong><span>Open orders</span></article><article><Users/><strong>{customers.length||'—'}</strong><span>Customers</span></article><article><TrendingUp/><strong>₹{recentValue.toFixed(0)}</strong><span>Recent order value</span></article></div>
      {message&&<div className="admin-message">{message}</div>}
      {activeTab==='overview'&&<section className="admin-overview-grid">
  <article className="admin-overview-card admin-overview-primary"><span className="eyebrow">STORE OPERATIONS</span><h2>Your store at a glance</h2><p>Manage the catalogue, keep stock accurate and move orders through delivery from one control centre.</p><div className="admin-overview-actions"><button onClick={()=>setActiveTab('products')}><PackagePlus size={16}/> Manage products</button><button onClick={()=>setActiveTab('orders')}><ClipboardList size={16}/> View orders</button></div></article>
  <article className="admin-overview-card"><span className="eyebrow">RECENT ORDER VALUE</span><strong>₹{recentValue.toFixed(2)}</strong><small>Across the latest {orders.length} orders loaded</small></article>
  <article className="admin-overview-card"><span className="eyebrow">TO BE PROCESSED</span><strong>{pendingOrders}</strong><small>Orders not yet delivered or cancelled</small></article>
  <article className="admin-overview-card"><span className="eyebrow">CUSTOMER BASE</span><strong>{customers.length||'—'}</strong><small>{customers.length?'Customer accounts loaded':'Open Customers to load accounts'}</small><button className="admin-text-link" onClick={()=>setActiveTab('customers')}>View customers <ChevronRight size={14}/></button></article>
</section>
<section className="admin-card inventory">
  <div className="admin-section-heading"><div><h2><ClipboardList/> Latest orders</h2><p>Recent orders from your customer app and laptop storefront.</p></div><button className="admin-refresh-button" onClick={()=>setActiveTab('orders')}>All orders <ChevronRight size={14}/></button></div>
  {ordersBusy?<p className="admin-hint">Loading recent orders…</p>:orders.length===0?<p className="admin-hint">No customer orders yet. New orders will appear here.</p>:orders.slice(0,5).map(o=><article className="admin-order-row" key={o.id}><div className="admin-order-main"><strong>Order #{o.order_number}</strong><small>{o.profiles?.full_name??o.delivery_address_snapshot?.recipient_name??'Customer'} · {new Date(o.created_at).toLocaleString()}</small><small>{(o.order_items??[]).map((i:any)=>i.product_name_snapshot+' × '+i.quantity).join(', ')}</small></div><div className="admin-order-actions"><b>₹{Number(o.total).toFixed(2)}</b><span className="admin-order-status-text">{String(o.status).replaceAll('_',' ')}</span></div></article>)}
</section>}
      {activeTab==='products'&&<>{      <div className="admin-columns">
        <section className="admin-card"><h2><PackagePlus/> Add a product</h2><form onSubmit={addProduct} className="admin-form">
          <label>Product name<input required value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. Heritage Toned Milk"/></label>
          <div className="admin-two"><label>Brand<select value={brand} onChange={e=>setBrand(e.target.value)}><option value="">Select brand</option>{brands.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label><label>Category<select value={category} onChange={e=>setCategory(e.target.value)}><option value="">Select category</option>{categories.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label></div>
          <div className="admin-two"><label>Selling price (₹)<input required type="number" min="0" step=".01" value={price} onChange={e=>setPrice(e.target.value)}/></label><label>MRP (₹)<input type="number" min="0" step=".01" value={mrp} onChange={e=>setMrp(e.target.value)}/></label></div>
          <div className="admin-two"><label>Stock quantity<input type="number" min="0" step="1" value={stock} onChange={e=>setStock(e.target.value)}/></label><label>Pack size / variant<input value={variant} onChange={e=>setVariant(e.target.value)} placeholder="500 ml"/></label></div>
          <label>Unit<input value={unit} onChange={e=>setUnit(e.target.value)} placeholder="packet, tub, bottle"/></label>
          <label>Description<textarea value={description} onChange={e=>setDescription(e.target.value)} placeholder="Short product description"/></label>
          <label className="image-upload"><ImagePlus size={21}/><span>{image?image.name:'Add product image (JPG, PNG, WebP)'}</span><input type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>setImage(e.target.files?.[0]??null)}/></label>
          <button className="admin-submit" disabled={busy}><Save size={17}/>{busy?'Saving…':'Save product'}</button>
        </form></section>
        <div className="admin-side">
          <section className="admin-card"><h2><Tags/> Brands & categories</h2><div className="inline-add"><input value={newBrand} onChange={e=>setNewBrand(e.target.value)} placeholder="New brand name"/><button onClick={addBrand}>Add</button></div><div className="inline-add"><input value={newCategory} onChange={e=>setNewCategory(e.target.value)} placeholder="New category"/><button onClick={addCategory}>Add</button></div><p className="admin-hint">Add a brand once, then select it for each product. This keeps the catalogue organised.</p></section>
        </div>
      </div>}      <section className="admin-card inventory"><h2>Product inventory</h2>{products.length>0&&<div className="inventory-tools"><input value={inventorySearch} onChange={e=>setInventorySearch(e.target.value)} placeholder="Search products or brands..." aria-label="Search product inventory"/><label><input type="checkbox" checked={lowStockOnly} onChange={e=>setLowStockOnly(e.target.checked)}/> Low stock only</label></div>}{products.length===0?<p className="admin-hint">No products yet. Add your first product above.</p>:visibleInventory.length===0?<p className="admin-hint">No products match this search.</p>:visibleInventory.map(p=><div className="inventory-row" key={p.id}>{p.image_urls?.[0]&&<img className="inventory-thumb" src={p.image_urls[0]} alt="" loading="lazy"/>}<span><strong>{p.name}</strong><small>{p.brands?.[0]?.name??'No brand'} · {p.is_available?'Visible in shop':'Hidden from shop'}</small></span><b>₹{Number(p.price).toFixed(2)}</b><div className="stock-actions"><small>{p.stock_quantity} in stock {p.stock_quantity===0?'· Out of stock':p.stock_quantity<=5?'· Low stock':''}</small><button type="button" title="Edit product" onClick={()=>beginEdit(p)}><Pencil size={14}/> Edit</button><button type="button" title="Remove one unit" disabled={p.stock_quantity<=0} onClick={()=>void adjustStock(p.id,p.stock_quantity,-1)}>−1</button><button type="button" title="Add one unit" onClick={()=>void adjustStock(p.id,p.stock_quantity,1)}>+1</button><button type="button" title={p.is_available?'Hide product':'Show product'} onClick={()=>void toggleProduct(p.id,p.is_available)}>{p.is_available?'Hide':'Show'}</button></div>{editingId===p.id&&<div className="admin-edit-product"><label className="image-upload"><ImagePlus size={18}/><span>{editImage?editImage.name:'Replace product image (optional)'}</span><input type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>setEditImage(e.target.files?.[0]??null)}/></label><label>Product name<input value={editName} onChange={e=>setEditName(e.target.value)}/></label><div className="admin-two"><label>Selling price (₹)<input type="number" min="0" step=".01" value={editPrice} onChange={e=>setEditPrice(e.target.value)}/></label><label>MRP (₹)<input type="number" min="0" step=".01" value={editMrp} onChange={e=>setEditMrp(e.target.value)}/></label><label>Stock quantity<input type="number" min="0" step="1" value={editStock} onChange={e=>setEditStock(e.target.value)}/></label></div><div className="stock-actions"><button type="button" disabled={editBusy} onClick={()=>void saveProductEdit(p.id)}>{editBusy?'Saving…':'Save changes'}</button><button type="button" onClick={()=>setEditingId(null)}><X size={14}/> Cancel</button></div></div>}</div>)}</section>}</>}
      {activeTab==='orders'&&      <section className="admin-card inventory"><h2><ClipboardList/> Customer orders</h2>{ordersBusy?<p className="admin-hint">Loading orders…</p>:orders.length===0?<p className="admin-hint">No customer orders yet.</p>:orders.map(o=><article className="admin-order-row" key={o.id}><div className="admin-order-main"><strong>Order #{o.order_number}</strong><small>{o.profiles?.full_name??o.delivery_address_snapshot?.recipient_name??"Customer"} · {new Date(o.created_at).toLocaleString()}</small><small>{(o.order_items??[]).map((i:any)=>i.product_name_snapshot+" × "+i.quantity).join(", ")}</small><small>{o.delivery_address_snapshot?.address_line??"Address unavailable"}</small></div><div className="admin-order-actions"><b>₹{Number(o.total).toFixed(2)}</b><select aria-label={"Status for order "+o.order_number} value={o.status} disabled={o.status==='delivered'||o.status==='cancelled'} onChange={e=>void updateOrderStatus(o.id,o.status,e.target.value)}>{[o.status,...(orderStatusTransitions[o.status]??[])].map(s=><option key={s} value={s}>{s.replaceAll("_"," ")}</option>)}</select></div></article>)}</section>}
      {activeTab==='customers'&&<section className="admin-card inventory">
  <div className="admin-section-heading"><div><h2><Users/> Customers</h2><p>Customer accounts connected through Google sign-in.</p></div><button className="admin-refresh-button" type="button" onClick={()=>void refreshCustomers()}><RefreshCw size={15}/> Refresh</button></div>
  <div className="inventory-tools"><input value={customerSearch} onChange={e=>setCustomerSearch(e.target.value)} placeholder="Search customers by name, phone or role..."/><span className="admin-hint">{visibleCustomers.length} customers</span></div>
  {visibleCustomers.length===0?<p className="admin-hint">No customer accounts found yet. Customers appear here after their first Google sign-in.</p>:<div className="admin-customer-list">{visibleCustomers.map(customer=><article className="admin-customer-row" key={customer.id}>
    <div className="admin-customer-avatar">{customer.avatar_url?<img src={customer.avatar_url} alt="" loading="lazy"/>:<Users size={18}/>}</div>
    <div className="admin-customer-info"><strong>{customer.full_name||'Sai Sathwika customer'}</strong><small>{customer.phone||'Phone not added'} · Joined {new Date(customer.created_at).toLocaleDateString()}</small></div>
    <span className={'admin-role-pill '+customer.role}>{customer.role.replaceAll('_',' ')}</span>
    <span className={customer.is_active?'admin-active-pill':'admin-inactive-pill'}>{customer.is_active?'Active':'Inactive'}</span>
  </article>)}</div>}
</section>}
      {activeTab==='promotions'&&<section className="admin-card">
  <h2><Percent/> Promotions & offers</h2>
  <p className="admin-hint">Create discounts for the store. New promotions start disabled so you can review them before customers see them.</p>
  <form className="admin-form admin-promotion-form" onSubmit={event=>{event.preventDefault();void addPromotion();}}>
    <label>Promotion name<input required value={promotionName} onChange={e=>setPromotionName(e.target.value)} placeholder="e.g. Weekend dairy savings"/></label>
    <label>Description<input value={promotionDescription} onChange={e=>setPromotionDescription(e.target.value)} placeholder="Offer details for customers"/></label>
    <div className="admin-two">
      <label>Offer type<select value={promotionType} onChange={e=>setPromotionType(e.target.value)}><option value="percentage">Percentage discount</option><option value="fixed_amount">Fixed amount off</option><option value="free_delivery">Free delivery</option><option value="bundle">Bundle offer</option></select></label>
      <label>{promotionType==='percentage'?'Discount (%)':promotionType==='fixed_amount'?'Discount (₹)':'Offer value'}<input type="number" min="1" step="0.01" value={promotionRules} onChange={e=>setPromotionRules(e.target.value)} disabled={promotionType==='free_delivery'||promotionType==='bundle'}/></label>
    </div>
    <button className="admin-submit" disabled={promotionBusy}><Save size={16}/>{promotionBusy?'Creating…':'Create promotion'}</button>
  </form>
  <div className="admin-promotion-list">{promotions.length===0?<p className="admin-hint">No promotions created yet.</p>:promotions.map(p=><article className="admin-promotion-row" key={p.id}>
    <div><strong>{p.name}</strong><small>{p.description||p.promotion_type.replaceAll('_',' ')}</small><small>{p.promotion_type.replaceAll('_',' ')} · Created {new Date(p.created_at).toLocaleDateString()}</small></div>
    <span className={p.is_active?'admin-active-pill':'admin-inactive-pill'}>{p.is_active?'Active':'Draft'}</span>
    <button type="button" onClick={()=>void togglePromotion(p.id,p.is_active)}>{p.is_active?'Pause':'Activate'}</button>
  </article>)}</div>
</section>}
      {activeTab==='store'&&<section className="admin-card"><h2><Store/> Delivery settings</h2><label className="admin-label">Delivery radius (km)<input type="number" min=".5" max="100" step=".5" value={radius} onChange={e=>setRadius(e.target.value)}/></label><label className="admin-label">Delivery fee (₹)<input type="number" min="0" value={deliveryFee} onChange={e=>setDeliveryFee(e.target.value)}/></label><div className="admin-two"><label>Store latitude<input type="number" step="any" value={storeLat} onChange={e=>setStoreLat(e.target.value)} placeholder="17.0000"/></label><label>Store longitude<input type="number" step="any" value={storeLng} onChange={e=>setStoreLng(e.target.value)} placeholder="78.0000"/></label></div><button type="button" className="admin-location-button" onClick={captureStoreLocation} disabled={storeLocationBusy}><LocateFixed size={16}/>{storeLocationBusy?"Getting location…":"Use this device to set store location"}</button><p className="admin-hint">Capture this while you are physically at the store. Required to verify customer delivery distance.</p><label className="admin-check"><input type="checkbox" checked={accepting} onChange={e=>setAccepting(e.target.checked)}/> Accepting orders</label><button className="admin-submit" onClick={saveStore}>Save store settings</button></section>}
      {activeTab==='diagnostics'&&<section className="admin-card inventory">
  <div className="admin-section-heading"><div><h2><Activity/> Live app health & diagnostics</h2><p>Runtime errors submitted by signed-in app users. Only the super-admin account can read these records.</p></div><button type="button" className="admin-refresh-button" onClick={()=>void refreshDiagnostics()} disabled={diagnosticsBusy}><RefreshCw size={15}/> {diagnosticsBusy?'Refreshing…':'Refresh'}</button></div>
  <div className="admin-health-summary"><article><strong>{diagnostics.length}</strong><span>Recent records</span></article><article><strong>{diagnostics.filter(x=>x.level==='error').length}</strong><span>Errors</span></article><article><strong>{diagnostics.filter(x=>x.level==='warning').length}</strong><span>Warnings</span></article><article><strong>{lastRefreshed?lastRefreshed.toLocaleTimeString():'—'}</strong><span>Last refresh</span></article></div>
  {diagnostics.length===0?<p className="admin-hint">No diagnostic records are visible. If you see a permission error above, sign in with the designated super-admin Google account.</p>:<div className="admin-diagnostic-list">{diagnostics.map(entry=><article className="admin-diagnostic-row" key={entry.id}>
    <div className="admin-diagnostic-top"><span className={entry.level==='error'?'admin-error-pill':'admin-warning-pill'}>{entry.level}</span><small>{new Date(entry.received_at).toLocaleString()}</small><small>{entry.platform} · {entry.app_version||'version not reported'}</small></div>
    <strong>{entry.message}</strong>
    {entry.stack&&<details><summary>View technical details</summary><pre>{entry.stack}</pre></details>}
  </article>)}</div>}
</section>}
    </section>
  </main>;

}
