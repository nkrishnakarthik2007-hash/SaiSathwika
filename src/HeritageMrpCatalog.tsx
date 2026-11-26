import { useMemo, useState } from 'react';
import { Search, Plus, ExternalLink, Image as ImageIcon, CheckCircle2 } from 'lucide-react';
import { supabase } from './lib/supabase';

type MrpRow = {
  code: string; product: string; packType: string; packSize: string;
  oldMrp: number; mrp: number; grammage?: string; category: string; image?: string;
};

// Transcribed from Heritage Foods' official Andhra Pradesh circular dated 21-Sep-2025.
// These are historical reference MRPs effective 22-Sep-2025, not a live/current price feed.
const cowGheeImage = 'https://cdn.dmart.in/images/products/DEC110003150xx26DEC22_5_B.jpg';
const cookingButterImage = 'https://www.jiomart.com/images/product/original/490440260/heritage-white-butter-200-g-carton-product-images-o490440260-p591013535-4-202203151053.jpg?im=Resize%3D%28420%2C420%29';
const cheeseSlicesImage = 'https://www.bbassets.com/media/uploads/p/xl/40209533_3-heritage-cheese-slices.jpg';
const milkImage = 'https://www.heritagefoods.in/static/images/detailslider/milk/farm-fresh-milk-big.png';
const rows: MrpRow[] = [
  {code:'CB-200',product:'Cooking Butter',packType:'Carton',packSize:'200 g',oldMrp:130,mrp:120,category:'Butter',image:cookingButterImage},
  {code:'CB-500',product:'Cooking Butter',packType:'Carton',packSize:'500 g',oldMrp:320,mrp:300,category:'Butter',image:cookingButterImage},
  {code:'PTB-100',product:'PT Butter',packType:'Carton',packSize:'100 g',oldMrp:62,mrp:58,category:'Butter'},
  {code:'PTB-500',product:'PT Butter',packType:'Carton',packSize:'500 g',oldMrp:305,mrp:285,category:'Butter'},
  {code:'CG-PP-200',product:'Cow Ghee',packType:'PP pouch',packSize:'200 ml',oldMrp:155,mrp:145,category:'Ghee',image:cowGheeImage},
  {code:'CG-PP-500',product:'Cow Ghee',packType:'PP pouch',packSize:'500 ml',oldMrp:375,mrp:350,category:'Ghee',image:cowGheeImage},
  {code:'CG-PP-1000',product:'Cow Ghee',packType:'PP pouch',packSize:'1,000 ml',oldMrp:735,mrp:690,category:'Ghee',image:cowGheeImage},
  {code:'CG-J-50',product:'Cow Ghee',packType:'Jar',packSize:'50 ml',oldMrp:50,mrp:45,category:'Ghee',image:cowGheeImage},
  {code:'CG-J-100',product:'Cow Ghee',packType:'Jar',packSize:'100 ml',oldMrp:95,mrp:90,category:'Ghee',image:cowGheeImage},
  {code:'CG-J-200',product:'Cow Ghee',packType:'Jar',packSize:'200 ml',oldMrp:165,mrp:155,category:'Ghee',image:cowGheeImage},
  {code:'CG-J-500',product:'Cow Ghee',packType:'Jar',packSize:'500 ml',oldMrp:390,mrp:365,category:'Ghee',image:cowGheeImage},
  {code:'CG-J-1000',product:'Cow Ghee',packType:'Jar',packSize:'1,000 ml',oldMrp:760,mrp:710,category:'Ghee',image:cowGheeImage},
  {code:'CG-J-5000',product:'Cow Ghee',packType:'Jar',packSize:'5,000 ml',oldMrp:3750,mrp:3500,category:'Ghee',image:cowGheeImage},
  {code:'CG-SP-200',product:'Cow Ghee',packType:'Spout pack',packSize:'200 ml',oldMrp:160,mrp:150,category:'Ghee',image:cowGheeImage},
  {code:'CG-SP-500',product:'Cow Ghee',packType:'Spout pack',packSize:'500 ml',oldMrp:390,mrp:365,category:'Ghee',image:cowGheeImage},
  {code:'CG-SP-750',product:'Cow Ghee',packType:'Spout pack',packSize:'750 ml',oldMrp:575,mrp:540,category:'Ghee',image:cowGheeImage},
  {code:'CG-SP-1000',product:'Cow Ghee',packType:'Spout pack',packSize:'1,000 ml',oldMrp:765,mrp:720,category:'Ghee',image:cowGheeImage},
  {code:'BG-PP-500',product:'Buffalo Ghee',packType:'PP pouch',packSize:'500 ml',oldMrp:385,mrp:360,category:'Ghee'},
  {code:'BG-PP-1000',product:'Buffalo Ghee',packType:'PP pouch',packSize:'1,000 ml',oldMrp:745,mrp:699,category:'Ghee'},
  {code:'BG-TIN-5000',product:'Buffalo Ghee',packType:'Tin',packSize:'5,000 ml',oldMrp:3800,mrp:3560,category:'Ghee'},
  {code:'BG-J-200',product:'Buffalo Ghee',packType:'Jar',packSize:'200 ml',oldMrp:170,mrp:160,category:'Ghee'},
  {code:'BG-J-500',product:'Buffalo Ghee',packType:'Jar',packSize:'500 ml',oldMrp:400,mrp:375,category:'Ghee'},
  {code:'BG-J-1000',product:'Buffalo Ghee',packType:'Jar',packSize:'1,000 ml',oldMrp:780,mrp:730,category:'Ghee'},
  {code:'HA-SP-50',product:'Ghee Hi Aroma',packType:'Standee pack',packSize:'50 ml',oldMrp:48,mrp:45,category:'Ghee'},
  {code:'HA-SP-100',product:'Ghee Hi Aroma',packType:'Standee pack',packSize:'100 ml',oldMrp:90,mrp:85,category:'Ghee'},
  {code:'HA-SP-200',product:'Ghee Hi Aroma',packType:'Standee pack',packSize:'200 ml',oldMrp:160,mrp:150,category:'Ghee'},
  {code:'HA-J-200',product:'Ghee Hi Aroma',packType:'Jar',packSize:'200 ml',oldMrp:170,mrp:160,category:'Ghee'},
  {code:'HA-J-500',product:'Ghee Hi Aroma',packType:'Jar',packSize:'500 ml',oldMrp:400,mrp:375,category:'Ghee'},
  {code:'HA-J-1000',product:'Ghee Hi Aroma',packType:'Jar',packSize:'1,000 ml',oldMrp:780,mrp:730,category:'Ghee'},
  {code:'CC-TIN-180',product:'Cold Coffee',packType:'Tin',packSize:'180 ml',oldMrp:50,mrp:50,grammage:'190 ml',category:'Beverages'},
  {code:'CC-PP-170',product:'Cold Coffee',packType:'PP pack',packSize:'170 ml',oldMrp:35,mrp:35,grammage:'180 ml',category:'Beverages'},
  {code:'CC-SIG-170',product:'Cold Coffee',packType:'SIG pack',packSize:'170 ml',oldMrp:35,mrp:35,grammage:'180 ml',category:'Beverages'},
  {code:'CHEESE-S-100',product:'Cheese',packType:'Slices',packSize:'100 g',oldMrp:80,mrp:75,category:'Cheese',image:cheeseSlicesImage},
  {code:'CHEESE-S-200',product:'Cheese',packType:'Slices',packSize:'200 g',oldMrp:145,mrp:135,category:'Cheese',image:cheeseSlicesImage},
  {code:'CHEESE-S-480',product:'Cheese',packType:'Slices',packSize:'480 g',oldMrp:295,mrp:275,category:'Cheese',image:cheeseSlicesImage},
  {code:'CHEESE-C-200',product:'Cheese',packType:'Cubes',packSize:'200 g',oldMrp:145,mrp:135,category:'Cheese'},
  {code:'CHEESE-C-120',product:'Cheese',packType:'Cubes',packSize:'120 g',oldMrp:95,mrp:90,category:'Cheese'},
  {code:'CHEESE-B-200',product:'Cheese',packType:'Blocks',packSize:'200 g',oldMrp:135,mrp:125,category:'Cheese'},
  {code:'CHEESE-B-400',product:'Cheese',packType:'Blocks',packSize:'400 g',oldMrp:245,mrp:230,category:'Cheese'},
  {code:'CHEESE-B-1000',product:'Cheese',packType:'Blocks',packSize:'1,000 g',oldMrp:555,mrp:520,category:'Cheese'},
  {code:'CHEESE-M-500',product:'Cheese',packType:'Mozzarella',packSize:'500 g',oldMrp:300,mrp:280,category:'Cheese'},
  {code:'UHT-T-1000',product:'UHT Milk',packType:'Tetra pack',packSize:'1,000 ml',oldMrp:75,mrp:72,category:'Milk',image:milkImage},
  {code:'UHT-T-200',product:'UHT Milk',packType:'Tetra pack',packSize:'200 ml',oldMrp:16,mrp:15,category:'Milk',image:milkImage},
  {code:'AP-UHT-TM-475',product:'AP Special UHT Toned Milk',packType:'Special TM',packSize:'475 ml',oldMrp:29,mrp:28,grammage:'480 ml',category:'Milk',image:milkImage},
  {code:'AP-UHT-TM-170',product:'AP Special UHT Toned Milk',packType:'Special TM',packSize:'170 ml',oldMrp:12,mrp:12,grammage:'175 ml',category:'Milk',image:milkImage},
  {code:'AP-UHT-DTM-475',product:'AP Special UHT Double Toned Milk',packType:'Special DTM',packSize:'475 ml',oldMrp:27,mrp:26,grammage:'480 ml',category:'Milk',image:milkImage},
  {code:'AP-UHT-DTMC-170',product:'AP Special UHT Double Toned Cow Milk',packType:'Special DTM Cow',packSize:'170 ml',oldMrp:12,mrp:12,grammage:'175 ml',category:'Milk',image:milkImage},
  {code:'AP-UHT-DTM-80',product:'AP Special UHT Double Toned Milk',packType:'Special DTM',packSize:'80 ml',oldMrp:8,mrp:8,grammage:'85 ml',category:'Milk',image:milkImage},
  {code:'AP-UHT-DTM-135',product:'AP Special UHT Double Toned Milk',packType:'Special DTM',packSize:'135 ml',oldMrp:10,mrp:10,grammage:'140 ml',category:'Milk',image:milkImage},
  {code:'AP-UHT-TM-500',product:'AP Special UHT Toned Milk',packType:'Special TM',packSize:'500 ml',oldMrp:30,mrp:29,grammage:'500 ml',category:'Milk',image:milkImage},
];

