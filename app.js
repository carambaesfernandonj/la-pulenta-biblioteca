const DB_NAME = "biblioteca_lector";
const DB_VERSION = 1;
const STORE = "books";

let db;
let currentBook = null;
let currentObjectUrl = null;
let currentEpubBook = null;
let currentEpubRendition = null;

const $ = (s) => document.querySelector(s);

function showToast(message){
  const el = $("#toast");
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => el.classList.remove("show"), 2400);
}

function openDB(){
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const database = req.result;
      if(!database.objectStoreNames.contains(STORE)){
        database.createObjectStore(STORE, { keyPath:"id" });
      }
    };
    req.onsuccess = () => { db = req.result; resolve(db); };
    req.onerror = () => reject(req.error);
  });
}

function tx(mode="readonly"){
  return db.transaction(STORE, mode).objectStore(STORE);
}

function getAllBooks(){
  return new Promise((resolve, reject) => {
    const req = tx().getAll();
    req.onsuccess = () => resolve(req.result.sort((a,b) => (b.updatedAt||0)-(a.updatedAt||0)));
    req.onerror = () => reject(req.error);
  });
}

function putBook(book){
  return new Promise((resolve, reject) => {
    const req = tx("readwrite").put(book);
    req.onsuccess = resolve;
    req.onerror = () => reject(req.error);
  });
}

function makeId(){ return crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36)+Math.random().toString(36).slice(2); }

function titleFromFilename(name){
  return name.replace(/\.[^.]+$/,"").replace(/[_-]+/g," ").trim() || "Sin título";
}

function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
}

function coverFor(book){
  const type = book.type === "epub" ? "EPUB" : "PDF";
  const source = book.source === "drive" ? "DRIVE" : "DISPOSITIVO";
  const percent = Math.round((book.progress||0)*100);
  return `<div class="cover">
    <div class="type">${type} · ${source}</div>
    <div class="cover-title">${escapeHtml(book.title)}</div>
    <div class="source">${percent ? percent+"% leído" : "Sin empezar"}</div>
  </div>`;
}

function renderLibrary(allBooks){
  const query = $("#searchInput").value.trim().toLowerCase();
  const books = allBooks.filter(b => !query || b.title.toLowerCase().includes(query) || b.fileName.toLowerCase().includes(query));
  $("#stats").textContent = `${allBooks.length} libro${allBooks.length===1?"":"s"}`;
  $("#emptyState").classList.toggle("hidden", allBooks.length !== 0);
  $("#libraryGrid").innerHTML = books.map(book => `
    <button class="book" data-id="${book.id}" type="button">
      ${coverFor(book)}
      <div class="book-title">${escapeHtml(book.title)}</div>
      <div class="book-meta">${book.type.toUpperCase()} · ${Math.round((book.progress||0)*100)}%</div>
      <div class="progress"><span style="width:${Math.max(0,Math.min(100,(book.progress||0)*100))}%"></span></div>
    </button>
  `).join("");
  $("#libraryGrid").querySelectorAll(".book").forEach(btn => btn.addEventListener("click", () => openBook(btn.dataset.id, allBooks)));
  renderContinue(allBooks);
}

function renderContinue(books){
  const book = books.find(b => (b.progress||0) > 0);
  $("#continueSection").classList.toggle("hidden", !book);
  if(!book) return;
  $("#continueTitle").textContent = book.title;
  $("#continueMeta").textContent = `${Math.round(book.progress*100)}% leído · ${book.type.toUpperCase()}`;
  $("#continueCover").innerHTML = coverFor(book);
  $("#continueBtn").onclick = () => openBook(book.id, books);
}

function fileUrl(file){
  if(currentObjectUrl) URL.revokeObjectURL(currentObjectUrl);
  currentObjectUrl = URL.createObjectURL(file);
  return currentObjectUrl;
}

function closeReader(){
  if(currentEpubRendition){ try{ currentEpubRendition.destroy(); }catch(e){} }
  currentEpubRendition = null;
  currentEpubBook = null;
  if(currentObjectUrl){ URL.revokeObjectURL(currentObjectUrl); currentObjectUrl=null; }
  $("#readerBody").innerHTML = "";
  $("#reader").classList.add("hidden");
  currentBook = null;
}

