// PPDF direct content-stream writer (clean-room).
// Supports byte-preserving edits for simple literal-string Tj/TJ content.
// It refuses unsupported/CID cases instead of silently drawing an overlay.

const latin1 = bytes => { let s=''; for(let i=0;i<bytes.length;i++) s+=String.fromCharCode(bytes[i]); return s; };
const bytes = s => { const out=new Uint8Array(s.length); for(let i=0;i<s.length;i++) out[i]=s.charCodeAt(i)&255; return out; };
const esc = s => String(s).replace(/\\/g,'\\\\').replace(/\(/g,'\\(').replace(/\)/g,'\\)').replace(/\r/g,'\\r').replace(/\n/g,'\\n');

function replaceLiteralInOperators(src, oldText, newText){
 const oldEsc=esc(oldText), newEsc=esc(newText);
 let changed=false;
 const out=src.replace(/\((?:\\.|[^\\)])*\)(?=\s*Tj)|\[(?:[^\]]|\][^T])*\](?=\s*TJ)/gs, token=>{
   if(changed || !token.includes(oldEsc)) return token;
   changed=true; return token.replace(oldEsc,newEsc);
 });
 return {text:out,changed};
}
function deleteLiteralInOperators(src, oldText){ return replaceLiteralInOperators(src,oldText,''); }

function contentRefs(page, PDFLib){
 const {PDFArray,PDFRawStream}=PDFLib, raw=page.node.Contents?.();
 if(!raw)return[];
 const arr=raw instanceof PDFArray ? raw.asArray() : [raw];
 return arr.map(x=>page.doc.context.lookup(x)).filter(x=>x instanceof PDFRawStream);
}

export function directCapabilities(){return {literalTjTJ:true,cidToUnicode:false,reflow:false};}

export function rewritePageLiteralEdits(doc,pageIndex,edits){
 const page=doc.getPage(pageIndex), {decodePDFRawStream}=PDFLib;
 const streams=contentRefs(page,PDFLib); if(!streams.length)return {ok:false,reason:'No editable page content stream'};
 const pending=edits.map(e=>({...e,done:false}));
 for(const stream of streams){
   let src;
   try{src=latin1(decodePDFRawStream(stream).decode())}catch(e){continue}
   let next=src, touched=false;
   for(const e of pending.filter(x=>!x.done)){
     const r=e.type==='replace' ? replaceLiteralInOperators(next,e.oldText,e.newText) : deleteLiteralInOperators(next,e.oldText);
     if(r.changed){next=r.text;e.done=true;touched=true}
   }
   if(touched){
     const replacement=doc.context.flateStream(bytes(next));
     const refs=page.node.normalizedEntries().Contents.asArray();
     const idx=streams.indexOf(stream); if(refs[idx]) doc.context.assign(refs[idx],replacement);
   }
 }
 const failed=pending.filter(x=>!x.done);
 return {ok:failed.length===0,changed:pending.length-failed.length,failed,reason:failed.length?'Text uses unsupported encoding, fragmentation, or nested content':'ok'};
}
