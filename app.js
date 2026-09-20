const DB_NAME = "biblioteca_lector";
const DB_VERSION = 1;
const STORE = "books";
let db, currentBook=null, currentObjectUrl=null, currentEpubBook=null, currentEpubRendition=null, currentEpubUrl=null;
let activeTag=null, activeCollection=null, activeFilter="all", sortMode="updated", viewMode="grid", modalBook=null, modalTags=[], currentView="home";
let collections=[];
let batchCollectionName=null,batchBooks=[],batchSelected=new Set();
const COLLECTIONS_KEY="pulenta_collections_v1";
if(window.pdfjsLib?.GlobalWorkerOptions) window.pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
const $=s=>document.querySelector(s);
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
function toast(m){const e=$("#toast");e.textContent=m;e.classList.add("show");clearTimeout(toast.t);toast.t=setTimeout(()=>e.classList.remove("show"),2400)}
function openDB(){return new Promise((res,rej)=>{const r=indexedDB.open(DB_NAME,DB_VERSION);r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains(STORE))r.result.createObjectStore(STORE,{keyPath:"id"})};r.onsuccess=()=>{db=r.result;res(db)};r.onerror=()=>rej(r.error)})}
function tx(m="readonly"){return db.transaction(STORE,m).objectStore(STORE)}
function getAllBooks(){return new Promise((res,rej)=>{const r=tx().getAll();r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}
function putBook(b){return new Promise((res,rej)=>{const r=tx("readwrite").put(b);r.onsuccess=res;r.onerror=()=>rej(r.error)})}
function deleteBookById(id){return new Promise((res,rej)=>{const r=tx("readwrite").delete(id);r.onsuccess=res;r.onerror=()=>rej(r.error)})}
function makeId(){return crypto.randomUUID?crypto.randomUUID():Date.now().toString(36)+Math.random().toString(36).slice(2)}
function titleFromFilename(n){return n.replace(/\.[^.]+$/,'').replace(/[_-]+/g,' ').trim()||'Sin título'}
function normTag(t){return String(t||'').trim().toLowerCase().replace(/\s+/g,'-')}
function loadCollections(){try{const x=JSON.parse(localStorage.getItem(COLLECTIONS_KEY)||'[]');collections=Array.isArray(x)?x.filter(Boolean):[]}catch(e){collections=[]}}
function saveCollections(){localStorage.setItem(COLLECTIONS_KEY,JSON.stringify(collections))}
function collectionLabel(c){return String(c||'').replace(/\s+/g,' ').trim()}
function loadTheme(){const dark=localStorage.getItem("pulenta_theme")==="dark";document.body.classList.toggle("dark-library",dark);const b=$("#themeToggle");if(b)b.textContent=dark?"☀️ Modo claro":"🌙 Modo oscuro"}
function toggleTheme(){const dark=!document.body.classList.contains("dark-library");document.body.classList.toggle("dark-library",dark);localStorage.setItem("pulenta_theme",dark?"dark":"light");const b=$("#themeToggle");if(b)b.textContent=dark?"☀️ Modo claro":"🌙 Modo oscuro"}

async function extractEpubMetadata(file){
  if(!file||typeof JSZip==='undefined') return {};
  try{
    const zip=await JSZip.loadAsync(file);
    const container=await zip.file('META-INF/container.xml')?.async('text');
    if(!container)return {};
    const rootfile=(container.match(/full-path=["']([^"']+)["']/i)||[])[1];
    if(!rootfile)return {};
    const opf=await zip.file(rootfile)?.async('text');
    if(!opf)return {};
    const doc=new DOMParser().parseFromString(opf,'application/xml');
    const text=(sel)=>doc.querySelector(sel)?.textContent?.trim()||'';
    const meta={title:text('metadata > title, metadata title'),author:text('metadata > creator, metadata creator'),language:text('metadata > language, metadata language'),publisher:text('metadata > publisher, metadata publisher'),description:text('metadata > description, metadata description')};
    const coverId=(doc.querySelector('meta[name="cover"]')?.getAttribute('content')||doc.querySelector('item[properties~="cover-image"]')?.getAttribute('id')||'').trim();
    let coverHref='';
    if(coverId){const item=[...doc.querySelectorAll('item')].find(x=>x.getAttribute('id')===coverId);coverHref=item?.getAttribute('href')||''}
    if(!coverHref){const item=doc.querySelector('item[properties~="cover-image"]');coverHref=item?.getAttribute('href')||''}
    if(coverHref){
      const base=rootfile.includes('/')?rootfile.slice(0,rootfile.lastIndexOf('/')+1):'';
      const normalized=new URL(coverHref, 'https://pulenta.local/'+base).pathname.replace(/^\//,'');
      const img=zip.file(normalized)||zip.file(base+coverHref);
      if(img){const bytes=await img.async('uint8array');const mime=/\.png$/i.test(normalized)?'image/png':/\.webp$/i.test(normalized)?'image/webp':'image/jpeg';let binary='';const chunk=0x8000;for(let i=0;i<bytes.length;i+=chunk)binary+=String.fromCharCode(...bytes.subarray(i,i+chunk));meta.coverData=`data:${mime};base64,${btoa(binary)}`}
    }
    return meta;
  }catch(e){console.warn('Metadata EPUB:',e);return {}}
}
async function extractPdfMetadata(file){
  if(!file||!window.pdfjsLib)return {};
  try{const pdf=await window.pdfjsLib.getDocument({data:await file.arrayBuffer()}).promise;const m=await pdf.getMetadata();const info=m?.info||{};return {title:info.Title||'',author:info.Author||'',language:info.Language||'',publisher:info.Producer||'',description:info.Subject||''}}catch(e){return {}}
}
async function generatePdfCover(file){if(!window.pdfjsLib||!file)return null;try{const pdf=await window.pdfjsLib.getDocument({data:await file.arrayBuffer()}).promise;const p=await pdf.getPage(1),base=p.getViewport({scale:1}),vp=p.getViewport({scale:520/base.height}),c=document.createElement('canvas');c.width=Math.ceil(vp.width);c.height=Math.ceil(vp.height);await p.render({canvasContext:c.getContext('2d'),viewport:vp}).promise;return c.toDataURL('image/jpeg',.78)}catch(e){console.warn(e);return null}}
function coverFor(b,large=false){const type=(b.type||'pdf').toUpperCase(), pct=Math.round((b.progress||0)*100);if(b.coverData)return `<div class="cover ${large?'large':''}"><img src="${b.coverData}" alt=""><span class="type">${type}</span></div>`;return `<div class="cover ${large?'large':''}"><div class="type">${type}</div><div class="cover-title">${esc(b.title)}</div><div class="source">${pct?pct+'% leído':'Sin empezar'}</div></div>`}
function sorted(list){return [...list].sort((a,b)=>{if(sortMode==='title')return (a.title||'').localeCompare(b.title||'','es',{sensitivity:'base'});if(sortMode==='author')return (a.author||'Sin autor').localeCompare(b.author||'Sin autor','es',{sensitivity:'base'});if(sortMode==='progress')return (b.progress||0)-(a.progress||0);return (b.updatedAt||0)-(a.updatedAt||0)})}
function filtered(all){const q=$("#searchInput").value.trim().toLowerCase();return sorted(all.filter(b=>{const hay=[b.title,b.author,b.fileName,...(b.tags||[])].join(' ').toLowerCase();const mq=!q||hay.includes(q);const mf=activeFilter==='all'||(activeFilter==='favorites'&&b.favorite)||(activeFilter==='pdf'&&b.type==='pdf')||(activeFilter==='epub'&&b.type==='epub');const mt=!activeTag||(b.tags||[]).includes(activeTag);const mc=!activeCollection||(b.collections||[]).includes(activeCollection);return mq&&mf&&mt&&mc}))}
function renderCollectionBar(all){
  const bar=$("#collectionBar");
  const counts=new Map(collections.map(c=>[c,0]));
  all.forEach(b=>(b.collections||[]).forEach(c=>{if(counts.has(c))counts.set(c,counts.get(c)+1)}));
  if(!collections.length){bar.classList.add("hidden");bar.innerHTML="";return}
  bar.classList.remove("hidden");
  bar.innerHTML=`<div class="collection-head"><strong>Mis colecciones</strong><button id="newCollectionQuick" class="secondary" type="button">＋ Nueva</button></div><div class="collection-list"><button class="collection-chip ${!activeCollection?'active':''}" data-collection="">📚 Todas <span>${all.length}</span></button>${collections.map(c=>`<button class="collection-chip ${activeCollection===c?'active':''}" data-collection="${esc(c)}">${esc(c)} <span>${counts.get(c)||0}</span></button>`).join('')}</div>`;
  bar.querySelectorAll('.collection-chip').forEach(b=>b.onclick=async()=>{activeCollection=b.dataset.collection||null;renderLibrary(await getAllBooks())});
  const quick=$("#newCollectionQuick"); if(quick) quick.onclick=()=>createCollectionPrompt();
}
function createCollectionPrompt(){
  const name=collectionLabel(prompt("Nombre de la nueva colección:"));
  if(!name)return;
  if(collections.some(c=>c.toLowerCase()===name.toLowerCase())){toast("Esa colección ya existe.");return}
  collections.push(name);collections.sort((a,b)=>a.localeCompare(b,'es',{sensitivity:'base'}));saveCollections();toast(`Colección “${name}” creada.`);renderLibrary(lastBooks);if(currentView==='collections')showView('collections');
}
function renderTagBar(all){const tags=[...new Set(all.flatMap(b=>b.tags||[]))].sort((a,b)=>a.localeCompare(b,'es'));const bar=$("#tagBar");if(!tags.length){bar.classList.add('hidden');bar.innerHTML='';return}bar.classList.remove('hidden');bar.innerHTML=`<button class="tag-chip ${!activeTag?'active':''}" data-tag="">Todos</button>`+tags.map(t=>`<button class="tag-chip ${activeTag===t?'active':''}" data-tag="${esc(t)}">#${esc(t)}</button>`).join('');bar.querySelectorAll('.tag-chip').forEach(b=>b.onclick=async()=>{activeTag=b.dataset.tag||null;renderLibrary(await getAllBooks())})}
function renderCollectionSummary(all,shown){const e=$("#collectionSummary");if(!all.length){e.classList.add('hidden');return}const tags=[...new Set(shown.flatMap(b=>b.tags||[]))];e.classList.remove('hidden');e.innerHTML=`<span><b>${shown.length}</b> ${shown.length===1?'resultado':'resultados'}</span>${activeCollection?`<span>en <b>📚 ${esc(activeCollection)}</b></span>`:''}${activeTag?`<span>en <b>#${esc(activeTag)}</b></span>`:''}${activeFilter!=='all'?`<span>· ${activeFilter==='favorites'?'favoritos':activeFilter.toUpperCase()}</span>`:''}${tags.length&&!activeTag?`<span class="summary-tags">${tags.slice(0,5).map(t=>`#${esc(t)}`).join(' ')}</span>`:''}`}
function shelfCard(b){return `<button class="shelf-book" data-id="${esc(b.id)}" type="button">${coverFor(b)}<span class="shelf-title">${esc(b.title)}</span><span class="shelf-author">${esc(b.author||'Sin autor')}</span></button>`}
function renderHomeDashboard(all){
  const el=$("#homeCurrent"), empty=$("#homeEmpty");
  // Una lectura actual es un libro que ya fue abierto, aunque todavía vaya en 0%.
  // Así también aparecen en Inicio los libros que recién empezaste.
  const current=[...all].filter(b=>(b.lastOpenedAt||0)>0 || (b.progress||0)>0).sort((a,b)=>((b.lastOpenedAt||b.updatedAt||0)-(a.lastOpenedAt||a.updatedAt||0))).slice(0,20);
  if(current.length){
    el.classList.remove('hidden'); empty.classList.add('hidden');
    el.innerHTML=`<div class="shelf-head"><div><span class="eyebrow">HASTA 20</span><h3>Continúa donde quedaste</h3></div><button class="secondary shelf-link" id="homeAllLibraryBtn" type="button">Ver biblioteca →</button></div><div class="book-shelf current-reading-shelf">${current.map(shelfCard).join('')}</div>`;
    el.querySelectorAll('.shelf-book').forEach(btn=>btn.onclick=()=>openBookDetails(btn.dataset.id));
    $("#homeAllLibraryBtn").onclick=()=>showView('library');
  }else{el.classList.add('hidden');empty.classList.remove('hidden')}
}
function renderCollectionsPage(all){
  const grid=$("#collectionsPageGrid"), empty=$("#collectionsEmpty");
  const items=collections.map(name=>({name,books:all.filter(b=>(b.collections||[]).includes(name))}));
  if(!items.length){grid.innerHTML='';grid.classList.add('hidden');empty.classList.remove('hidden');return}
  grid.classList.remove('hidden');empty.classList.add('hidden');
  grid.innerHTML=items.map(c=>{
    const books=[...c.books].sort((a,b)=>(b.updatedAt||0)-(a.updatedAt||0));
    const covers=books.filter(b=>b.coverData).slice(0,3);
    const fallback=books[0];
    const preview=covers.length?covers.map(b=>coverFor(b)).join(''):coverFor(fallback||{title:c.name,type:'pdf'});
    return `<article class="collection-page-card" data-collection-card="${esc(c.name)}">
      <button class="collection-open" data-collection-page="${esc(c.name)}" type="button" aria-label="Abrir colección ${esc(c.name)}">
        <div class="collection-page-covers">${preview}</div>
        <div class="collection-page-copy"><span class="eyebrow">COLECCIÓN</span><strong>${esc(c.name)}</strong><span>${c.books.length} ${c.books.length===1?'libro':'libros'}</span>${books[0]?`<small>${esc(books[0].title)}</small>`:''}</div>
      </button>
      <div class="collection-page-actions"><button class="secondary collection-action" data-batch-collection="${esc(c.name)}" type="button">＋ Añadir libros</button><button class="secondary collection-action" data-rename-collection="${esc(c.name)}" type="button">✏️ Renombrar</button><button class="secondary collection-action danger" data-delete-collection="${esc(c.name)}" type="button">Eliminar</button></div>
    </article>`;
  }).join('');
  grid.querySelectorAll('[data-collection-page]').forEach(btn=>btn.onclick=()=>{activeCollection=btn.dataset.collectionPage;showView('library');setTimeout(()=>{renderLibrary(lastBooks);$("#collectionBar")?.scrollIntoView({behavior:'smooth',block:'center'})},0)});
  grid.querySelectorAll('[data-rename-collection]').forEach(btn=>btn.onclick=()=>renameCollection(btn.dataset.renameCollection));
  grid.querySelectorAll('[data-delete-collection]').forEach(btn=>btn.onclick=()=>deleteCollection(btn.dataset.deleteCollection));
  grid.querySelectorAll('[data-batch-collection]').forEach(btn=>btn.onclick=()=>openBatchCollection(btn.dataset.batchCollection));
}
async function openBatchCollection(name){batchCollectionName=name;batchBooks=await getAllBooks();batchSelected=new Set(batchBooks.filter(b=>(b.collections||[]).includes(name)).map(b=>b.id));$("#batchSearch").value="";renderBatchList();$("#collectionBatchModal").classList.remove("hidden")}
function renderBatchList(){const q=$("#batchSearch").value.trim().toLowerCase();const list=$("#batchList");const shown=batchBooks.filter(b=>{const hay=[b.title,b.author,b.fileName,...(b.tags||[])].join(" ").toLowerCase();return !q||hay.includes(q)});list.innerHTML=shown.length?shown.map(b=>`<label class="batch-item"><input type="checkbox" data-batch-id="${esc(b.id)}" ${batchSelected.has(b.id)?"checked":""}><span class="batch-cover">${coverFor(b)}</span><span class="batch-copy"><strong>${esc(b.title)}</strong><small>${esc(b.author||"Sin autor")} · ${(b.type||"pdf").toUpperCase()}</small></span></label>`).join(""):'<div class="batch-empty">No encontré libros con esa búsqueda.</div>';list.querySelectorAll('[data-batch-id]').forEach(cb=>cb.onchange=()=>{if(cb.checked)batchSelected.add(cb.dataset.batchId);else batchSelected.delete(cb.dataset.batchId);updateBatchCount()});updateBatchCount()}
function updateBatchCount(){$("#batchCount").textContent=`${batchSelected.size} seleccionado${batchSelected.size===1?"":"s"}`}
function closeBatchCollection(){$("#collectionBatchModal").classList.add("hidden");batchCollectionName=null;batchBooks=[];batchSelected.clear()}
async function saveBatchCollection(){if(!batchCollectionName)return;const savedName=batchCollectionName;for(const b of batchBooks){const has=batchSelected.has(b.id),old=(b.collections||[]);const next=has?[...new Set([...old,savedName])]:old.filter(c=>c!==savedName);if(next.join("\u0000")!==old.join("\u0000")){b.collections=next;b.updatedAt=Date.now();await putBook(b)}}closeBatchCollection();renderLibrary(await getAllBooks());if(currentView==="collections")renderCollectionsPage(await getAllBooks());toast(`Colección “${savedName}” actualizada.`)}

async function renameCollection(oldName){
  const name=collectionLabel(prompt(`Nuevo nombre para “${oldName}”:`,oldName));
  if(!name||name===oldName)return;
  if(collections.some(c=>c.toLowerCase()===name.toLowerCase()&&c!==oldName)){toast('Esa colección ya existe.');return}
  collections=collections.map(c=>c===oldName?name:c).sort((a,b)=>a.localeCompare(b,'es',{sensitivity:'base'}));
  const books=await getAllBooks();
  for(const b of books){if((b.collections||[]).includes(oldName)){b.collections=[...new Set((b.collections||[]).map(c=>c===oldName?name:c))];await putBook(b)}}
  if(activeCollection===oldName)activeCollection=name;
  saveCollections();
  renderLibrary(await getAllBooks());
  toast(`Colección renombrada a “${name}”.`);
}
async function deleteCollection(name){
  if(!confirm(`¿Eliminar la colección “${name}”? Tus libros NO se eliminarán.`))return;
  collections=collections.filter(c=>c!==name);
  const books=await getAllBooks();
  for(const b of books){if((b.collections||[]).includes(name)){b.collections=(b.collections||[]).filter(c=>c!==name);await putBook(b)}}
  if(activeCollection===name)activeCollection=null;
  saveCollections();
  renderLibrary(await getAllBooks());
  toast(`Colección “${name}” eliminada.`);
}

async function showView(view){
  currentView=view;
  try{if(view==='home'||view==='collections') renderLibrary(await getAllBooks())}catch(e){}
  ["home","collections","library"].forEach(v=>$("#view"+v.charAt(0).toUpperCase()+v.slice(1))?.classList.toggle('hidden',v!==view));
  document.querySelectorAll('.nav-btn').forEach(b=>b.classList.toggle('active',b.dataset.view===view));
  if(view==='home') window.scrollTo({top:0,behavior:'smooth'});
  if(view==='collections') window.scrollTo({top:0,behavior:'smooth'});
  if(view==='library') window.scrollTo({top:0,behavior:'smooth'});
}
function renderLibrary(all){const shown=filtered(all);renderHomeDashboard(all);renderCollectionsPage(all);$("#stats").textContent=`${all.length} libro${all.length===1?'':'s'}`;$("#emptyState").classList.toggle('hidden',all.length!==0);$("#noResults").classList.toggle('hidden',!all.length||shown.length!==0);$("#libraryGrid").classList.toggle('list-view',viewMode==='list');renderCollectionBar(all);renderTagBar(all);renderCollectionSummary(all,shown);$("#libraryGrid").innerHTML=shown.map(b=>`<button class="book" data-id="${b.id}" type="button">${coverFor(b)}<div class="book-content"><div class="book-title">${esc(b.title)}</div><div class="book-author">${esc(b.author||'Sin autor')}</div><div class="book-meta">${(b.type||'pdf').toUpperCase()} · ${Math.round((b.progress||0)*100)}%</div><div class="progress"><span style="width:${Math.max(0,Math.min(100,(b.progress||0)*100))}%"></span></div><div class="book-meta tags">${(b.tags||[]).slice(0,4).map(t=>'#'+esc(t)).join(' ')}</div></div></button>`).join('');$("#libraryGrid").querySelectorAll('.book').forEach(x=>x.onclick=()=>openBookDetails(x.dataset.id))}
function renderContinue(all){const candidates=all.filter(b=>(b.progress||0)>0).sort((a,b)=>(b.updatedAt||0)-(a.updatedAt||0));const b=candidates[0];$("#continueSection").classList.toggle('hidden',!b);if(!b)return;$("#continueTitle").textContent=b.title;$("#continueMeta").textContent=`${Math.round(b.progress*100)}% leído · ${(b.type||'pdf').toUpperCase()}${b.author?' · '+b.author:''}`;$("#continueCover").innerHTML=coverFor(b,true);$("#continueBtn").onclick=()=>openBook(b.id,all)}
async function openBookDetails(id){const b=(await getAllBooks()).find(x=>x.id===id);if(!b)return; if((b.type==='epub' || b.type==='pdf') && b.file && !b.metadataScanned){const meta=b.type==='epub'?await extractEpubMetadata(b.file):await extractPdfMetadata(b.file);b.metadataScanned=true;if(meta.title&&!b.title) b.title=meta.title;if(meta.author&&!b.author)b.author=meta.author;b.language=meta.language||b.language||'';b.publisher=meta.publisher||b.publisher||'';b.description=meta.description||b.description||'';if(meta.coverData&&!b.coverData)b.coverData=meta.coverData;await putBook(b)} modalBook=b;modalTags=[...(b.tags||[])];$("#modalTitle").textContent=b.title;$("#editTitle").value=b.title;$("#editAuthor").value=b.author||'';updateFavoriteButton();const modalPct=Math.round((b.progress||0)*100);$("#modalProgressText").textContent=modalPct+"%";$("#modalProgressBar").style.width=modalPct+"%";$("#modalMeta").innerHTML=`<b>Formato:</b> ${(b.type||'pdf').toUpperCase()}<br><b>Archivo:</b> ${esc(b.fileName)}<br><b>Origen:</b> ${b.source==='drive'?'Google Drive':'Dispositivo'}${b.language?`<br><b>Idioma:</b> ${esc(b.language)}`:''}${b.publisher?`<br><b>Editorial / productor:</b> ${esc(b.publisher)}`:''}${b.description?`<br><b>Descripción:</b> ${esc(b.description)}`:''}`;if(!b.coverData&&b.type==='pdf'&&b.file){$("#modalCover").innerHTML='<div class="cover"><div class="type">PDF</div><div class="cover-title">Generando portada…</div></div>';const c=await generatePdfCover(b.file);if(c){b.coverData=c;await putBook(b)}}$("#modalCover").innerHTML=b.coverData?`<img src="${b.coverData}" alt="Portada">`:coverFor(b);renderModalTags();renderModalCollections();$("#bookModal").classList.remove('hidden')}
function renderModalCollections(){
  const e=$("#modalCollections");
  if(!collections.length){e.innerHTML='<span class="book-meta">Todavía no tienes colecciones. Crea una con “＋ Crear”.</span>';return}
  const selected=new Set(modalBook?.collections||[]);
  e.innerHTML=collections.map(c=>`<button type="button" class="collection-edit-chip ${selected.has(c)?'on':''}" data-collection="${esc(c)}">${selected.has(c)?'✓ ':'＋ '}${esc(c)}</button>`).join('');
  e.querySelectorAll('button').forEach(btn=>btn.onclick=()=>{const c=btn.dataset.collection;const set=new Set(modalBook.collections||[]);if(set.has(c))set.delete(c);else set.add(c);modalBook.collections=[...set];renderModalCollections()});
}
function renderModalTags(){$("#modalTags").innerHTML=modalTags.length?modalTags.map((t,i)=>`<span class="tag-edit-chip">#${esc(t)}<button data-i="${i}" type="button">✕</button></span>`).join(''):'<span class="book-meta">Sin tags todavía.</span>';$("#modalTags").querySelectorAll('button').forEach(x=>x.onclick=()=>{modalTags.splice(+x.dataset.i,1);renderModalTags()})}
function updateFavoriteButton(){const on=!!modalBook?.favorite;$("#favoriteBook").textContent=on?'♥ En favoritos':'♡ Favorito';$("#favoriteBook").classList.toggle('on',on)}
async function deleteCurrentBook(){if(!modalBook)return;const name=modalBook.title||modalBook.fileName||"este libro";if(!confirm(`¿Eliminar “${name}” de tu biblioteca?\n\nEl archivo se quitará de La Pulenta, pero no se borrará de tu dispositivo.`))return;const id=modalBook.id;await deleteBookById(id);modalBook=null;closeBookDetails();renderLibrary(await getAllBooks());toast("Libro eliminado de la biblioteca.")}

function closeBookDetails(){$("#bookModal").classList.add('hidden');modalBook=null;modalTags=[]}
async function saveBookDetails(){if(!modalBook)return;modalBook.title=$("#editTitle").value.trim()||modalBook.title;modalBook.author=$("#editAuthor").value.trim();modalBook.tags=[...new Set(modalTags.map(normTag).filter(Boolean))];modalBook.collections=[...new Set((modalBook.collections||[]).filter(c=>collections.includes(c)))];modalBook.updatedAt=Date.now();await putBook(modalBook);closeBookDetails();renderLibrary(await getAllBooks());toast('Cambios guardados.')}
function fileUrl(f){if(currentObjectUrl)URL.revokeObjectURL(currentObjectUrl);currentObjectUrl=URL.createObjectURL(f);return currentObjectUrl}
async function closeReader(){
  if(currentBook){try{await putBook(currentBook)}catch(e){}}
  if(currentEpubRendition){try{currentEpubRendition.destroy()}catch(e){}}
  if(currentEpubBook){try{currentEpubBook.destroy()}catch(e){}}
  currentEpubRendition=null;
  currentEpubBook=null;
  if(currentEpubUrl){URL.revokeObjectURL(currentEpubUrl);currentEpubUrl=null}
  if(currentObjectUrl){URL.revokeObjectURL(currentObjectUrl);currentObjectUrl=null}
  $("#readerBody").innerHTML='';
  $("#reader").classList.add('hidden');
  currentBook=null
  try{renderLibrary(await getAllBooks())}catch(e){}
}
function nextFrame(){return new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))}
async function createEpubRendition(b, holder){
  // epub.js 0.3.x is more reliable with archived EPUBs when JSZip is loaded
  // separately and the archive is opened explicitly as binary data.
  if(typeof JSZip==='undefined') throw new Error('JSZip no está disponible');
  const buffer = await b.file.arrayBuffer();
  currentEpubBook = ePub();
  await currentEpubBook.open(buffer, 'binary');
  await currentEpubBook.ready;
  // Generamos una tabla de posiciones para poder calcular un porcentaje fiable.
  try{await currentEpubBook.locations.generate(1000)}catch(e){console.warn('No pude generar posiciones EPUB',e)}
  await nextFrame();
  const rect=holder.getBoundingClientRect();
  const width=Math.max(320,Math.floor(rect.width));
  const height=Math.max(320,Math.floor(rect.height));
  currentEpubRendition=currentEpubBook.renderTo(holder,{method:'default',width,height,spread:'auto',flow:'paginated',allowScriptedContent:false});
  currentEpubRendition.on('relocated',async loc=>{
    if(!currentBook)return;
    const cfi=loc?.start?.cfi;
    if(cfi){
      currentBook.cfi=cfi;
      // epub.js no siempre rellena loc.start.percentage. La fuente fiable es
      // la tabla de posiciones que generamos al abrir el EPUB.
      let pct=NaN;
      try{
        if(currentEpubBook?.locations?.length){
          pct=Number(currentEpubBook.locations.percentageFromCfi(cfi));
        }
      }catch(e){}
      if(!Number.isFinite(pct)){
        const raw=Number(loc?.start?.percentage);
        if(Number.isFinite(raw)) pct=raw;
      }
      if(Number.isFinite(pct)) currentBook.progress=Math.max(0,Math.min(1,pct));
      currentBook.updatedAt=Date.now();
      try{await putBook(currentBook)}catch(e){console.warn('No pude guardar progreso EPUB',e)}
      updateReaderInfo();
    }
  });
  await currentEpubRendition.display(b.cfi||undefined);
  return currentEpubRendition;
}
function updateReaderInfo(){
  if(!currentBook)return;
  const pct=Math.round((currentBook.progress||0)*100);
  $("#readerInfo").textContent=`${(currentBook.type||'pdf').toUpperCase()} · ${currentBook.source==='drive'?'Google Drive':'Dispositivo'} · ${pct}%`;
}
async function openBook(id,books){
  const b=(books||await getAllBooks()).find(x=>x.id===id);if(!b)return;
  // Registrar que el usuario abrió este libro para que aparezca en Lecturas actuales.
  b.lastOpenedAt=Date.now();
  b.updatedAt=b.lastOpenedAt;
  try{await putBook(b)}catch(e){console.warn('No pude registrar la lectura actual',e)}
  currentBook=b;
  $("#readerTitle").textContent=b.title;
  updateReaderInfo();
  $("#readerBody").innerHTML='';
  $("#reader").classList.remove('hidden');
  if(b.type==='pdf'){
    const e=document.createElement('embed');
    e.src=fileUrl(b.file);e.type='application/pdf';
    $("#readerBody").appendChild(e);
  }else{
    if(typeof ePub!=='function'){
      $("#readerBody").innerHTML='<div class="epub-reader epub-error"><h3>No se pudo cargar el motor EPUB</h3><p>Revisa tu conexión a internet y vuelve a abrir la app.</p><button class="secondary" type="button" onclick="closeReader()">Cerrar</button></div>';
      return;
    }
    const holder=document.createElement('div');
    holder.className='epub-reader';
    $("#readerBody").appendChild(holder);
    try{
      await nextFrame();
      await createEpubRendition(b,holder);
    }catch(e){
      console.error('EPUB:',e);
      const detail=esc(e?.message||String(e)||'Error desconocido');
      $("#readerBody").innerHTML=`<div class="epub-reader epub-error"><h3>No pude abrir este EPUB</h3><p>El archivo está bien guardado en la biblioteca, pero el lector no pudo interpretar su contenido.</p><p class="book-meta">Detalle técnico: ${detail}</p><button class="secondary" type="button" onclick="closeReader()">Cerrar</button></div>`;
    }
  }
}
function wait(ms){return new Promise(r=>setTimeout(r,ms))}
function setLoading(show,title='',detail='',cur=0,total=0,done=false){const p=$("#loadingPanel");if(!show){p.classList.add('hidden');return}p.classList.remove('hidden');$("#loadingTitle").textContent=title;$("#loadingDetail").textContent=detail;const t=Math.max(0,+total||0),c=Math.max(0,Math.min(+cur||0,t||+cur||0)),pct=done?100:t?Math.round(c/t*100):0;$("#loadingBar").style.width=pct+'%';$("#loadingCount").textContent=t?`${c} / ${t}`:'Preparando…';$("#loadingPercent").textContent=pct+'%';$("#loadingDone").classList.toggle('hidden',!done);$("#loadingHint").classList.toggle('hidden',done)}
async function addFiles(fileList){const files=[...fileList].filter(f=>/\.(pdf|epub)$/i.test(f.name));if(!files.length){toast('No encontré PDF o EPUB en la selección.');return}$("#addMenu").classList.add('hidden');setLoading(true,'Añadiendo libros…','Preparando la importación',0,files.length);await wait(250);let added=0,skipped=0;for(const f of files){const lower=f.name.toLowerCase(),relativePath=f.webkitRelativePath||f.name,folders=relativePath.split('/').slice(0,-1),tags=[...new Set(folders.map(normTag).filter(Boolean))];try{let coverData=null,meta={};setLoading(true,'Preparando libro…',`Leyendo información: ${f.name}`,added,files.length);if(lower.endsWith('.pdf')){coverData=await generatePdfCover(f);meta=await extractPdfMetadata(f)}else{meta=await extractEpubMetadata(f);coverData=meta.coverData||null}await putBook({id:makeId(),title:meta.title||titleFromFilename(f.name),fileName:f.name,type:lower.endsWith('.epub')?'epub':'pdf',source:'local',file:f,relativePath,progress:0,cfi:null,tags,collections:[],favorite:false,author:meta.author||'',language:meta.language||'',publisher:meta.publisher||'',description:meta.description||'',coverData,metadataScanned:true,lastOpenedAt:0,updatedAt:Date.now()});added++;setLoading(true,'Añadiendo libros…',`Procesando: ${f.name}`,added,files.length);await wait(45)}catch(e){console.error(e);skipped++;setLoading(true,'Añadiendo libros…',`No se pudo añadir: ${f.name}`,added,files.length);await wait(120)}}renderLibrary(await getAllBooks());setLoading(true,'✓ Importación completada',`${added} añadido${added===1?'':'s'}${skipped?` · ${skipped} con problemas`:''}`,files.length,files.length,true);await wait(1600);setLoading(false);toast(skipped?`${added} libros añadidos · ${skipped} con problemas.`:`${added} libro${added===1?'':'s'} añadido${added===1?'':'s'} a tu biblioteca.`)}
$("#addBtn").onclick=()=>$("#addMenu").classList.toggle('hidden');$("#addFilesBtn").onclick=()=>{$("#addMenu").classList.add('hidden');$("#fileInput").click()};$("#addFolderBtn").onclick=()=>{$("#addMenu").classList.add('hidden');$("#folderInput").click()};$("#emptyAddBtn").onclick=()=>$("#fileInput").click();$("#fileInput").onchange=async e=>{await addFiles(e.target.files);e.target.value=''};$("#folderInput").onchange=async e=>{await addFiles(e.target.files);e.target.value=''};
document.addEventListener('click',e=>{if(!e.target.closest('.add-wrap'))$("#addMenu").classList.add('hidden')});
$("#showTagsBtn").onclick=async()=>{const b=$("#tagBar");if(b.classList.contains('hidden'))renderTagBar(await getAllBooks());else{activeTag=null;renderLibrary(await getAllBooks())}};
$("#sortSelect").onchange=async e=>{sortMode=e.target.value;renderLibrary(await getAllBooks())};
$("#searchInput").oninput=async()=>renderLibrary(await getAllBooks());
$("#filterPills").querySelectorAll('.filter-pill').forEach(b=>b.onclick=async()=>{activeFilter=b.dataset.filter;$("#filterPills").querySelectorAll('.filter-pill').forEach(x=>x.classList.toggle('active',x===b));renderLibrary(await getAllBooks())});
$("#gridViewBtn").onclick=()=>{viewMode='grid';$("#gridViewBtn").classList.add('active');$("#listViewBtn").classList.remove('active');renderLibrary(lastBooks)};
$("#listViewBtn").onclick=()=>{viewMode='list';$("#listViewBtn").classList.add('active');$("#gridViewBtn").classList.remove('active');renderLibrary(lastBooks)};
let lastBooks=[];const originalRender=renderLibrary;renderLibrary=function(all){lastBooks=all;originalRender(all)};
$("#themeToggle").onclick=toggleTheme;
loadTheme();
$("#modalClose").onclick=closeBookDetails;$("#deleteBook").onclick=deleteCurrentBook;$("#bookModal").onclick=e=>{if(e.target===$("#bookModal"))closeBookDetails()};$("#saveBook").onclick=saveBookDetails;$("#favoriteBook").onclick=async()=>{if(!modalBook)return;modalBook.favorite=!modalBook.favorite;modalBook.updatedAt=Date.now();await putBook(modalBook);updateFavoriteButton();renderLibrary(await getAllBooks());toast(modalBook.favorite?'Añadido a favoritos.':'Quitado de favoritos.')};$("#addTag").onclick=()=>{const i=$("#newTag"),t=normTag(i.value);if(t&&!modalTags.includes(t)){modalTags.push(t);renderModalTags()}i.value='';i.focus()};$("#newTag").onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();$("#addTag").click()}};
$("#createCollection").onclick=()=>{const i=$("#newCollection"),name=collectionLabel(i.value);if(!name){i.focus();return}if(collections.some(c=>c.toLowerCase()===name.toLowerCase())){toast("Esa colección ya existe.");i.select();return}collections.push(name);collections.sort((a,b)=>a.localeCompare(b,'es',{sensitivity:'base'}));saveCollections();if(modalBook){modalBook.collections=[...new Set([...(modalBook.collections||[]),name])]}i.value='';renderModalCollections();renderLibrary(lastBooks);toast(`Colección “${name}” creada y asignada.`)};
$("#newCollection").onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();$("#createCollection").click()}};
$("#showCollectionsBtn").onclick=async()=>{const b=$("#collectionBar");if(b.classList.contains('hidden'))renderCollectionBar(await getAllBooks());else{activeCollection=null;renderLibrary(await getAllBooks())}};
document.querySelectorAll(".nav-btn").forEach(b=>b.onclick=()=>showView(b.dataset.view));
$("#homeLibraryBtn").onclick=()=>showView("library");
$("#newCollectionPageBtn").onclick=()=>createCollectionPrompt();
$("#newCollectionEmptyBtn").onclick=()=>createCollectionPrompt();
$("#readBook").onclick=async()=>{if(!modalBook)return;const id=modalBook.id;closeBookDetails();await openBook(id,await getAllBooks())};$("#closeReaderBtn").onclick=closeReader;$("#saveProgressBtn").onclick=async()=>{if(!currentBook)return;if(currentEpubRendition){const loc=currentEpubRendition.currentLocation(),cfi=loc?.start?.cfi;if(cfi){currentBook.cfi=cfi;let pct=Number(loc?.start?.percentage);if(!Number.isFinite(pct)){try{pct=Number(currentEpubBook.locations.percentageFromCfi(cfi))}catch(e){}}if(Number.isFinite(pct))currentBook.progress=Math.max(0,Math.min(1,pct));currentBook.updatedAt=Date.now();await putBook(currentBook)}}toast('Posición guardada.')};
document.addEventListener('keydown',e=>{if(e.key!=='Escape')return;if(!$("#bookModal").classList.contains('hidden'))closeBookDetails();else if(!$("#reader").classList.contains('hidden'))closeReader()});
(async()=>{try{loadCollections();await openDB();renderLibrary(await getAllBooks())}catch(e){console.error(e);toast('No se pudo iniciar la biblioteca en este navegador.')}})();


// Controles EPUB explícitos: además de los gestos/teclas del lector, permiten avanzar
// en tablet y PC sin depender del comportamiento del iframe.
const prevPageBtn=$("#prevPageBtn"), nextPageBtn=$("#nextPageBtn");
if(prevPageBtn) prevPageBtn.onclick=async()=>{if(currentEpubRendition){try{await currentEpubRendition.prev()}catch(e){console.warn(e)}}};
if(nextPageBtn) nextPageBtn.onclick=async()=>{if(currentEpubRendition){try{await currentEpubRendition.next()}catch(e){console.warn(e)}}};
document.addEventListener('keydown',async e=>{
  if($("#reader").classList.contains('hidden')||!currentEpubRendition)return;
  if(e.key==='ArrowRight'||e.key==='PageDown'){e.preventDefault();try{await currentEpubRendition.next()}catch(err){console.warn(err)}}
  if(e.key==='ArrowLeft'||e.key==='PageUp'){e.preventDefault();try{await currentEpubRendition.prev()}catch(err){console.warn(err)}}
});
