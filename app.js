const DB_NAME = "biblioteca_lector";
const DB_VERSION = 1;
const STORE = "books";
let db, currentBook=null, currentObjectUrl=null, currentEpubBook=null, currentEpubRendition=null, currentEpubUrl=null;
let activeTag=null, activeCollection=null, activeFilter="all", sortMode="updated", viewMode="grid", modalBook=null, modalTags=[], currentView="home";
let collections=[];
let playerState={book:null,bookEngine:null,chapters:[],chapterIndex:0,chunkIndex:0,chunks:[],speaking:false,paused:false,voices:[],rate:1,startedAt:0,chunkStartedAt:0};
let playerUtterance=null;
const PLAYER_CHUNK_MAX=180;

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
async function exportLibraryBackup(){
  if(typeof JSZip==='undefined'){toast('No está disponible el sistema de respaldo.');return}
  try{
    const books=await getAllBooks();
    if(!books.length && !collections.length){toast('No hay datos de biblioteca para respaldar.');return}
    setLoading(true,'Creando respaldo…','Preparando tu biblioteca',0,Math.max(1,books.length));
    const zip=new JSZip();
    const manifest={
      format:'la-pulenta-biblioteca-backup',
      version:1,
      createdAt:new Date().toISOString(),
      collections:[...collections],
      theme:localStorage.getItem('pulenta_theme')||'light',
      books:[]
    };
    for(let i=0;i<books.length;i++){
      const b=books[i];
      const ext=(b.type||'pdf').toLowerCase()==='epub'?'epub':'pdf';
      const path=`files/${b.id}.${ext}`;
      const fileBlob=b.file instanceof Blob?b.file:null;
      if(fileBlob) zip.file(path,fileBlob);
      const copy={...b};
      delete copy.file;
      copy.backupFile=fileBlob?path:null;
      manifest.books.push(copy);
      setLoading(true,'Creando respaldo…',`Preparando: ${b.title||b.fileName||'libro'}`,i+1,books.length);
      await wait(0);
    }
    zip.file('pulenta-backup.json',JSON.stringify(manifest,null,2));
    const blob=await zip.generateAsync({type:'blob',compression:'DEFLATE',compressionOptions:{level:6}},meta=>{
      const pct=books.length?Math.round((meta.percent||0)/100*100):Math.round(meta.percent||0);
      setLoading(true,'Creando respaldo…','Comprimiendo archivos',books.length,books.length);
      const bar=$('#loadingBar');if(bar)bar.style.width=Math.max(0,Math.min(100,pct))+'%';
      const per=$('#loadingPercent');if(per)per.textContent=Math.max(0,Math.min(100,pct))+'%';
    });
    const stamp=new Date().toISOString().replace(/[:.]/g,'-').slice(0,19);
    const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`la-pulenta-respaldo-${stamp}.zip`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),1500);
    setLoading(true,'✓ Respaldo listo','Se descargó una copia de tu biblioteca.',books.length,books.length,true);await wait(1200);setLoading(false);toast('Respaldo descargado correctamente.');
  }catch(e){console.error('Backup export:',e);setLoading(false);toast('No pude crear el respaldo.');}
}
async function importLibraryBackup(file){
  if(!file||typeof JSZip==='undefined')return;
  try{
    setLoading(true,'Restaurando respaldo…','Abriendo archivo',0,1);
    const zip=await JSZip.loadAsync(file);
    const manifestFile=zip.file('pulenta-backup.json');
    if(!manifestFile)throw new Error('No encontré pulenta-backup.json');
    const manifest=JSON.parse(await manifestFile.async('text'));
    if(manifest.format!=='la-pulenta-biblioteca-backup')throw new Error('El archivo no parece un respaldo de La Pulenta.');
    if(!Array.isArray(manifest.books))throw new Error('El respaldo no contiene libros válidos.');
    const backupCollections=Array.isArray(manifest.collections)?manifest.collections.filter(Boolean):[];
    collections=[...new Set([...collections,...backupCollections])].sort((a,b)=>a.localeCompare(b,'es',{sensitivity:'base'}));
    saveCollections();
    let restored=0,missing=0;
    for(let i=0;i<manifest.books.length;i++){
      const meta=manifest.books[i];
      const copy={...meta};
      delete copy.backupFile;
      const entry=meta.backupFile?zip.file(meta.backupFile):null;
      if(entry){
        const blob=await entry.async('blob');
        copy.file=new File([blob],meta.fileName||`libro.${meta.type||'pdf'}`,{type:meta.type==='epub'?'application/epub+zip':'application/pdf'});
        restored++;
      }else if(meta.file){
        copy.file=meta.file;
        restored++;
      }else{
        missing++;
        continue;
      }
      await putBook(copy);
      setLoading(true,'Restaurando respaldo…',`Restaurando: ${copy.title||copy.fileName||'libro'}`,i+1,manifest.books.length);
    }
    if(manifest.theme==='dark'||manifest.theme==='light'){
      localStorage.setItem('pulenta_theme',manifest.theme);loadTheme();
    }
    renderLibrary(await getAllBooks());
    setLoading(true,'✓ Restauración completada',`${restored} libro${restored===1?'':'s'} restaurado${restored===1?'':'s'}${missing?` · ${missing} sin archivo`:''}`,manifest.books.length,manifest.books.length,true);
    await wait(1400);setLoading(false);toast(missing?`${restored} restaurados · ${missing} sin archivo.`:`${restored} libros restaurados correctamente.`);
    closeBackupModal();
  }catch(e){console.error('Backup import:',e);setLoading(false);toast(`No pude importar el respaldo: ${e.message||'archivo inválido'}`)}
}
function openBackupModal(){$('#backupModal').classList.remove('hidden')}
function closeBackupModal(){$('#backupModal').classList.add('hidden')}

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
  ["home","collections","library","player"].forEach(v=>$("#view"+v.charAt(0).toUpperCase()+v.slice(1))?.classList.toggle('hidden',v!==view));
  document.querySelectorAll('.nav-btn').forEach(b=>b.classList.toggle('active',b.dataset.view===view));
  if(view==='home') window.scrollTo({top:0,behavior:'smooth'});
  if(view==='collections') window.scrollTo({top:0,behavior:'smooth'});
  if(view==='library') window.scrollTo({top:0,behavior:'smooth'});
  if(view==='player'){await showPlayer();window.scrollTo({top:0,behavior:'smooth'});}
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
function playerSupported(){return 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window}
function playerSplitText(text){
  const clean=String(text||'').replace(/\s+/g,' ').trim();
  if(!clean)return [];
  const parts=clean.split(/(?<=[.!?…])\s+/);
  const out=[]; let buf='';
  for(const part of parts){
    if(!part)continue;
    if((buf+' '+part).trim().length<=PLAYER_CHUNK_MAX){buf=(buf+' '+part).trim()}
    else{if(buf)out.push(buf);buf=part}
  }
  if(buf)out.push(buf);
  return out;
}
async function extractEpubChapters(b){
  if(!b?.file)throw new Error('Este libro no tiene un archivo disponible.');
  if(typeof ePub!=='function')throw new Error('El motor EPUB no está disponible.');

  // EPUB.js no garantiza que Section.contents exista hasta que esa sección
  // haya pasado por una rendition. El lector normal de La Pulenta ya usa
  // este mecanismo, así que El Pulento Player hace una rendition invisible
  // para obtener exactamente el mismo texto que el usuario puede seleccionar.
  const engine=ePub();
  const buffer=await b.file.arrayBuffer();
  await engine.open(buffer,'binary');
  await engine.ready;

  const holder=document.createElement('div');
  holder.setAttribute('aria-hidden','true');
  holder.style.cssText='position:fixed;left:-10000px;top:0;width:900px;height:700px;overflow:hidden;opacity:0;pointer-events:none;z-index:-1;';
  document.body.appendChild(holder);

  let rendition=null;
  const chapters=[];
  try{
    rendition=engine.renderTo(holder,{
      width:900,
      height:700,
      flow:'scrolled-doc',
      manager:'default',
      spread:'none',
      allowScriptedContent:false
    });

    const items=(engine.spine?.spineItems||[]).filter(item=>item.linear!==false);
    const toc=engine.navigation?.toc||[];

    const cleanHref=value=>String(value||'').split('#')[0].replace(/^\.\//,'');
    const tocLabelFor=item=>{
      const href=cleanHref(item?.href);
      const found=toc.find(t=>cleanHref(t?.href)===href || cleanHref(t?.href).endsWith(href) || href.endsWith(cleanHref(t?.href)));
      return found?.label?.trim()||'';
    };

    for(let i=0;i<items.length;i++){
      const item=items[i];
      try{
        // Mostrar la sección en la rendition invisible hace que EPUB.js
        // construya item.contents y cargue el XHTML real.
        await rendition.display(item.href);

        const doc=item?.contents?.document || item?.document || null;
        const root=doc?.body || doc?.documentElement || null;
        let text='';
        if(root){
          text=(root.innerText||root.textContent||'').replace(/\s+/g,' ').trim();
        }

        // Fallback adicional: el contenido de la vista actualmente renderizada.
        if(!text){
          const contents=rendition.getContents?.()||[];
          const current=contents[contents.length-1];
          const currentRoot=current?.document?.body||current?.document?.documentElement||null;
          if(currentRoot)text=(currentRoot.innerText||currentRoot.textContent||'').replace(/\s+/g,' ').trim();
        }

        if(text){
          const filename=String(item?.href||'').split('/').pop()?.replace(/\.[^.]+$/,'')||`Capítulo ${chapters.length+1}`;
          const tocTitle=tocLabelFor(item);
          chapters.push({
            index:i,
            title:tocTitle||filename,
            text,
            chunks:playerSplitText(text)
          });
        }
      }catch(e){
        console.warn('Pulento Player: no pude renderizar sección',i,e);
      }
    }
  }finally{
    try{rendition?.destroy()}catch(e){}
    try{engine.destroy()}catch(e){}
    holder.remove();
  }

  if(!chapters.length)throw new Error('No encontré texto legible dentro de este EPUB. El lector puede mostrarlo, pero el reproductor no logró extraer sus secciones.');
  chapters.forEach((c,i)=>{if(!c.title||/^(x?html?|content|text|page)[-_]?\d*$/i.test(c.title))c.title=`Capítulo ${i+1}`});
  return chapters;
}
function playerLoadVoices(){
  if(!playerSupported())return;
  const fill=()=>{
    playerState.voices=speechSynthesis.getVoices()||[];
    const sel=$('#playerVoiceSelect');if(!sel)return;
    const prev=sel.value;
    const voices=playerState.voices;
    sel.innerHTML=voices.length?voices.map((v,i)=>`<option value="${i}">${esc(v.name)} — ${esc(v.lang)}</option>`).join(''):'<option value="">Voz del dispositivo</option>';
    const preferred=voices.findIndex(v=>/^es(-|_|$)/i.test(v.lang));
    sel.value=prev&&voices[+prev]?prev:(preferred>=0?String(preferred):(voices.length?'0':''));
  };
  fill(); speechSynthesis.onvoiceschanged=fill;
}
function playerTotalChunks(){
  return playerState.chapters.reduce((n,c)=>n+(c?.chunks?.length||0),0);
}
function playerChapterStartChunk(index){
  return playerState.chapters.slice(0,index).reduce((n,c)=>n+(c?.chunks?.length||0),0);
}
function playerPopulateChapterSelect(){
  const sel=$('#playerChapterSelect');
  if(!sel)return;
  sel.innerHTML=playerState.chapters.map((c,i)=>`<option value="${i}">${i+1}. ${esc(c.title||`Capítulo ${i+1}`)}</option>`).join('');
  sel.value=String(Math.max(0,playerState.chapterIndex));
}
function playerSetUI(){
  const b=playerState.book;if(!b)return;
  $('#playerTitle').textContent=b.title||b.fileName||'Sin título';
  $('#playerAuthor').textContent=b.author||'Sin autor';
  $('#playerCover').innerHTML=b.coverData?`<img src="${b.coverData}" alt="Portada de ${esc(b.title)}">`:coverFor(b,true);
  const ch=playerState.chapters[playerState.chapterIndex];
  $('#playerChapter').textContent=ch?.title||'—';
  $('#playerChapterMeta').textContent=ch?`Capítulo ${playerState.chapterIndex+1} de ${playerState.chapters.length}`:'—';

  const total=Math.max(1,playerTotalChunks());
  const done=Math.min(total,playerChapterStartChunk(playerState.chapterIndex)+playerState.chunkIndex);
  const pct=Math.max(0,Math.min(1,done/total));
  $('#playerProgressBar').style.width=Math.round(pct*100)+'%';
  $('#playerPercentLabel').textContent=Math.round(pct*100)+'%';
  $('#playerTimeLabel').textContent=playerState.speaking?(playerState.paused?'Pausado':'Reproduciendo'):(done>=total?'Terminado':'Listo');
  $('#playerPlayBtn').textContent=playerState.speaking&&!playerState.paused?'⏸':'▶';

  const timeline=$('#playerTimeline');
  if(timeline){
    timeline.max=String(total);
    timeline.value=String(done);
    timeline.disabled=total<=1;
    timeline.setAttribute('aria-valuetext',`${Math.round(pct*100)}% del libro`);
  }
  const chapterSelect=$('#playerChapterSelect');
  if(chapterSelect){
    if(chapterSelect.options.length!==playerState.chapters.length)playerPopulateChapterSelect();
    chapterSelect.value=String(Math.max(0,playerState.chapterIndex));
  }
}
async function playerPersist(){
  const b=playerState.book;if(!b)return;
  b.audioChapter=playerState.chapterIndex;b.audioChunk=playerState.chunkIndex;
  const total=playerState.chapters.reduce((n,c)=>n+c.chunks.length,0)||1;
  const done=playerState.chapters.slice(0,playerState.chapterIndex).reduce((n,c)=>n+c.chunks.length,0)+playerState.chunkIndex;
  b.audioProgress=Math.max(0,Math.min(1,done/total));b.updatedAt=Date.now();
  try{await putBook(b)}catch(e){console.warn('No pude guardar progreso de audio',e)}
}
function playerCancelSpeech(){if(playerSupported())speechSynthesis.cancel();playerUtterance=null;playerState.speaking=false;playerState.paused=false}
async function playerSpeakCurrent(){
  if(!playerSupported()){toast('Este navegador no ofrece Text-to-Speech.');return}
  const ch=playerState.chapters[playerState.chapterIndex];
  if(!ch)return;
  if(playerState.chunkIndex>=ch.chunks.length){if(playerState.chapterIndex<playerState.chapters.length-1){playerState.chapterIndex++;playerState.chunkIndex=0;return playerSpeakCurrent()}playerState.speaking=false;playerState.paused=false;await playerPersist();playerSetUI();toast('Terminaste el libro. 🎉');return}
  playerCancelSpeech();
  const text=ch.chunks[playerState.chunkIndex];
  const u=new SpeechSynthesisUtterance(text);playerUtterance=u;
  const sel=$('#playerVoiceSelect');const voice=playerState.voices[Number(sel?.value)];if(voice)u.voice=voice;u.rate=Number($('#playerRateSelect')?.value||1);u.pitch=1;u.volume=1;
  u.onstart=()=>{playerState.speaking=true;playerState.paused=false;playerState.chunkStartedAt=Date.now();playerSetUI()};
  u.onpause=()=>{playerState.paused=true;playerSetUI()};
  u.onresume=()=>{playerState.paused=false;playerSetUI()};
  u.onerror=e=>{console.warn('Pulenta TTS:',e);playerState.speaking=false;playerState.paused=false;playerSetUI();toast('La voz del dispositivo tuvo un problema.')};
  u.onend=async()=>{if(playerUtterance!==u)return;playerState.chunkIndex++;await playerPersist();playerSetUI();if(playerState.speaking!==false)await playerSpeakCurrent()};
  playerState.speaking=true;playerState.paused=false;playerSetUI();speechSynthesis.speak(u);
}
async function playerToggle(){
  if(!playerState.book)return;
  if(!playerSupported()){toast('Este navegador no ofrece Text-to-Speech.');return}
  if(playerState.speaking){if(playerState.paused){speechSynthesis.resume()}else{speechSynthesis.pause()}return}
  await playerSpeakCurrent();
}
async function playerLoadBook(id){
  playerCancelSpeech();
  const books=await getAllBooks();const b=books.find(x=>x.id===id);if(!b)return;
  if(b.type!=='epub'){toast('El Pulento Player comenzará con EPUB. PDF llegará en una siguiente etapa.');return}
  $('#playerEmpty').classList.add('hidden');$('#playerNow').classList.remove('hidden');
  $('#playerChapter').textContent='Preparando texto…';$('#playerChapterMeta').textContent='';
  playerState={...playerState,book:b,bookEngine:null,chapters:[],chapterIndex:Math.max(0,b.audioChapter||0),chunkIndex:Math.max(0,b.audioChunk||0),speaking:false,paused:false};
  try{
    playerState.chapters=await extractEpubChapters(b);
    if(!playerState.chapters.length)throw new Error('El EPUB no contiene secciones con texto legible.');
    playerState.chapterIndex=Math.min(playerState.chapterIndex,playerState.chapters.length-1);
    playerPopulateChapterSelect();
    const currentChapter=playerState.chapters[playerState.chapterIndex];
    playerState.chunkIndex=Math.min(playerState.chunkIndex,Math.max(0,currentChapter.chunks.length-1));
    playerSetUI();
    await playerPersist();
    document.querySelectorAll('[data-player-id]').forEach(x=>x.classList.toggle('active',x.dataset.playerId===b.id));
  }catch(e){
    console.error('Pulento Player: error preparando EPUB',e);
    $('#playerNow').classList.add('hidden');$('#playerEmpty').classList.remove('hidden');
    toast(`No pude preparar el EPUB: ${e?.message||'error desconocido'}`);
  }
}
async function showPlayer(){
  // showPlayer solo prepara el contenido del reproductor.
  // NO llama a showView('player') porque showView ya nos trajo aquí.
  const books=await getAllBooks();const epubs=books.filter(b=>b.type==='epub');
  $('#playerBookCount').textContent=String(epubs.length);
  $('#playerBookList').innerHTML=epubs.length?epubs.map(b=>`<button class="player-book-item ${playerState.book?.id===b.id?'active':''}" data-player-id="${esc(b.id)}" type="button"><span class="player-mini-cover">${b.coverData?`<img src="${b.coverData}" alt="">`:'📖'}</span><span><strong>${esc(b.title)}</strong><small>${esc(b.author||'Sin autor')} · ${Math.round((b.audioProgress||0)*100)}% escuchado</small></span></button>`).join(''):'<div class="player-list-empty">No tienes EPUB todavía.<br>Añade un EPUB a tu biblioteca y aparecerá aquí.</div>';
  $('#playerBookList').querySelectorAll('[data-player-id]').forEach(x=>x.onclick=()=>playerLoadBook(x.dataset.playerId));
  if(playerState.book&&playerState.chapters.length)playerSetUI();
  playerLoadVoices();
  $('#playerSupportNote').textContent=playerSupported()?'Las voces dependen del navegador y del dispositivo. No se genera ni se guarda ningún archivo de audio.':'Este navegador no ofrece SpeechSynthesis. Prueba con un navegador moderno con voces del sistema.';
}
async function closeReader(){
  if(currentBook){try{await putBook(currentBook)}catch(e){}}
  if(currentEpubRendition){try{currentEpubRendition.destroy()}catch(e){}}
  if(currentEpubBook){try{currentEpubBook.destroy()}catch(e){}}
  currentEpubRendition=null;
  currentEpubBook=null;
  if(currentEpubUrl){URL.revokeObjectURL(currentEpubUrl);currentEpubUrl=null}
  if(currentObjectUrl){URL.revokeObjectURL(currentObjectUrl);currentObjectUrl=null}
  if(pdfState?.cleanup){try{pdfState.cleanup()}catch(e){}}
  if(pdfState?.doc){try{await pdfState.doc.destroy()}catch(e){}}
  setPdfStateDefaults();
  const controls=document.getElementById('pdfReaderControls');if(controls)controls.classList.add('hidden');
  document.getElementById('readerBody').innerHTML='';
  document.getElementById('reader').classList.add('hidden');
  currentBook=null;
  try{renderLibrary(await getAllBooks())}catch(e){}
}
function nextFrame(){return new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))}
async function createEpubRendition(b, holder){
  if(typeof JSZip==='undefined') throw new Error('JSZip no está disponible');
  const buffer = await b.file.arrayBuffer();
  currentEpubBook = ePub();
  await currentEpubBook.open(buffer, 'binary');
  await currentEpubBook.ready;
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
      let pct=NaN;
      try{if(currentEpubBook?.locations?.length)pct=Number(currentEpubBook.locations.percentageFromCfi(cfi))}catch(e){}
      if(!Number.isFinite(pct)){const raw=Number(loc?.start?.percentage);if(Number.isFinite(raw))pct=raw}
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
  if(pdfState?.doc){
    const p=pdfState.page||1, n=pdfState.doc.numPages||0;
    document.getElementById('readerInfo').textContent=`PDF · Página ${p}${n?` / ${n}`:''} · ${pct}%`;
  }else{
    document.getElementById('readerInfo').textContent=`${(currentBook.type||'pdf').toUpperCase()} · ${currentBook.source==='drive'?'Google Drive':'Dispositivo'} · ${pct}%`;
  }
}
const pdfState={};
function setPdfStateDefaults(){pdfState.doc=null;pdfState.page=1;pdfState.double=false;pdfState.coverFirst=false;pdfState.zoom=1;pdfState.fit=true;pdfState.renderToken=0;pdfState.swipeX=0;pdfState.swipeY=0;pdfState.cache=new Map();pdfState.prefetching=new Set();pdfState.viewportKey=''}
async function openPdfReader(b){
  if(!window.pdfjsLib)throw new Error('PDF.js no está disponible');
  setPdfStateDefaults();
  const stage=document.createElement('div');stage.className='pdf-stage';stage.tabIndex=0;
  const spread=document.createElement('div');spread.className='pdf-spread';stage.appendChild(spread);
  const info=document.createElement('div');info.className='pdf-bottom-info';stage.appendChild(info);
  document.getElementById('readerBody').appendChild(stage);
  pdfState.doc=await window.pdfjsLib.getDocument({data:await b.file.arrayBuffer()}).promise;
  pdfState.page=Math.max(1,Math.min(Number(b.pdfPage)||1,pdfState.doc.numPages));
  pdfState.double=!!b.pdfDouble;
  pdfState.coverFirst=pdfState.double && !!b.pdfCoverFirst;
  if(pdfState.double && pdfState.coverFirst && pdfState.page>1 && pdfState.page%2!==0) pdfState.page=Math.max(2,pdfState.page-1);
  if(pdfState.double && !pdfState.coverFirst && pdfState.page>1 && pdfState.page%2===0) pdfState.page=Math.max(1,pdfState.page-1);
  pdfState.zoom=Number(b.pdfZoom)||1;
  pdfState.fit=true;
  document.getElementById('pdfReaderControls').classList.remove('hidden');
  const single=document.getElementById('pdfSingleBtn'), dbl=document.getElementById('pdfDoubleBtn'), cover=document.getElementById('pdfCoverFirstBtn');
  single.classList.toggle('active',!pdfState.double);dbl.classList.toggle('active',pdfState.double);cover.classList.toggle('active',pdfState.double&&pdfState.coverFirst);cover.disabled=!pdfState.double;
  const cacheKey=(num,scale)=>`${num}|${Math.round(scale*1000)}`;
  const invalidateCache=()=>{for(const item of pdfState.cache.values()){try{item.bitmap?.close?.()}catch(e){}}pdfState.cache.clear();pdfState.viewportKey=''};
  const renderOne=async(num,scale,dpr,token,allowCache=true)=>{
    const page=await pdfState.doc.getPage(num);if(token!==pdfState.renderToken)return null;
    const viewport=page.getViewport({scale});const key=cacheKey(num,scale);
    const wrap=document.createElement('div');wrap.className='pdf-page-wrap'+(pdfState.double?'':' single');
    const canvas=document.createElement('canvas');canvas.className='pdf-page';canvas.width=Math.ceil(viewport.width*dpr);canvas.height=Math.ceil(viewport.height*dpr);canvas.style.width=`${viewport.width}px`;canvas.style.height=`${viewport.height}px`;wrap.appendChild(canvas);
    const cached=allowCache?pdfState.cache.get(key):null;
    if(cached?.bitmap){canvas.getContext('2d',{alpha:false}).drawImage(cached.bitmap,0,0,canvas.width,canvas.height);return wrap}
    const ctx=canvas.getContext('2d',{alpha:false});const renderViewport=page.getViewport({scale:scale*dpr});await page.render({canvasContext:ctx,viewport:renderViewport}).promise;
    if(token!==pdfState.renderToken)return null;
    try{const bitmap=await createImageBitmap(canvas);pdfState.cache.set(key,{bitmap,width:canvas.width,height:canvas.height})}catch(e){}
    return wrap;
  };
  const prefetch=async(nums,scale,dpr)=>{
    const unique=[...new Set(nums)].filter(n=>n>=1&&n<=pdfState.doc.numPages);
    for(const num of unique){const key=cacheKey(num,scale);if(pdfState.cache.has(key)||pdfState.prefetching.has(key))continue;pdfState.prefetching.add(key);try{const page=await pdfState.doc.getPage(num);const viewport=page.getViewport({scale});const canvas=document.createElement('canvas');canvas.width=Math.ceil(viewport.width*dpr);canvas.height=Math.ceil(viewport.height*dpr);const ctx=canvas.getContext('2d',{alpha:false});await page.render({canvasContext:ctx,viewport:page.getViewport({scale:scale*dpr})}).promise;const bitmap=await createImageBitmap(canvas);pdfState.cache.set(key,{bitmap,width:canvas.width,height:canvas.height})}catch(e){}finally{pdfState.prefetching.delete(key)}}
  };
  const render=async()=>{
    const token=++pdfState.renderToken;spread.innerHTML='';
    const pages=pdfState.double?(pdfState.coverFirst && pdfState.page===1?[1]:[pdfState.page,Math.min(pdfState.page+1,pdfState.doc.numPages)]):[pdfState.page];
    const unique=[...new Set(pages)].filter(n=>n>=1&&n<=pdfState.doc.numPages);
    const dpr=Math.min(window.devicePixelRatio||1,2);
    const scales=[];
    for(const num of unique){const base=(await pdfState.doc.getPage(num)).getViewport({scale:1});const boxW=Math.max(240,stage.clientWidth*(pdfState.double?.47:.94));const boxH=Math.max(240,stage.clientHeight*.91);const fitScale=Math.min(boxW/base.width,boxH/base.height);scales.push(pdfState.fit?fitScale:fitScale*pdfState.zoom)}
    for(let i=0;i<unique.length;i++){const wrap=await renderOne(unique[i],scales[i],dpr,token,true);if(token!==pdfState.renderToken)return;if(wrap)spread.appendChild(wrap)}
    const shownLabel=pdfState.double?(pdfState.coverFirst&&pdfState.page===1?'Portada':(pdfState.page<pdfState.doc.numPages?`Páginas ${pdfState.page}–${pdfState.page+1}`:`Página ${pdfState.page}`)):`Página ${pdfState.page}`;info.textContent=`${shownLabel} · ${pdfState.doc.numPages} · ${Math.round((pdfState.page-1)/Math.max(1,pdfState.doc.numPages-1)*100)}%`;
    const pct=(pdfState.page-1)/Math.max(1,pdfState.doc.numPages-1);b.pdfPage=pdfState.page;b.pdfDouble=pdfState.double;b.pdfCoverFirst=pdfState.coverFirst;b.pdfZoom=pdfState.zoom;b.progress=Math.max(0,Math.min(1,pct));b.updatedAt=Date.now();currentBook=b;try{await putBook(b)}catch(e){}updateReaderInfo();
    const nextStart=pdfState.double?(pdfState.coverFirst&&pdfState.page===1?2:pdfState.page+2):pdfState.page+1;
    const nextNums=pdfState.double?[nextStart,nextStart+1,nextStart+2]:[nextStart,nextStart+1];
    const preScale=scales[0]||1;prefetch(nextNums,preScale,dpr);
  };
  pdfState.render=render;
  const goPrev=async()=>{if(pdfState.double&&pdfState.coverFirst){pdfState.page=pdfState.page===1?1:(pdfState.page===2?1:Math.max(2,pdfState.page-2));}else{pdfState.page=Math.max(1,pdfState.page-(pdfState.double?2:1));}pdfState.fit=true;await render()};
  const goNext=async()=>{if(pdfState.double&&pdfState.coverFirst){pdfState.page=pdfState.page===1?(pdfState.doc.numPages>=2?2:1):Math.min(pdfState.doc.numPages,pdfState.page+2);}else{pdfState.page=Math.min(pdfState.doc.numPages,pdfState.page+(pdfState.double?2:1));}pdfState.fit=true;await render()};
  document.getElementById('prevPageBtn').onclick=goPrev;document.getElementById('nextPageBtn').onclick=goNext;
  document.getElementById('pdfSingleBtn').onclick=async()=>{pdfState.double=false;pdfState.coverFirst=false;document.getElementById('pdfSingleBtn').classList.add('active');document.getElementById('pdfDoubleBtn').classList.remove('active');document.getElementById('pdfCoverFirstBtn').classList.remove('active');document.getElementById('pdfCoverFirstBtn').disabled=true;await render()};
  document.getElementById('pdfDoubleBtn').onclick=async()=>{pdfState.double=true;if(pdfState.coverFirst){pdfState.page=pdfState.page===1?1:(pdfState.page%2!==0?Math.max(2,pdfState.page-1):pdfState.page);}else if(pdfState.page%2===0&&pdfState.page>1)pdfState.page--;document.getElementById('pdfDoubleBtn').classList.add('active');document.getElementById('pdfSingleBtn').classList.remove('active');document.getElementById('pdfCoverFirstBtn').disabled=false;await render()};
  document.getElementById('pdfCoverFirstBtn').onclick=async()=>{if(!pdfState.double)return;pdfState.coverFirst=!pdfState.coverFirst;if(pdfState.coverFirst){if(pdfState.page>1&&pdfState.page%2!==0)pdfState.page=Math.max(2,pdfState.page-1);}else if(pdfState.page===1){pdfState.page=1;}document.getElementById('pdfCoverFirstBtn').classList.toggle('active',pdfState.coverFirst);await render()};
  document.getElementById('pdfZoomOutBtn').onclick=async()=>{invalidateCache();pdfState.fit=false;pdfState.zoom=Math.max(.65,pdfState.zoom-.2);await render()};
  document.getElementById('pdfZoomInBtn').onclick=async()=>{invalidateCache();pdfState.fit=false;pdfState.zoom=Math.min(3,pdfState.zoom+.2);await render()};
  document.getElementById('pdfFitBtn').onclick=async()=>{invalidateCache();pdfState.fit=true;pdfState.zoom=1;await render()};
  document.getElementById('pdfFullscreenBtn').onclick=async()=>{try{await document.getElementById('reader').requestFullscreen()}catch(e){toast('Pantalla completa no disponible en este navegador.')}};
  stage.addEventListener('pointerdown',e=>{pdfState.swipeX=e.clientX;pdfState.swipeY=e.clientY});
  stage.addEventListener('pointerup',async e=>{const dx=e.clientX-pdfState.swipeX,dy=e.clientY-pdfState.swipeY;if(Math.abs(dx)>60&&Math.abs(dx)>Math.abs(dy)*1.2){if(dx<0)await goNext();else await goPrev()}});
  document.getElementById('saveProgressBtn').onclick=async()=>{if(currentBook){currentBook.pdfPage=pdfState.page;currentBook.progress=(pdfState.page-1)/Math.max(1,pdfState.doc.numPages-1);currentBook.updatedAt=Date.now();await putBook(currentBook);toast('Posición guardada.');updateReaderInfo()}};
  const onResize=()=>{if(!document.getElementById('reader').classList.contains('hidden')){invalidateCache();render()}};window.addEventListener('resize',onResize,{passive:true});pdfState.cleanup=()=>window.removeEventListener('resize',onResize);
  stage.addEventListener('dblclick',async()=>{pdfState.fit=!pdfState.fit;await render()});
  stage.focus();await render();
}
async function openBook(id,books){
  const b=(books||await getAllBooks()).find(x=>x.id===id);if(!b)return;
  b.lastOpenedAt=Date.now();b.updatedAt=b.lastOpenedAt;try{await putBook(b)}catch(e){console.warn('No pude registrar la lectura actual',e)}
  currentBook=b;
  document.getElementById('readerTitle').textContent=b.title;updateReaderInfo();document.getElementById('readerBody').innerHTML='';document.getElementById('reader').classList.remove('hidden');
  if(b.type==='pdf'){
    try{await openPdfReader(b)}catch(e){console.error('PDF:',e);document.getElementById('readerBody').innerHTML=`<div class="pdf-empty"><h3>No pude abrir este PDF</h3><p>El archivo sigue en tu biblioteca. El lector encontró un problema al cargarlo.</p><p class="book-meta">Detalle técnico: ${esc(e?.message||String(e))}</p><button class="secondary" type="button" onclick="closeReader()">Cerrar</button></div>`;}
  }else{
    if(typeof ePub!=='function'){document.getElementById('readerBody').innerHTML='<div class="epub-reader epub-error"><h3>No se pudo cargar el motor EPUB</h3><p>Revisa tu conexión a internet y vuelve a abrir la app.</p><button class="secondary" type="button" onclick="closeReader()">Cerrar</button></div>';return}
    const holder=document.createElement('div');holder.className='epub-reader';document.getElementById('readerBody').appendChild(holder);
    try{await nextFrame();await createEpubRendition(b,holder)}catch(e){console.error('EPUB:',e);const detail=esc(e?.message||String(e)||'Error desconocido');document.getElementById('readerBody').innerHTML=`<div class="epub-reader epub-error"><h3>No pude abrir este EPUB</h3><p>El archivo está bien guardado en la biblioteca, pero el lector no pudo interpretar su contenido.</p><p class="book-meta">Detalle técnico: ${detail}</p><button class="secondary" type="button" onclick="closeReader()">Cerrar</button></div>`;}
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
$("#settingsBtn").onclick=openBackupModal;
$("#backupClose").onclick=closeBackupModal;
$("#backupModal").onclick=e=>{if(e.target===$("#backupModal"))closeBackupModal()};
$("#exportBackupBtn").onclick=exportLibraryBackup;
$("#importBackupBtn").onclick=()=>$("#backupInput").click();
$("#backupInput").onchange=async e=>{const f=e.target.files?.[0];if(f){if(confirm("¿Importar este respaldo? Los libros del respaldo se agregarán o actualizarán. Los demás libros no se borrarán."))await importLibraryBackup(f)}e.target.value=""};
loadTheme();
$("#modalClose").onclick=closeBookDetails;$("#deleteBook").onclick=deleteCurrentBook;$("#bookModal").onclick=e=>{if(e.target===$("#bookModal"))closeBookDetails()};$("#saveBook").onclick=saveBookDetails;$("#favoriteBook").onclick=async()=>{if(!modalBook)return;modalBook.favorite=!modalBook.favorite;modalBook.updatedAt=Date.now();await putBook(modalBook);updateFavoriteButton();renderLibrary(await getAllBooks());toast(modalBook.favorite?'Añadido a favoritos.':'Quitado de favoritos.')};$("#addTag").onclick=()=>{const i=$("#newTag"),t=normTag(i.value);if(t&&!modalTags.includes(t)){modalTags.push(t);renderModalTags()}i.value='';i.focus()};$("#newTag").onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();$("#addTag").click()}};
$("#createCollection").onclick=()=>{const i=$("#newCollection"),name=collectionLabel(i.value);if(!name){i.focus();return}if(collections.some(c=>c.toLowerCase()===name.toLowerCase())){toast("Esa colección ya existe.");i.select();return}collections.push(name);collections.sort((a,b)=>a.localeCompare(b,'es',{sensitivity:'base'}));saveCollections();if(modalBook){modalBook.collections=[...new Set([...(modalBook.collections||[]),name])]}i.value='';renderModalCollections();renderLibrary(lastBooks);toast(`Colección “${name}” creada y asignada.`)};
$("#newCollection").onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();$("#createCollection").click()}};
// Controles de selección por lote
$("#batchClose").onclick=closeBatchCollection;
$("#batchCancel").onclick=closeBatchCollection;
$("#batchSave").onclick=saveBatchCollection;
$("#batchSearch").oninput=()=>renderBatchList();
$("#batchSelectAll").onclick=()=>{batchBooks.filter(b=>{const q=$("#batchSearch").value.trim().toLowerCase();const hay=[b.title,b.author,b.fileName,...(b.tags||[])].join(" ").toLowerCase();return !q||hay.includes(q)}).forEach(b=>batchSelected.add(b.id));renderBatchList()};
$("#batchClear").onclick=()=>{batchSelected.clear();renderBatchList()};
$("#collectionBatchModal").onclick=e=>{if(e.target===$("#collectionBatchModal"))closeBatchCollection()};
$("#showCollectionsBtn").onclick=async()=>{const b=$("#collectionBar");if(b.classList.contains('hidden'))renderCollectionBar(await getAllBooks());else{activeCollection=null;renderLibrary(await getAllBooks())}};
document.querySelectorAll(".nav-btn").forEach(b=>b.onclick=()=>showView(b.dataset.view));
// Pulento Player
$("#playerPlayBtn")?.addEventListener('click',playerToggle);
$("#playerStopBtn")?.addEventListener('click',()=>{playerCancelSpeech();playerSetUI()});
$("#playerPrevBtn")?.addEventListener('click',async()=>{if(!playerState.book)return;playerCancelSpeech();if(playerState.chapterIndex>0){playerState.chapterIndex--;playerState.chunkIndex=0;await playerPersist();playerSetUI()}});
$("#playerNextBtn")?.addEventListener('click',async()=>{if(!playerState.book)return;playerCancelSpeech();if(playerState.chapterIndex<playerState.chapters.length-1){playerState.chapterIndex++;playerState.chunkIndex=0;await playerPersist();playerSetUI()}else{playerState.chunkIndex=playerState.chapters[playerState.chapterIndex]?.chunks.length||0;await playerPersist();playerSetUI()}});
$("#playerBackBtn")?.addEventListener('click',async()=>{if(!playerState.book)return;playerCancelSpeech();playerState.chunkIndex=Math.max(0,playerState.chunkIndex-1);await playerSpeakCurrent()});
$("#playerForwardBtn")?.addEventListener('click',async()=>{if(!playerState.book)return;playerCancelSpeech();const ch=playerState.chapters[playerState.chapterIndex];if(ch)playerState.chunkIndex=Math.min(ch.chunks.length,playerState.chunkIndex+1);await playerSpeakCurrent()});
$("#playerRateSelect")?.addEventListener('change',()=>{if(playerState.speaking){playerCancelSpeech();playerSpeakCurrent()} });
$("#playerVoiceSelect")?.addEventListener('change',()=>{if(playerState.speaking){playerCancelSpeech();playerSpeakCurrent()} });
$("#playerChapterSelect")?.addEventListener('change',async e=>{
  if(!playerState.book||!playerState.chapters.length)return;
  const wasPlaying=playerState.speaking&&!playerState.paused;
  playerCancelSpeech();
  const next=Math.max(0,Math.min(playerState.chapters.length-1,Number(e.target.value)||0));
  playerState.chapterIndex=next;
  playerState.chunkIndex=0;
  await playerPersist();
  playerSetUI();
  if(wasPlaying)await playerSpeakCurrent();
});
$("#playerTimeline")?.addEventListener('change',async e=>{
  if(!playerState.book||!playerState.chapters.length)return;
  const wasPlaying=playerState.speaking&&!playerState.paused;
  playerCancelSpeech();
  const total=playerTotalChunks();
  let target=Math.max(0,Math.min(total,Number(e.target.value)||0));
  let chapter=playerState.chapters.length-1;
  let chunk=playerState.chapters[chapter]?.chunks.length||0;
  for(let i=0;i<playerState.chapters.length;i++){
    const count=playerState.chapters[i].chunks.length;
    if(target<=playerChapterStartChunk(i)+count){
      chapter=i;
      chunk=Math.max(0,target-playerChapterStartChunk(i));
      break;
    }
  }
  playerState.chapterIndex=chapter;
  playerState.chunkIndex=Math.min(chunk,playerState.chapters[chapter].chunks.length);
  await playerPersist();
  playerSetUI();
  if(wasPlaying&&playerState.chunkIndex<playerState.chapters[chapter].chunks.length)await playerSpeakCurrent();
});

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
