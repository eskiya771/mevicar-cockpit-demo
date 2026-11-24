/* Native address-book adapter, Stage 1: one Android DestinationStore, zero copied data.
   This does not replace Fable's native Places UI until its separate provider is ready.
   Web/PWA never loads this capability; no localStorage or API keys are touched. */
(function(root){
'use strict';
if(!root.MeviNativeBridge?.postMessage)return;
const nativeRequest=(action,fields)=>root.MeviGoogleNav?.nativeRequest?.(action,fields);
let packet=null, connecting=null, queue=Promise.resolve();
const copy=value=>JSON.parse(JSON.stringify(value));
function absorb(reply){
 if(!/^[0-9a-f]{64}$/.test(reply?.revision||'')||
    reply?.book?.version!==2||
    !Array.isArray(reply.book.saved)||reply.book.saved.length>200||
    !Array.isArray(reply.book.recent)||reply.book.recent.length>30){
  throw new Error('Android-Adressbuch hat ein ungültiges Datenformat.');
 }
 packet={revision:reply.revision,book:copy(reply.book)};
 return view();
}
function view(){
 if(!packet)throw new Error('Android-Adressbuch ist noch nicht geladen.');
 const book=packet.book;
 const slots={home:null,work:null},favorites=[];
 for(const entry of book.saved){
  if(entry.slot==='home'||entry.slot==='work')slots[entry.slot]=copy(entry);
  else favorites.push(copy(entry));
 }
 return {favorites,recent:copy(book.recent),slots,suggestions:[],query:'',origin:null,error:''};
}
async function refresh(){
 if(typeof nativeRequest!=='function'||!root.MeviGoogleNav?.nativeRequest)
  throw new Error('Android-Bridge nicht verfügbar.');
 return absorb(await nativeRequest('navigation.book.read'));
}
async function connect(){
 if(packet)return view();
 if(connecting)return connecting;
 connecting=(async()=>{
  const info=await nativeRequest('capabilities');
  if(!info?.capabilities?.navigationBookBridge)
   throw new Error('Diese Android-APK unterstützt das gemeinsame Adressbuch noch nicht.');
  return refresh();
 })();
 try{return await connecting}finally{connecting=null}
}
function mutate(operation,fields={}){
 const run=queue.then(async()=>{
  if(!packet)await connect();
  const revision=packet.revision;
  try{
   return absorb(await nativeRequest('navigation.book.apply',{revision,operation,...fields}));
  }catch(error){
   // Failed/conflicting edits must not leave the JS display holding stale state.
   try{await refresh()}catch{}
   throw error;
  }
 });
 queue=run.catch(()=>{});
 return run;
}
function validatedId(id){
 if(typeof id!=='string'||!/^[A-Za-z0-9-]{1,64}$/.test(id))
  throw new Error('Ungültige Ziel-ID.');
 return id;
}
function save(entry){
 if(!entry||typeof entry!=='object'||Array.isArray(entry))
  return Promise.reject(new Error('Ziel fehlt.'));
 return mutate('save',{entry:copy(entry)});
}
function remove(id){return mutate('remove',{entryId:validatedId(id)})}
function move(id,delta){
 if(delta!==-1&&delta!==1)return Promise.reject(new Error('Ungültige Verschiebung.'));
 return mutate('move',{entryId:validatedId(id),delta});
}
function removeRecent(key){
 if(typeof key!=='string'||key.length>310||!(key.startsWith('p:')||key.startsWith('c:')))
  return Promise.reject(new Error('Ungültiger Verlaufseintrag.'));
 return mutate('removeRecent',{key});
}
function clearRecent(){return mutate('clearRecent')}
function exportBook(){
 if(!packet)throw new Error('Android-Adressbuch ist noch nicht geladen.');
 return copy(packet.book);
}
root.MeviNativeBook=Object.freeze({
 connect,refresh,view,save,remove,move,removeRecent,clearRecent,exportBook,
 isReady:()=>!!packet
});
})(window);
