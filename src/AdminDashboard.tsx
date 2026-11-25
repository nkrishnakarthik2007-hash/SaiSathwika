import { useEffect, useState } from 'react';
import { ImagePlus, PackagePlus, Tags, Store, ArrowLeft, Save, ShieldCheck, LocateFixed, ClipboardList, Pencil, X } from 'lucide-react';
import { supabase } from './lib/supabase';

type Option = { id: string; name: string };
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

  async function refresh(){
    if(!supabase)return;
    const [b,c,p,s]=await Promise.all([
      supabase.from('brands').select('id,name').eq('is_active',true).order('name'),
      supabase.from('categories').select('id,name').eq('is_active',true).order('sort_order'),
      supabase.from('products').select('id,name,price,mrp,stock_quantity,is_available,brands(name)').order('created_at',{ascending:false}),
      supabase.from('store_settings').select('delivery_radius_km,delivery_fee,accepting_orders,store_latitude,store_longitude').eq('id',1).single()
    ]);
    setBrands(b.data??[]);setCategories(c.data??[]);setProducts(p.data??[]);
    if(s.data){setRadius(String(s.data.delivery_radius_km));setDeliveryFee(String(s.data.delivery_fee));setAccepting(s.data.accepting_orders);setStoreLat(s.data.store_latitude==null?'':String(s.data.store_latitude));setStoreLng(s.data.store_longitude==null?'':String(s.data.store_longitude));}
  }
  async function refreshOrders(){
    if(!supabase)return;
    setOrdersBusy(true);
    const {data,error}=await supabase.from('orders').select('id,order_number,status,total,created_at,customer_id,delivery_address_snapshot,profiles(full_name,phone),order_items(product_name_snapshot,quantity)').order('created_at',{ascending:false}).limit(50);
    if(error)setMessage(error.message);else setOrders(data??[]);
    setOrdersBusy(false);
  }
  useEffect(()=>{void refresh();void refreshOrders()},[]);
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
    setEditingId(product.id);setEditName(product.name);setEditPrice(String(product.price));
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
    const {error}=await supabase.from('products').update({name:editName.trim(),price:priceValue,mrp:mrpValue,stock_quantity:stockValue}).eq('id',id);
    setEditBusy(false);
    if(error)setMessage(error.message);else{setMessage('Product details updated.');setEditingId(null);void refresh();}
  }
  async function toggleProduct(id:string,available:boolean){
    if(!supabase)return;
    const {error}=await supabase.from('products').update({is_available:!available}).eq('id',id);
    if(error)setMessage(error.message);else{setMessage('Product visibility updated.');void refresh();}
  }
  async function updateOrderStatus(id:string,currentStatus:string,status:string){
    if(!supabase)return;
    const allowed:Record<string,string[]>={placed:['confirmed','cancelled'],confirmed:['preparing','cancelled'],preparing:['out_for_delivery','cancelled'],out_for_delivery:['delivered','cancelled'],delivered:[],cancelled:[]};
    if(!allowed[currentStatus]?.includes(status)){setMessage('This order status change is not allowed.');return;}
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
        if(image.size>5*1024*1024)throw new Error('Product image must be 5 MB or smaller.');
        const safe=image.name.replace(/[^a-zA-Z0-9._-]/g,'-');
        const path=`${crypto.randomUUID()}-${safe}`;
        const {error:uploadError}=await supabase.storage.from('product-images').upload(path,image,{upsert:false,contentType:image.type});
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
  return <main className="admin-page">
    <header className="admin-top"><button onClick={onBack}><ArrowLeft size={17}/> Storefront</button><div><ShieldCheck size={19}/> Sai Sathwika · Admin</div></header>
    <section className="admin-shell">
      <div className="admin-heading"><span className="eyebrow">STORE CONTROL CENTRE</span><h1>Good morning, Admin.</h1><p>Manage products, brands, categories and delivery settings.</p></div>
      <div className="admin-stats"><article><PackagePlus/><strong>{products.length}</strong><span>Products</span></article><article><PackagePlus/><strong>{products.filter(p=>p.stock_quantity<=5).length}</strong><span>Low stock (5 or less)</span></article><article><Tags/><strong>{brands.length}</strong><span>Brands</span></article><article><Store/><strong>{categories.length}</strong><span>Categories</span></article></div>
      {message&&<div className="admin-message">{message}</div>}
      <div className="admin-columns">
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
          <section className="admin-card"><h2><Store/> Delivery settings</h2><label className="admin-label">Delivery radius (km)<input type="number" min=".5" max="100" step=".5" value={radius} onChange={e=>setRadius(e.target.value)}/></label><label className="admin-label">Delivery fee (₹)<input type="number" min="0" value={deliveryFee} onChange={e=>setDeliveryFee(e.target.value)}/></label><div className="admin-two"><label>Store latitude<input type="number" step="any" value={storeLat} onChange={e=>setStoreLat(e.target.value)} placeholder="17.0000"/></label><label>Store longitude<input type="number" step="any" value={storeLng} onChange={e=>setStoreLng(e.target.value)} placeholder="78.0000"/></label></div><button type="button" className="admin-location-button" onClick={captureStoreLocation} disabled={storeLocationBusy}><LocateFixed size={16}/>{storeLocationBusy?"Getting location…":"Use this device to set store location"}</button><p className="admin-hint">Capture this while you are physically at the store. Required to verify customer delivery distance.</p><label className="admin-check"><input type="checkbox" checked={accepting} onChange={e=>setAccepting(e.target.checked)}/> Accepting orders</label><button className="admin-submit" onClick={saveStore}>Save store settings</button></section>
        </div>
      </div>
      <section className="admin-card inventory"><h2><ClipboardList/> Customer orders</h2>{ordersBusy?<p className="admin-hint">Loading orders…</p>:orders.length===0?<p className="admin-hint">No customer orders yet.</p>:orders.map(o=><article className="admin-order-row" key={o.id}><div className="admin-order-main"><strong>Order #{o.order_number}</strong><small>{o.profiles?.full_name??o.delivery_address_snapshot?.recipient_name??"Customer"} · {new Date(o.created_at).toLocaleString()}</small><small>{(o.order_items??[]).map((i:any)=>i.product_name_snapshot+" × "+i.quantity).join(", ")}</small><small>{o.delivery_address_snapshot?.address_line??"Address unavailable"}</small></div><div className="admin-order-actions"><b>₹{Number(o.total).toFixed(2)}</b><select aria-label={"Status for order "+o.order_number} value={o.status} disabled={o.status==='delivered'||o.status==='cancelled'} onChange={e=>void updateOrderStatus(o.id,o.status,e.target.value)}>{["placed","confirmed","preparing","out_for_delivery","delivered","cancelled"].map(s=><option key={s} value={s}>{s.replaceAll("_"," ")}</option>)}</select></div></article>)}</section>
      <section className="admin-card inventory"><h2>Product inventory</h2>{products.length===0?<p className="admin-hint">No products yet. Add your first product above.</p>:products.map(p=><div className="inventory-row" key={p.id}><span><strong>{p.name}</strong><small>{p.brands?.[0]?.name??'No brand'} · {p.is_available?'Visible in shop':'Hidden from shop'}</small></span><b>₹{Number(p.price).toFixed(2)}</b><div className="stock-actions"><small>{p.stock_quantity} in stock {p.stock_quantity===0?'· Out of stock':p.stock_quantity<=5?'· Low stock':''}</small><button type="button" title="Edit product" onClick={()=>beginEdit(p)}><Pencil size={14}/> Edit</button><button type="button" title="Remove one unit" disabled={p.stock_quantity<=0} onClick={()=>void adjustStock(p.id,p.stock_quantity,-1)}>−1</button><button type="button" title="Add one unit" onClick={()=>void adjustStock(p.id,p.stock_quantity,1)}>+1</button><button type="button" title={p.is_available?'Hide product':'Show product'} onClick={()=>void toggleProduct(p.id,p.is_available)}>{p.is_available?'Hide':'Show'}</button></div>{editingId===p.id&&<div className="admin-edit-product"><label>Product name<input value={editName} onChange={e=>setEditName(e.target.value)}/></label><div className="admin-two"><label>Selling price (₹)<input type="number" min="0" step=".01" value={editPrice} onChange={e=>setEditPrice(e.target.value)}/></label><label>MRP (₹)<input type="number" min="0" step=".01" value={editMrp} onChange={e=>setEditMrp(e.target.value)}/></label><label>Stock quantity<input type="number" min="0" step="1" value={editStock} onChange={e=>setEditStock(e.target.value)}/></label></div><div className="stock-actions"><button type="button" disabled={editBusy} onClick={()=>void saveProductEdit(p.id)}>{editBusy?'Saving…':'Save changes'}</button><button type="button" onClick={()=>setEditingId(null)}><X size={14}/> Cancel</button></div></div>}</div>)}</section>
    </section>
  </main>;
}
