const site = 'https://esencia-vestuario.pages.dev';
const issuer = 'https://dry-wind-d8ef.cloudflareaccess.com';
const audience = 'ecb9d2b4ce2a0e020743378d6d84c9e0df39bff12f96e66f7cbc538ac76984e4';
const email = 'esenciavestuario@gmail.com';
const decode = value => Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
const json = (data, status = 200) => Response.json(data, {status, headers:{'Cache-Control':'no-store'}});
async function authorized(request) {
  try {
    const token = request.headers.get('Cf-Access-Jwt-Assertion') || '';
    const [head, body, signature, extra] = token.split('.');
    if (!signature || extra !== undefined) return false;
    const read = part => JSON.parse(new TextDecoder().decode(decode(part)));
    const header = read(head), claims = read(body), now = Date.now()/1000;
    if (header.alg !== 'RS256' || claims.iss !== issuer || !Array.isArray(claims.aud) ||
        !claims.aud.includes(audience) || claims.email !== email || !(claims.exp > now) || claims.nbf > now) return false;
    const {keys} = await fetch(issuer + '/cdn-cgi/access/certs').then(r => r.json());
    const key = await crypto.subtle.importKey('jwk', keys.find(k => k.kid === header.kid),
      {name:'RSASSA-PKCS1-v1_5', hash:'SHA-256'}, false, ['verify']);
    return await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, decode(signature), new TextEncoder().encode(head+'.'+body));
  } catch { return false; }
}
const originals = [["Blazer largo con botones", "Blazers", 32000, "Fucsia,Azul,Verde,Negro", "Azul"], ["Blusa de satín", "Blusas de satín", 14500, "Fucsia,Azul,Verde,Negro,Dorado,Celeste", "Dorado"], ["Conjunto", "Conjuntos", 38000, "Negro,Beige,Blanco", ""], ["Chaleco", "Chalecos", 32000, "Fucsia,Azul,Verde,Negro", "Fucsia"], ["Blusa de vestir", "Blusas de vestir", 14500, "Verde,Negro", ""], ["Pantalón vena bota ancha", "Bota ancha", 32000, "Fucsia,Azul,Verde,Negro,Café,Beige,Amarillo,Rojo", "Café"], ["Pantalón con faja", "Pantalones con faja", 32000, "Fucsia,Azul,Verde,Negro,Café,Beige,Amarillo,Rojo", "Beige"], ["Jeans", "Jeans", 32000, "Azul,Negro", "Azul"], ["Corset", "Corsets", 14500, "Fucsia,Azul,Verde,Negro,Café,Beige,Amarillo,Rojo", ""]];
async function products(db) {
  const {results} = await db.prepare('SELECT name,collection,price,description FROM products ORDER BY position,name').all();
  const photos = await index(db);
  return [...originals.map(([name,group,price,colors])=>({name,group,price,colors:colors.split(',')})),
    ...results.map(p=>({name:p.name,group:p.collection,price:p.price,description:p.description,colors:[],added:true}))]
    .map(p=>({...p,colors:[...new Set([...p.colors,...photos.filter(x=>x.product===p.name).map(x=>x.color)])]}));
}
function shop() {
  fetch('/photos-index').then(r => r.ok ? r.json() : Promise.reject()).then(({photos:entries,products}) => {
    const links = new Map(entries.map(p => [JSON.stringify([p.product,p.color]), '/catalog-photo/'+p.id+'?v='+p.updated]));
    const grid = document.querySelector('#grid');
    const original = new WeakMap();
    function update(card) {
      const img = card.querySelector('img'), name = card.querySelector('h3')?.textContent;
      const color = card.querySelector('.swatches [aria-pressed=true]')?.title;
      if (!img || !name) return;
      const swatches=card.querySelector('.swatches');
      const data=products.find(p=>p.name===name);
      for(const shade of data?.colors||[]){
        if([...swatches.children].some(b=>b.title===shade))continue;
        const b=document.createElement('button');b.title=shade;b.setAttribute('aria-label',shade);b.setAttribute('aria-pressed','false');
        b.style.background='#b8809d';b.onclick=()=>{
          for(const node of swatches.children)node.setAttribute('aria-pressed',String(node===b));
          const link=card.querySelector('.order');
          const refresh=()=>{const size=card.querySelector('select')?.value;link.href='https://wa.me/50663216802?text='+encodeURIComponent('Hola, quisiera consultar por '+name+', color '+shade+(size?', talla '+size:''));};
          refresh();card.querySelector('select')?.addEventListener('change',()=>{if(b.getAttribute('aria-pressed')==='true')refresh();});
        };swatches.append(b);
      }
      if (!original.has(img)) original.set(img,img.getAttribute('src'));
      const source = links.get(JSON.stringify([name,color]));
      img.src = source || original.get(img);
      if (source) card.querySelector('.note').textContent = color + ' · Foto mostrada';
    }
    function refresh(){
      const category=document.querySelector('#filters [aria-pressed=true]')?.textContent;
      for(const p of products.filter(p=>p.added&&(category==='Todo'||category===p.group))){
        if([...grid.querySelectorAll('h3')].some(h=>h.textContent===p.name))continue;
        const card=document.createElement('article');
        card.innerHTML='<img alt=""><h3></h3><strong></strong><p class="description"></p><div class="swatches"></div><p class="note"></p><a class="pill order" target="_blank" rel="noopener">Pedir por WhatsApp</a>';
        card.querySelector('h3').textContent=p.name;
        card.querySelector('strong').textContent='₡'+new Intl.NumberFormat('es-CR').format(p.price);
        card.querySelector('.description').textContent=p.description||'';
        const image=card.querySelector('img');image.alt=p.name;image.hidden=!p.colors.length;
        if(p.colors.length)image.src=links.get(JSON.stringify([p.name,p.colors[0]]))||'';
        card.querySelector('.order').href='https://wa.me/50663216802?text='+encodeURIComponent('Hola, quisiera consultar por '+p.name);
        grid.append(card);card.classList.add('appear');
      }
      grid.querySelectorAll('article').forEach(update);
    }
    for(const target of ['#filters','#drawerlinks'])for(const group of new Set(products.filter(p=>p.added).map(p=>p.group))){
      const container=document.querySelector(target);
      if([...container.children].some(b=>b.textContent===group))continue;
      const b=document.createElement('button');b.textContent=group;b.onclick=()=>{if(drawer.open)drawer.close();show(group);refresh();};container.append(b);
    }
    document.addEventListener('click',e=>{if(e.target.closest('#filters button,#drawerlinks button'))refresh();});
    refresh();
    grid.addEventListener('click', e => {
      const button = e.target.closest('.swatches button');
      if (button) update(button.closest('article'));
    });
    new MutationObserver(records => {
      for (const record of records) for (const node of record.addedNodes)
        if (node.nodeType === 1 && node.matches('article')) update(node);
    }).observe(grid,{childList:true});
  }).catch(() => {});
}
function panel() {
  const el = id => document.getElementById(id);
  const product=el('product'), color=el('color'), status=el('status'), photo=el('photo'), form=el('form'), button=el('save');
  let entries=[], published=[];
  const extra=el('extra'), shadeInput=el('shade');
  color.onchange=()=>{extra.hidden=color.value!=='+';shadeInput.required=!extra.hidden;preview();};
  const add=el('add-product');
  add.onsubmit=async event=>{
    event.preventDefault();
    const data=Object.fromEntries(new FormData(add));
    data.price=Number(data.price);
    const button=add.querySelector('button');button.disabled=true;
    try{
      const r=await fetch('/admin?action=products',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
      if(!r.ok)throw Error(r.status===409?'Ya existe una prenda con ese nombre.':'No se pudo guardar la prenda.');
      await load(data.name.trim());add.reset();status.textContent='Prenda agregada. Ya podés subir su primera foto.';
    }catch(error){status.textContent=error.message;}finally{button.disabled=false;}
  };
  function preview() {
    const image=el('preview'), item=published.find(p=>p.product===entries[product.value]?.name&&p.color===color.value);
    image.hidden=!item;
    if (item) image.src='/catalog-photo/'+item.id+'?v='+item.updated;
    else image.removeAttribute('src');
  }
  function colors() {
    color.replaceChildren(...entries[product.value].colors.map(c=>new Option(c,c)),new Option('Agregar color…','+'));
    color.onchange();
  }
  async function load(name=entries[product.value]?.name, selectedColor=color.value) {
    const response=await fetch('/admin?action=photos');
    if(!response.ok) throw Error('No se pudo cargar el catálogo. Recargá la página para volver a intentar.');
    ({products:entries,photos:published}=await response.json());
    product.replaceChildren(...entries.map((p,i)=>new Option(p.name,i)));
    const selected=entries.findIndex(p=>p.name===name);
    product.value=String(Math.max(0,selected));colors();
    if(entries[product.value].colors.includes(selectedColor)){color.value=selectedColor;color.onchange();}
    button.disabled=false;
  }
  product.onchange=colors;
  form.onsubmit=async event=>{
    event.preventDefault();
    const file=photo.files[0], selected=entries[product.value]?.name, shade=color.value==='+'?shadeInput.value.trim():color.value;
    if(!file||!selected||!shade)return;
    button.disabled=product.disabled=color.disabled=photo.disabled=true;
    status.textContent='Subiendo foto…';
    try {
      if(file.size>25000000)throw Error('Elegí una foto de menos de 25 MB.');
      const img=await createImageBitmap(file);
      const scale=Math.min(1,1000/Math.max(img.width,img.height)), canvas=document.createElement('canvas');
      canvas.width=Math.max(1,Math.round(img.width*scale));canvas.height=Math.max(1,Math.round(img.height*scale));
      canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);img.close();
      const image=canvas.toDataURL('image/webp',.7);
      if(!image.startsWith('data:image/webp;')||image.length>420000)throw Error('No se pudo comprimir la foto. Probá con una imagen JPG más pequeña.');
      const response=await fetch('/admin?action=photos',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({product:selected,color:shade,image})});
      if(!response.ok)throw Error('No se pudo guardar la foto. Verificá tu sesión y volvé a intentar.');
      photo.value='';shadeInput.value='';await load(selected,shade);status.textContent='Foto publicada.';
    } catch(error){status.textContent=error.message;}
    finally{button.disabled=product.disabled=color.disabled=photo.disabled=false;}
  };
  load().then(()=>status.textContent='').catch(error=>status.textContent=error.message);
}
const page = '<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Fotos · Esencia Vestuario</title><style>body{margin:35px auto;padding:0 18px;max-width:520px;background:#fff5f8;color:#412438;font:17px system-ui}form{border:1px solid #edcbdc;border-radius:18px;background:#fff;padding:18px}label{display:block;margin:12px 0}[hidden]{display:none!important}details{margin-top:18px}select,input,button{display:block;max-width:100%;font:inherit;padding:8px;margin-top:5px}button{background:#842f59;color:white;border:0;border-radius:10px;padding:10px 16px}img{max-width:180px;border-radius:12px}a{color:#842f59}</style><h1>Fotos del catálogo</h1><p>Esencia Vestuario · <a href="/">Ver tienda</a> · <a href="/cdn-cgi/access/logout">Cerrar sesión</a></p><form id="form"><label>Prenda<select id="product" required></select></label><label>Color<select id="color" required></select></label><label id="extra" hidden>Nombre del color<input id="shade" maxlength="40"></label><img id="preview" alt="Foto publicada" hidden><label>Nueva foto<input type="file" id="photo" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" required></label><button id="save" disabled>Publicar foto</button><p id="status" role="status">Cargando prendas y colores…</p></form><details><summary>Agregar prenda</summary><form id="add-product"><label>Nombre<input name="name" maxlength="100" required></label><label>Colección<input name="group" maxlength="80" required></label><label>Precio en colones<input name="price" type="number" min="0" max="10000000" required></label><label>Descripción<input name="description" maxlength="500"></label><button>Agregar prenda</button></form></details><script src="/admin?action=script" defer></script></html>';
const index = db => db.prepare('SELECT id,product,color,updated FROM catalog_photos ORDER BY id').all().then(r=>r.results);
export default {async fetch(request, env) {
  const url=new URL(request.url), path=url.pathname, method=request.method, db=env.CATALOG_DB;
  const action=url.searchParams.get('action');
  try {
    if(path==='/admin'||path.startsWith('/admin/')) {
      if(url.origin!==site||!await authorized(request))return json({error:'Acceso restringido'},403);
      if(method==='GET'&&!action&&(path==='/admin'||path==='/admin/'))return new Response(page,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Frame-Options':'DENY'}});
      if(action==='script'&&method==='GET')return new Response('('+panel.toString()+')()', {headers:{'Content-Type':'application/javascript','Cache-Control':'no-store'}});
      if(action==='products'&&method==='POST'&&request.headers.get('Origin')===site&&request.headers.get('Content-Type')==='application/json'){
        const payload=await request.text();
        if(payload.length>5000)return json({error:'Datos inválidos'},400);
        let data;try{data=JSON.parse(payload);}catch{return json({error:'Datos inválidos'},400);}
        const name=typeof data?.name==='string'?data.name.trim():'', group=typeof data?.group==='string'?data.group.trim():'';
        const description=typeof data?.description==='string'?data.description.trim():'';
        if(!name||name.length>100||!group||group.length>80||description.length>500||!Number.isInteger(data.price)||data.price<0||data.price>10000000)return json({error:'Datos inválidos'},400);
        if((await products(db)).some(p=>p.name.toLowerCase()===name.toLowerCase()))return json({error:'Prenda duplicada'},409);
        await db.prepare('INSERT INTO products(id,name,collection,price,description) VALUES(?,?,?,?,?)').bind('added:'+name.toLowerCase(),name,group,data.price,description).run();
        return json({ok:true},201);
      }
      if(action==='photos'&&method==='GET')return json({products:await products(db),photos:await index(db)});
      if(action==='photos'&&method==='PUT'&&request.headers.get('Origin')===site&&request.headers.get('Content-Type')==='application/json'){
        if(Number(request.headers.get('Content-Length'))>425000)return json({error:'Imagen demasiado grande'},413);
        const body=await request.text();
        if(body.length>425000)return json({error:'Imagen demasiado grande'},413);
        let data;try{data=JSON.parse(body);}catch{return json({error:'Datos inválidos'},400);}
        if(!data||typeof data.image!=='string'||data.image.length>420000||!/^data:image\/webp;base64,[A-Za-z0-9+/]+={0,2}$/.test(data.image))return json({error:'Imagen inválida'},400);
        const entry=(await products(db)).find(p=>p.name===data.product);
        if(!entry||typeof data.color!=='string'||!data.color.trim()||data.color.length>40||data.color==='+')return json({error:'Prenda o color inválido'},400);
        let bytes;try{bytes=decode(data.image.split(',')[1]);}catch{return json({error:'Imagen inválida'},400);}
        if(String.fromCharCode(...bytes.slice(0,4))!=='RIFF'||String.fromCharCode(...bytes.slice(8,12))!=='WEBP')return json({error:'Imagen inválida'},400);
        await db.prepare('INSERT INTO catalog_photos(product,color,image,updated) VALUES(?,?,?,?) ON CONFLICT(product,color) DO UPDATE SET image=excluded.image,updated=excluded.updated')
          .bind(data.product,data.color,data.image,Date.now()).run();
        return json({ok:true});
      }
      return json({error:'Ruta no disponible'},404);
    }
    if(method==='GET'&&path==='/photos-index')return json({photos:await index(db),products:await products(db)});
    if(method==='GET'&&/^\/catalog-photo\/\d+$/.test(path)){
      const item=await db.prepare('SELECT image FROM catalog_photos WHERE id=?').bind(path.split('/').pop()).first();
      if(!item)return new Response(null,{status:404});
      return new Response(decode(item.image.split(',')[1]),{headers:{'Content-Type':'image/webp','X-Content-Type-Options':'nosniff','Cache-Control':'no-cache'}});
    }
    const response=await env.ASSETS.fetch(request);
    if(method==='GET'&&path==='/'&&response.ok&&response.headers.get('Content-Type')?.includes('text/html'))
      return new HTMLRewriter().onDocument({end(document){document.append('<script>('+shop.toString()+')()</script>',{html:true});}}).transform(response);
    return response;
  } catch(error){console.error(error.message);return json({error:'Error del catálogo'},500);}
}};
