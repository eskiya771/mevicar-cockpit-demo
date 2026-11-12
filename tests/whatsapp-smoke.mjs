/* MeviCar Next WhatsApp companion contract and privacy checks.
   No account login, no external network and no personal contact data. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const src=readFileSync(new URL('../whatsapp.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../whatsapp.css',import.meta.url),'utf8');
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const pages=readFileSync(new URL('../.github/workflows/pages.yml',import.meta.url),'utf8');
new Function(src);
function fixture(saved=[]){
 const writes=[],urls=[],clipboard=[],el=new Map();
 const localStorage={getItem:k=>k==='mevicar-next-whatsapp-contacts-v1'?JSON.stringify(saved):null,
  setItem:(k,v)=>writes.push({key:k,value:v})};
 const navigator={clipboard:{writeText:async x=>{clipboard.push(x)}}};
 const document={getElementById:id=>el.get(id)||null,querySelector:()=>null};
 const window={open:(url,target,flags)=>{urls.push({url,target,flags});return{}},
   speechSynthesis:{cancel(){},speak(){}},SpeechSynthesisUtterance:class{constructor(x){this.text=x}}};
 runInNewContext(src,{window,document,localStorage,navigator,Intl,Date,Math,Number,JSON,console});
 return{api:window.MeviWhatsApp,writes,urls,clipboard,el};
}
{
 const {api}=fixture();
 assert.equal(api.phoneDigits('+49 (170) 1234567'),'491701234567');
 assert.equal(api.phoneDigits('0170 1234567'),'491701234567');
 assert.equal(api.phoneDigits('0049-170-1234567'),'491701234567');
 assert.equal(api.phoneDigits('491701234567'),'491701234567');
 for(const x of ['','123','+00 0','tel:+491701234567','javascript:alert(1)','https://evil.example','170–12345'])
  assert.equal(api.phoneDigits(x),null,'Reject malformed number '+x);
 assert.equal(api.whatsappUrl('+49 170 1234567','Hallo & später'),
  'https://wa.me/491701234567?text=Hallo%20%26%20sp%C3%A4ter');
 assert.equal(api.shareUrl('A&B'),'https://wa.me/?text=A%26B');
 assert.throws(()=>api.whatsappUrl('javascript:foo','X'));
 assert.match(api.html(false),/WEB-VERKNÜPFUNG/);
 assert.match(api.html(false),/keine WhatsApp-Nachrichten auslesen/);
 assert.match(api.html(false),/Nachricht vorbereiten/i);
 assert.match(api.html(true),/mevi-wa-shell compact/);
 assert.equal(api.debug().inboxAvailable,false);
 assert.equal(api.debug().notificationBridge,false);
}
{
 const f=fixture(),{api,writes,urls,clipboard,el}=f;
 api.newContact();
 el.set('mevi-wa-name',{value:'Testkontakt <script>alert(1)</script>'});
 el.set('mevi-wa-phone',{value:'+49 151 45678901'});
 api.saveContact();
 assert.equal(api.debug().contacts,1);
 const page=api.html(false);
 assert.match(page,/Testkontakt &lt;script&gt;alert\(1\)&lt;\/script&gt;/);
 assert.doesNotMatch(page,/<script>alert\(1\)<\/script>/);
 assert.equal(JSON.parse(writes.at(-1).value).length,1);
 assert.equal(writes.at(-1).key,'mevicar-next-whatsapp-contacts-v1');
 api.template(1);
 assert.equal(api.openChat(),true,'Official direct chat should launch');
 assert.equal(urls.length,1);
 assert.equal(urls[0].target,'_blank');
 assert.equal(new URL(urls[0].url).origin,'https://wa.me');
 assert.equal(new URL(urls[0].url).searchParams.get('text'),'Ich komme etwas später.');
 assert.equal(urls[0].flags,'noopener,noreferrer');
 await api.copyLink();
 assert.equal(clipboard.length,1);
 assert.equal(clipboard[0],urls[0].url);
 api.favorite(JSON.parse(writes.at(-1).value)[0].id);
 assert.equal(JSON.parse(writes.at(-1).value)[0].favorite,true);
 api.editContact();
 el.set('mevi-wa-name',{value:'Geänderter Name'});
 el.set('mevi-wa-phone',{value:'0170 1234567'});
 api.saveContact();
 assert.match(api.html(false),/Geänderter Name/);
 api.editContact();api.removeContact();
 assert.equal(api.debug().contacts,0);
 assert.equal(api.openChat(),false,'Opening WhatsApp without a number is blocked');
 api.openWeb();
 assert.equal(urls.at(-1).url,'https://web.whatsapp.com/');
}
{
 const f=fixture(),{api,writes,urls}=f;
 const vcf='BEGIN:VCARD\r\nVERSION:3.0\r\nFN:Familie Muster\r\nTEL;TYPE=CELL:+49 170 2222222\r\nEND:VCARD\r\n'+
   'BEGIN:VCARD\r\nVERSION:3.0\r\nN:Test;Beispiel;;;\r\nTEL:0151-5555555\r\nEND:VCARD\r\n';
 const contacts=api.parseVCF(vcf);
 assert.equal(contacts.length,2);
 assert.equal(contacts[0].phone,'491702222222');
 assert.equal(contacts[1].phone,'491515555555');
 await api.importFile({name:'kontakte.vcf',size:vcf.length,text:async()=>vcf});
 assert.equal(api.debug().contacts,2);
 await api.importFile({name:'kontakte.vcf',size:vcf.length,text:async()=>vcf});
 assert.equal(api.debug().contacts,2,'Reimport must deduplicate by full international number');
 assert.ok(writes.every(x=>x.key==='mevicar-next-whatsapp-contacts-v1'));
 assert.ok(!writes.some(x=>/auth|token|message|history/i.test(x.key)),'No WhatsApp credential or conversation cache');
 assert.equal(urls.length,0,'Import cannot contact WhatsApp without explicit user action');
}
{
 const f=fixture(),{api,el,urls}=f;
 el.set('mevi-wa-direct',{value:'+49 151 9999999'});
 api.template(0);
 assert.equal(api.openChat(),true,'Direct chat without stored contact works');
 assert.ok(urls[0].url.startsWith('https://wa.me/491519999999'));
 api.shareText();
 assert.ok(urls.at(-1).url.startsWith('https://wa.me/?text='));
}
assert.match(css,/\.mevi-wa-shell/);
assert.match(css,/\.mevi-wa-shell\.compact/);
assert.match(css,/\.mevi-wa-contacts/);
assert.match(html,/whatsapp\.js/);
assert.match(html,/whatsapp\.css/);
assert.match(html,/if\(s\.app==='whatsapp'\)return window\.MeviWhatsApp/);
assert.match(html,/class="full whatsapp-host"/);
assert.match(pages,/mevicar-whatsapp-script/,'Build must ship versioned WhatsApp module');
assert.match(pages,/whatsapp\.js whatsapp\.css/);
console.log('WhatsApp companion passed: official wa.me handoff, international numbers, contact CRUD, VCF, escaping, privacy and full/split hooks.');
