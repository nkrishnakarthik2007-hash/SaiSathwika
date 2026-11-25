import { useEffect, useState } from 'react';
import { ImagePlus, PackagePlus, Tags, Store, ArrowLeft, Save, ShieldCheck } from 'lucide-react';
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

  async function refresh(){
    if(!supabase)return;
    const [b,c,p,s]=await Promise.all([
      supabase.from('brands').select('id,name').eq('is_active',true).order('name'),
      supabase.from('categories').select('id,name').eq('is_active',true).order('sort_order'),
      supabase.from('products').select('id,name,price,stock_quantity,is_available,brands(name)').order('created_at',{ascending:false}),
      supabase.from('store_settings').select('delivery_radius_km,delivery_fee,accepting_orders').eq('id',1).single()
    ]);
    setBrands(b.data??[]);setCategories(c.data??[]);setProducts(p.data??[]);
    if(s.data){setRadius(String(s.data.delivery_radius_km));setDeliveryFee(String(s.data.delivery_fee));setAccepting(s.data.accepting_orders);}
  }
  useEffect(()=>{void refresh()},[]);
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
        const safe=image.name.replace(/[^a-zA-Z0-9._-]/g,'-');
        const path=`${crypto.randomUUID()}-${safe}`;
        const {error:uploadError}=await supabase.storage.from('product-images').upload(path,image,{upsert:false,contentType:image.type});
        if(uploadError)throw uploadError;
        const {data}=supabase.storage.from('product-images').getPublicUrl(path);
        image_urls=[data.publicUrl];
      }
      const {error}=await supabase.from('products').insert({
        name:name.trim(),brand_id:brand||null,category_id:category||null,
        price:Number(price),mrp:mrp?Number(mrp):null,stock_quantity:Number(stock),
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
    const {error}=await supabase.from('store_settings').update({delivery_radius_km:Number(radius),delivery_fee:Number(deliveryFee),accepting_orders:accepting}).eq('id',1);
    setMessage(error?.message??'Store settings saved');
  }
  return <main className="admin-page">
    <header className="admin-top"><button onClick={onBack}><ArrowLeft size={17}/> Storefront</button><div><ShieldCheck size={19}/> Sai Sathwika · Admin</div></header>
    <section className="admin-shell">
      <div className="admin-heading"><span className="eyebrow">STORE CONTROL CENTRE</span><h1>Good morning, Admin.</h1><p>Manage products, brands, categories and delivery settings.</p></div>
      <div className="admin-stats"><article><PackagePlus/><strong>{products.length}</strong><span>Products</span></article><article><Tags/><strong>{brands.length}</strong><span>Brands</span></article><article><Store/><strong>{categories.length}</strong><span>Categories</span></article></div>
      {message&&<div className="admin-message">{message}</div>}
      <div className="admin-columns">
        <section className="admin-card"><h2><PackagePlus/> Add a product</h2><form onSubmit={addProduct} className="admin-form">
          <label>Product name<input required value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. Heritage Toned Milk"/></label>
          <div className="admin-two"><label>Brand<select value={brand} onChange={e=>setBrand(e.target.value)}><option value="">Select brand</option>{brands.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label><label>Category<select value={category} onChange={e=>setCategory(e.target.value)}><option value="">Select category</option>{categories.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label></div>
          <div className="admin-two"><label>Selling price (₹)<input required type="number" min="0" step=".01" value={price} onChange={e=>setPrice(e.target.value)}/></label><label>MRP (₹)<input type="number" min="0" step=".01" value={mrp} onChange={e=>setMrp(e.target.value)}/></label></div>
          <div className="admin-two"><label>Stock quantity<input type="number" min="0" value={stock} onChange={e=>setStock(e.target.value)}/></label><label>Pack size / variant<input value={variant} onChange={e=>setVariant(e.target.value)} placeholder="500 ml"/></label></div>
          <label>Unit<input value={unit} onChange={e=>setUnit(e.target.value)} placeholder="packet, tub, bottle"/></label>
          <label>Description<textarea value={description} onChange={e=>setDescription(e.target.value)} placeholder="Short product description"/></label>
          <label className="image-upload"><ImagePlus size={21}/><span>{image?image.name:'Add product image (JPG, PNG, WebP)'}</span><input type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>setImage(e.target.files?.[0]??null)}/></label>
          <button className="admin-submit" disabled={busy}><Save size={17}/>{busy?'Saving…':'Save product'}</button>
        </form></section>
        <div className="admin-side">
          <section className="admin-card"><h2><Tags/> Brands & categories</h2><div className="inline-add"><input value={newBrand} onChange={e=>setNewBrand(e.target.value)} placeholder="New brand name"/><button onClick={addBrand}>Add</button></div><div className="inline-add"><input value={newCategory} onChange={e=>setNewCategory(e.target.value)} placeholder="New category"/><button onClick={addCategory}>Add</button></div><p className="admin-hint">Add a brand once, then select it for each product. This keeps the catalogue organised.</p></section>
          <section className="admin-card"><h2><Store/> Delivery settings</h2><label className="admin-label">Delivery radius (km)<input type="number" min=".5" max="100" step=".5" value={radius} onChange={e=>setRadius(e.target.value)}/></label><label className="admin-label">Delivery fee (₹)<input type="number" min="0" value={deliveryFee} onChange={e=>setDeliveryFee(e.target.value)}/></label><label className="admin-check"><input type="checkbox" checked={accepting} onChange={e=>setAccepting(e.target.checked)}/> Accepting orders</label><button className="admin-submit" onClick={saveStore}>Save store settings</button></section>
        </div>
      </div>
      <section className="admin-card inventory"><h2>Product inventory</h2>{products.length===0?<p className="admin-hint">No products yet. Add your first product above.</p>:products.map(p=><div className="inventory-row" key={p.id}><span><strong>{p.name}</strong><small>{p.brands?.[0]?.name??'No brand'}</small></span><b>₹{Number(p.price).toFixed(2)}</b><small>{p.stock_quantity} in stock</small></div>)}</section>
    </section>
  </main>;
}