async function openBook(id, books){
  const book = books.find(b => b.id === id);
  if(!book) return;
  currentBook = book;
  $("#readerTitle").textContent = book.title;
  $("#readerInfo").textContent = `${book.type.toUpperCase()} · ${book.source === "drive" ? "Google Drive" : "Dispositivo"} · ${Math.round((book.progress||0)*100)}%`;
  $("#readerBody").innerHTML = "";
  $("#reader").classList.remove("hidden");

  if(book.type === "pdf"){
    const url = fileUrl(book.file);
    const embed = document.createElement("embed");
    embed.src = url;
    embed.type = "application/pdf";
    $("#readerBody").appendChild(embed);
  } else {
    if(typeof ePub !== "function"){
      $("#readerBody").innerHTML = `<div class="epub-reader" style="padding:24px">No se pudo cargar el motor EPUB. Revisa tu conexión y vuelve a abrir la app.</div>`;
      return;
    }
    const url = fileUrl(book.file);
    const holder = document.createElement("div");
    holder.className = "epub-reader";
    holder.id = "epubArea";
    $("#readerBody").appendChild(holder);
    currentEpubBook = ePub(url);
    currentEpubRendition = currentEpubBook.renderTo(holder, {
      width:"100%", height:"100%", spread:"auto"
    });
    if(book.cfi){
      try { await currentEpubRendition.display(book.cfi); }
      catch(e){ await currentEpubRendition.display(); }
    } else {
      await currentEpubRendition.display();
    }
    currentEpubRendition.on("relocated", async location => {
      if(!currentBook) return;
      const cfi = location && location.start && location.start.cfi;
      if(cfi){
        currentBook.cfi = cfi;
        currentBook.progress = Number(location.start.percentage || 0);
        currentBook.updatedAt = Date.now();
        await putBook(currentBook);
        const booksNow = await getAllBooks();
        renderLibrary(booksNow);
      }
    });
  }
}

async function addFiles(fileList){
  const files = [...fileList].filter(file => {
    const name = file.name.toLowerCase();
    return name.endsWith(".pdf") || name.endsWith(".epub");
  });
  if(!files.length){
    showToast("Selecciona uno o más PDF o EPUB.");
    return;
  }
  for(const file of files){
    const lower = file.name.toLowerCase();
    const book = {
      id: makeId(),
      title: titleFromFilename(file.name),
      fileName: file.name,
      type: lower.endsWith(".epub") ? "epub" : "pdf",
      source: "local",
      file,
      progress: 0,
      cfi: null,
      tags: [],
      collections: [],
      favorite: false,
      updatedAt: Date.now()
    };
    await putBook(book);
  }
  const books = await getAllBooks();
  renderLibrary(books);
  showToast(`${files.length} libro${files.length===1?"":"s"} añadido${files.length===1?"":"s"} a tu biblioteca.`);
}

$("#addBtn").addEventListener("click", () => $("#fileInput").click());
$("#emptyAddBtn").addEventListener("click", () => $("#fileInput").click());
$("#fileInput").addEventListener("change", async (e) => {
  await addFiles(e.target.files);
  e.target.value = "";
});
$("#searchInput").addEventListener("input", async () => renderLibrary(await getAllBooks()));
$("#closeReaderBtn").addEventListener("click", closeReader);
$("#saveProgressBtn").addEventListener("click", async () => {
  if(!currentBook) return;
  if(currentEpubRendition){
    const loc = currentEpubRendition.currentLocation();
    const cfi = loc && loc.start && loc.start.cfi;
    if(cfi){
      currentBook.cfi = cfi;
      currentBook.updatedAt = Date.now();
      await putBook(currentBook);
    }
  }
  showToast("Posición guardada.");
});

document.addEventListener("keydown", e => {
  if(e.key === "Escape" && !$("#reader").classList.contains("hidden")) closeReader();
});

(async function init(){
  try{
    await openDB();
    renderLibrary(await getAllBooks());
  }catch(error){
    console.error(error);
    showToast("No se pudo iniciar la biblioteca en este navegador.");
  }
})();