function Placeholder({row}:{row:MrpRow}) {
  return <div className="heritage-mrp-placeholder"><span>HERITAGE</span><strong>{row.product}</strong><small>{row.packType} · {row.packSize}</small><em>Replace with pack photo</em></div>;
}

export default function HeritageMrpCatalog({onMessage}:{onMessage:(message:string)=>void}) {
  const [search,setSearch]=useState('');
  const [filter,setFilter]=useState('All');
  const [busy,setBusy]=useState<string|null>(null);
  const [added,setAdded]=useState<string[]>([]);
  const visible=useMemo(()=>rows.filter(row=>(filter==='All'||row.category===filter)&&[row.product,row.packType,row.packSize,row.code].join(' ').toLowerCase().includes(search.toLowerCase())),[search,filter]);
  async function addDraft(row:MrpRow) {
    if(!supabase)return;
    setBusy(row.code);
    try {
      let brandId:string|null=null;
      const {data:brand}=await supabase.from('brands').select('id').eq('name','Heritage').maybeSingle();
      if(brand?.id)brandId=brand.id;
      else {
        const {data:created,error}=await supabase.from('brands').insert({name:'Heritage'}).select('id').single();
        if(error&&error.code!=='23505')throw error;
        if(created?.id)brandId=created.id;
        else {const retry=await supabase.from('brands').select('id').eq('name','Heritage').single();if(retry.error)throw retry.error;brandId=retry.data.id;}
      }
      const sku='HFL-AP-202509-'+row.code;
      const {data:existing,error:lookupError}=await supabase.from('products').select('id').eq('sku',sku).maybeSingle();
      if(lookupError)throw lookupError;
      if(existing){setAdded(current=>[...current,row.code]);onMessage(row.product+' '+row.packSize+' is already in your product inventory.');return;}
      const {error}=await supabase.from('products').insert({
        brand_id:brandId, name:'Heritage '+row.product+' · '+row.packSize,
        description:'Draft imported from Heritage Foods Andhra Pradesh MRP circular dated 21-Sep-2025. Historical reference only; verify printed pack MRP before sale.',
        sku, image_urls:row.image?[row.image]:[], variant_label:row.packType+' · '+row.packSize,
        unit:row.packType, price:0, mrp:row.mrp, stock_quantity:0, is_available:false, is_featured:false
      });
      if(error)throw error;
      setAdded(current=>[...current,row.code]);
      onMessage('Draft product added. Verify current pack MRP, set selling price and stock, then upload the correct pack image before publishing.');
    } catch(error:any) { onMessage(error?.message??'Could not add this draft product.'); }
    finally {setBusy(null);}
  }
  return <section className="admin-card heritage-mrp-page">
    <div className="admin-section-heading"><div><h2>Heritage AP MRP reference</h2><p>SKU-wise reference from the official circular · 21 Sep 2025 · effective 22 Sep 2025</p></div><a className="admin-refresh-button" href="https://www.heritagefoods.in/static/images/pdf/gst-pdfs/AP-2_merged.pdf" target="_blank" rel="noreferrer">Open official PDF <ExternalLink size={14}/></a></div>
    <div className="heritage-mrp-warning">Historical reference only. The circular is not a live price feed. Check the printed MRP on the stock you receive before publishing any product.</div>
    <div className="heritage-mrp-tools"><label className="heritage-mrp-search"><Search size={17}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search product, pack size or code…"/></label><div className="heritage-mrp-filters">{['All','Ghee','Butter','Beverages','Cheese','Milk'].map(item=><button type="button" key={item} className={filter===item?'active':''} onClick={()=>setFilter(item)}>{item}</button>)}</div></div>
    <p className="admin-hint">Showing {visible.length} of {rows.length} named / identifiable SKU rows. Ice-cream entries are excluded from draft import because the circular does not name their flavours. Product photos are representative pack references from Heritage / retail listings; check the exact pack and replace the image before publishing.</p>
    <div className="heritage-mrp-grid">{visible.map(row=><article className="heritage-mrp-card" key={row.code}>
      <div className="heritage-mrp-image">{row.image?<img src={row.image} alt="Heritage Cow Ghee official product pack range" loading="lazy"/>:<Placeholder row={row}/>}</div>
      <div className="heritage-mrp-card-body"><div className="heritage-mrp-card-title"><strong>{row.product}</strong><span>{row.code}</span></div><p>{row.packType} · {row.packSize}{row.grammage?' · New grammage '+row.grammage:''}</p><div className="heritage-mrp-prices"><span>Old ₹{row.oldMrp.toFixed(2)}</span><strong>Reference MRP ₹{row.mrp.toFixed(2)}</strong></div><button type="button" className="heritage-mrp-add" disabled={busy===row.code||added.includes(row.code)} onClick={()=>void addDraft(row)}>{added.includes(row.code)?<><CheckCircle2 size={15}/> In inventory</>:<><Plus size={15}/>{busy===row.code?'Adding…':'Add as hidden draft'}</>}</button></div>
    </article>)}</div>
    <p className="heritage-mrp-footnote"><ImageIcon size={14}/> Photos are genuine reference pack images for selected product families, not a guarantee of the exact pack size or packaging currently supplied. Draft products stay hidden with zero stock. Replace each image with your own pack photo from Admin → Products → Edit before publishing.</p>
  </section>;
}
