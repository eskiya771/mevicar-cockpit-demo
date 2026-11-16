/* Verify the separate preview is functional, isolated and serves actual
   development-branch UI assets (no Maps key or native APK required). */
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {Script,runInNewContext} from 'node:vm';

const folder=process.argv[2]||'preview';
const read=name=>readFileSync(join(folder,name),'utf8');
const template=read('index.html');
const adapter=read('preview-adapter.js'),css=read('preview.css');
for(const name of ['navigation-shared-core.js','nav-web-parity.js','nav-web-parity.css']){
 assert(template.includes('./'+name),'Preview must reference '+name);
}
assert(template.includes('TESTVORSCHAU'),'Must visibly identify non-production version');
assert(!template.includes('./sw.js'),'Preview may not register production SW');
assert(!adapter.includes('mevicar-next-destinations-v1'),'Preview must not touch stable favorites');
assert(!adapter.includes('mevicar-next-google-maps-key-v1'),'Preview must not touch stable Maps key');
assert(adapter.includes("mevicar-nav-preview-book-v1"),'Test storage must have its own key');
assert(!adapter.includes('MeviNativeBridge'),'Preview cannot invoke Android bridge');
assert(css.includes('#previewFlag'),'Test preview status must remain visible');
const stableSW=readFileSync('sw.js','utf8');
assert(stableSW.includes("u.pathname.includes('/nav-preview/')"),
 'Stable service worker must never cache preview HTML as stable index');

const files=['preview-adapter.js','navigation-shared-core.js','nav-web-parity.js'];
for(const f of files)if(existsSync(join(folder,f)))new Script(read(f),{filename:f});
if(!existsSync(join(folder,'navigation-shared-core.js'))){
 console.log('Preview shell validated; development UI assets will be copied in Pages build.');
 process.exit(0);
}
assert(!template.includes('__PREVIEW_COMMIT__'),'Deployed preview must expose feature SHA');
const store=new Map(),root={innerHTML:''};
const fakeStorage={
 getItem:key=>store.get(key)||null,
 setItem:(key,value)=>store.set(key,String(value)),
 removeItem:key=>store.delete(key)
};
const W={
 localStorage:fakeStorage,confirm:()=>true,
 addEventListener(){},setTimeout,clearTimeout,
};
const doc={
 getElementById:id=>id==='previewRoot'?root:null,
 querySelector:()=>null,
 createElement:()=>({}),
};
const state={app:'nav',mode:'map',nav:'browse',query:'',keyboard:false};
const ctx={window:W,document:doc,s:state,navigator:{},console,setTimeout,clearTimeout,Intl,Blob,URL};
runInNewContext(read('navigation-shared-core.js'),ctx);
runInNewContext(adapter,ctx);
runInNewContext(read('nav-web-parity.js'),ctx);
assert(root.innerHTML.includes('Gemeinsame Navigation'),'Launcher renders');
assert(root.innerHTML.includes('Beispieldaten'),'User can distinguish demo data from Google Places');
assert(root.innerHTML.includes('Adressbuch'),'Launcher links to book');
W.MeviWebNavParity.open();
let view=W.searchOverlay();
for(const term of ['Adresse, Ort oder POI','Zuletzt','Gespeichert','Tanken','Rastplatz','Werkstatt'])assert(view.includes(term),term);
W.MeviWebNavParity.book();
view=W.searchOverlay();
assert(view.includes('Café am Markt'),'Demo favorites must be displayed');
W.MeviWebNavParity.edit('favorites',0);
view=W.searchOverlay();
assert(view.includes('Ziel bearbeiten'),'Editor must be functional');
W.MeviWebNavParity.editField('name','Café bearbeitet');
W.MeviWebNavParity.editField('note','Testnotiz');
W.MeviWebNavParity.saveEdit();
assert(W.MeviSharedNavigationProvider.read().favorites[0].name==='Café bearbeitet');
assert(W.MeviSharedNavigationProvider.read().favorites[0].note==='Testnotiz');
assert([...store.keys()].every(key=>key==='mevicar-nav-preview-book-v1'),'No stable browser keys changed');
W.MeviWebNavParity.bookBack();
W.MeviWebNavParity.input('Er');
view=W.searchOverlay();
assert(view.includes('Erlangen Arcaden'),'Demo autocomplete must be usable offline');
await W.MeviWebNavParity.choose('suggest',0);
assert(root.innerHTML.includes('Ziel ausgewählt'),'Selection should show explicit no-route result');
assert(W.MeviSharedNavigationProvider.read().recent[0].name==='Erlangen Arcaden');
console.log('Navigation preview: production storage isolated, shared UI works, edits, search and selection passed.');
