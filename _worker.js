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
async function products(env) {
  const asset = await env.ASSETS.fetch(new Request(site + '/index.html', {redirect:'manual'}));
  const response = asset.status >= 300 && asset.status < 400
    ? await env.ASSETS.fetch(new Request(site + '/')) : asset;
  const match = (await response.text()).match(/const rows=(\[\[.*?\]\]), photos=/);
  if (!match) throw new Error('No se encontró el catálogo');
  return JSON.parse(match[1]).map(([name,,, colors]) => ({name, colors:colors.split(',')}));
}
function shop() {
  fetch('/photos-index').then(r => r.ok ? r.json() : []).then(entries => {
    const links = new Map(entries.map(p => [JSON.stringify([p.product,p.color]), '/catalog-photo/'+p.id+'?v='+p.updated]));
    const grid = document.querySelector('#grid');
    const original = new WeakMap();
    function update(card) {
      const img = card.querySelector('img'), name = card.querySelector('h3')?.textContent;
      const color = card.querySelector('.swatches [aria-pressed=true]')?.title;
      if (!img || !name) return;
      if (!original.has(img)) original.set(img,img.getAttribute('src'));
      const source = links.get(JSON.stringify([name,color]));
      img.src = source || original.get(img);
      if (source) card.querySelector('.note').textContent = color + ' · Foto mostrada';
    }
    grid.querySelectorAll('article').forEach(update);
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
  function preview() {
    const image=el('preview'), item=published.find(p=>p.product===entries[product.value]?.name&&p.color===color.value);
    image.hidden=!item;
    if (item) image.src='/catalog-photo/'+item.id+'?v='+item.updated;
    else image.removeAttribute('src');
  }
  function colors() {
    color.replaceChildren(...entries[product.value].colors.map(c=>new Option(c,c)));
    preview();
  }
  async function load() {
    const response=await fetch('/admin/photos');
    if(!response.ok) throw Error('No se pudo cargar el panel. Verificá tu sesión.');
    ({products:entries,photos:published}=await response.json());
    if(!product.options.length) {
      product.replaceChildren(...entries.map((p,i)=>new Option(p.name,i)));
      colors();
    } else preview();
  }
  product.onchange=colors;
  color.onchange=preview;
  form.onsubmit=async event=>{
    event.preventDefault();
    const file=photo.files[0], selected=entries[product.value]?.name, shade=color.value;
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
      const response=await fetch('/admin/photos',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({product:selected,color:shade,image})});
      if(!response.ok)throw Error('No se pudo guardar la foto. Verificá tu sesión y volvé a intentar.');
      photo.value='';await load();status.textContent='Foto publicada.';
    } catch(error){status.textContent=error.message;}
    finally{button.disabled=product.disabled=color.disabled=photo.disabled=false;}
  };
  load().catch(error=>status.textContent=error.message);
}
const page = '<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Fotos · Esencia Vestuario</title><style>body{margin:35px auto;padding:0 18px;max-width:520px;background:#fff5f8;color:#412438;font:17px system-ui}form{border:1px solid #edcbdc;border-radius:18px;background:#fff;padding:18px}label{display:block;margin:12px 0}select,input,button{display:block;max-width:100%;font:inherit;padding:8px;margin-top:5px}button{background:#842f59;color:white;border:0;border-radius:10px;padding:10px 16px}img{max-width:180px;border-radius:12px}a{color:#842f59}</style><h1>Fotos del catálogo</h1><p>Esencia Vestuario · <a href="/">Ver tienda</a> · <a href="/cdn-cgi/access/logout">Cerrar sesión</a></p><form id="form"><label>Prenda<select id="product" required></select></label><label>Color<select id="color" required></select></label><img id="preview" alt="Foto publicada" hidden><label>Nueva foto<input type="file" id="photo" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" required></label><button id="save">Publicar foto</button><p id="status" role="status"></p></form><script>('+panel.toString()+')()</script>';
const index = db => db.prepare('SELECT id,product,color,updated FROM catalog_photos ORDER BY id').all().then(r=>r.results);
export default {async fetch(request, env) {
  const url=new URL(request.url), path=url.pathname, method=request.method, db=env.CATALOG_DB;
  try {
    if(path==='/admin'||path.startsWith('/admin/')) {
      if(url.origin!==site||!await authorized(request))return json({error:'Acceso restringido'},403);
      if(method==='GET'&&(path==='/admin'||path==='/admin/'))return new Response(page,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Frame-Options':'DENY'}});
      if(path==='/admin/photos'&&method==='GET')return json({products:await products(env),photos:await index(db)});
      if(path==='/admin/photos'&&method==='PUT'&&request.headers.get('Origin')===site&&request.headers.get('Content-Type')==='application/json'){
        if(Number(request.headers.get('Content-Length'))>425000)return json({error:'Imagen demasiado grande'},413);
        const body=await request.text();
        if(body.length>425000)return json({error:'Imagen demasiado grande'},413);
        let data;try{data=JSON.parse(body);}catch{return json({error:'Datos inválidos'},400);}
        if(!data||typeof data.image!=='string'||data.image.length>420000||!/^data:image\/webp;base64,[A-Za-z0-9+/]+={0,2}$/.test(data.image))return json({error:'Imagen inválida'},400);
        const entry=(await products(env)).find(p=>p.name===data.product);
        if(!entry?.colors.includes(data.color))return json({error:'Prenda o color inválido'},400);
        let bytes;try{bytes=decode(data.image.split(',')[1]);}catch{return json({error:'Imagen inválida'},400);}
        if(String.fromCharCode(...bytes.slice(0,4))!=='RIFF'||String.fromCharCode(...bytes.slice(8,12))!=='WEBP')return json({error:'Imagen inválida'},400);
        await db.prepare('INSERT INTO catalog_photos(product,color,image,updated) VALUES(?,?,?,?) ON CONFLICT(product,color) DO UPDATE SET image=excluded.image,updated=excluded.updated')
          .bind(data.product,data.color,data.image,Date.now()).run();
        return json({ok:true});
      }
      return json({error:'Ruta no disponible'},404);
    }
    if(method==='GET'&&path==='/photos-index')return json(await index(db));
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
