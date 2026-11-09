'use strict';
// Signed, encrypted, same-origin HLS resource URLs; no provider credentials in browser URLs.
const crypto=require('node:crypto');
const MAX_MANIFEST=2*1024*1024;
function createRelay(secret,upstreamOrigin){
 const key=crypto.createHash('sha256').update(secret).digest();
 const origin=new URL(upstreamOrigin).origin;
 function check(input,base){
  const url=new URL(input,base);
  if(!['http:','https:'].includes(url.protocol)||url.origin!==origin||url.username||url.password||url.hash)throw Error('HLS resource outside configured upstream origin');
  return url;
 }
 function seal(input){
  const url=check(input,origin);
  const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',key,iv);
  const data=Buffer.from(JSON.stringify({u:url.href,e:Date.now()+4*3600*1000}));
  const payload=Buffer.concat([cipher.update(data),cipher.final()]);
  return Buffer.concat([iv,cipher.getAuthTag(),payload]).toString('base64url');
 }
 function open(token){
  if(typeof token!=='string'||token.length>8192||!/^[a-zA-Z0-9_-]+$/.test(token))throw Error('Invalid HLS ticket');
  const bytes=Buffer.from(token,'base64url');if(bytes.length<29)throw Error('Invalid HLS ticket');
  const decipher=crypto.createDecipheriv('aes-256-gcm',key,bytes.subarray(0,12));
  decipher.setAuthTag(bytes.subarray(12,28));
  const payload=JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)),decipher.final()]).toString('utf8'));
  if(!Number.isSafeInteger(payload.e)||payload.e<Date.now()||payload.e>Date.now()+4*3600*1000)throw Error('Expired HLS ticket');
  return check(payload.u,origin);
 }
 function resourceURL(value,manifest,bridgeOrigin){
  const target=check(value,manifest);
  return bridgeOrigin+'/hls/'+seal(target);
 }
 function rewrite(content,manifest,bridgeOrigin){
  if(Buffer.byteLength(content,'utf8')>MAX_MANIFEST)throw Error('HLS manifest too large');
  if(!content.trimStart().startsWith('#EXTM3U'))throw Error('Invalid HLS manifest');
  const transformed=[];
  for(const line of content.split(/\r?\n/)){
   if(!line.trim()){transformed.push(line);continue;}
   if(line.trimStart().startsWith('#')){
    // URI= attributes include alternative audio, encryption keys and initialization maps.
    transformed.push(line.replace(/URI="([^"]+)"/gi,(_,value)=>'URI="'+resourceURL(value,manifest,bridgeOrigin)+'"'));
   }else{
    transformed.push(resourceURL(line.trim(),manifest,bridgeOrigin));
   }
  }
  return transformed.join('\n');
 }
 return {seal,open,rewrite,check};
}
module.exports={createRelay,MAX_MANIFEST};
