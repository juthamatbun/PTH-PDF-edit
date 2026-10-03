// PPDF direct content-stream writer (clean-room).
// Supports literal Tj/TJ and CID hex Tj using the PDF font's ToUnicode CMap.
// Unsupported cases are refused; no cosmetic replacement fallback is used.

const l1=b=>{let s='';for(let i=0;i<b.length;i++)s+=String.fromCharCode(b[i]);return s};
const u8=s=>{const b=new Uint8Array(s.length);for(let i=0;i<s.length;i++)b[i]=s.charCodeAt(i)&255;return b};
const esc=s=>String(s).replace(/\\/g,'\\\\').replace(/\(/g,'\\(').replace(/\)/g,'\\)');
const hex=b=>Array.from(b,x=>x.toString(16).padStart(2,'0')).join('').toUpperCase();

function cmap(bytes){
 const text=l1(bytes),c2u=new Map();
 for(const block of text.matchAll(/beginbfchar([\s\S]*?)endbfchar/g))
  for(const m of block[1].matchAll(/<([0-9a-f]+)>\s*<([0-9a-f]+)>/gi))c2u.set(parseInt(m[1],16),String.fromCodePoint(parseInt(m[2],16)));
 for(const block of text.matchAll(/beginbfrange([\s\S]*?)endbfrange/g))
  for(const m of block[1].matchAll(/<([0-9a-f]+)>\s*<([0-9a-f]+)>\s*<([0-9a-f]+)>/gi)){const a=parseInt(m[1],16),z=parseInt(m[2],16),base=parseInt(m[3],16);for(let x=a;x<=z;x++)c2u.set(x,String.fromCodePoint(base+x-a))}
 return {c2u,u2c:new Map([...c2u].map(([k,v])=>[v,k]))};
}
function decodeCid(h,map){let out='';for(let i=0;i+3<h.length;i+=4)out+=map.c2u.get(parseInt(h.slice(i,i+4),16))||'';return out}
function encodeCid(text,map){const out=[];for(const ch of text){const c=map.u2c.get(ch);if(c==null)return null;out.push((c>>8)&255,c&255)}return new Uint8Array(out)}
function fontMaps(page,PDFLib){
 const {PDFName,PDFDict,PDFRawStream,decodePDFRawStream}=PDFLib,out=new Map();
 try{const res=page.node.Resources(),fonts=res?.lookup(PDFName.of('Font'),PDFDict);if(!fonts)return out;
  for(const key of fonts.keys()){const fd=fonts.lookup(key,PDFDict),tu=fd?.lookup(PDFName.of('ToUnicode'));if(tu instanceof PDFRawStream)out.set(key.decodeText().replace(/^\//,''),cmap(decodePDFRawStream(tu).decode()))}
 }catch(_){} return out;
}
function refs(page,PDFLib){const {PDFArray,PDFRawStream}=PDFLib,raw=page.node.Contents?.();if(!raw)return[];const a=raw instanceof PDFArray?raw.asArray():[raw];return a.map(x=>({ref:x,stream:page.doc.context.lookup(x)})).filter(x=>x.stream instanceof PDFRawStream)}
function literal(src,oldText,newText){const a=esc(oldText),b=esc(newText);let done=false;const text=src.replace(/\((?:\\.|[^\\)])*\)(?=\s*Tj)/gs,t=>{if(done||!t.includes(a))return t;done=true;return t.replace(a,b)});return{text,done}}
function cid(src,oldText,newText,maps){
 let current=null,done=false,out='',last=0;
 const token=/(\/[^\s]+)\s+[+-]?(?:\d+\.?\d*|\.\d+)\s+Tf|<([0-9A-Fa-f]+)>\s*Tj/g; let m;
 while((m=token.exec(src))){out+=src.slice(last,m.index);if(m[1]){current=m[1].slice(1);out+=m[0]}else if(!done&&current&&maps.has(current)){const map=maps.get(current),decoded=decodeCid(m[2],map);if(decoded.includes(oldText)){const changed=decoded.replace(oldText,newText),enc=encodeCid(changed,map);if(enc){out+='<'+hex(enc)+'> Tj';done=true}else out+=m[0]}else out+=m[0]}else out+=m[0];last=token.lastIndex}
 out+=src.slice(last);return{text:out,done};
}
export function rewritePageLiteralEdits(doc,pageIndex,edits){
 const page=doc.getPage(pageIndex),streams=refs(page,PDFLib),maps=fontMaps(page,PDFLib),pending=edits.map(e=>({...e,done:false}));
 if(!streams.length)return{ok:false,reason:'No editable page content stream',failed:pending};
 for(const entry of streams){let src;try{src=l1(PDFLib.decodePDFRawStream(entry.stream).decode())}catch(_){continue}let next=src,touched=false;
  for(const e of pending.filter(x=>!x.done)){let r=literal(next,e.oldText,e.newText||'');if(!r.done)r=cid(next,e.oldText,e.newText||'',maps);if(r.done){next=r.text;e.done=true;touched=true}}
  if(touched)doc.context.assign(entry.ref,doc.context.flateStream(u8(next)));
 }
 const failed=pending.filter(x=>!x.done);return{ok:failed.length===0,changed:pending.length-failed.length,failed,reason:failed.length?'Unsupported encoding, fragmented text, missing glyph, or nested Form XObject':'ok'};
}
