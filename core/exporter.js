import { rewritePageLiteralEdits } from './direct-stream-writer.js';

export async function exportPPDF(sourceBytes,objects){
 const {PDFDocument,rgb}=PDFLib,doc=await PDFDocument.load(sourceBytes.slice(0));
 const grouped=new Map();
 for(const o of objects.filter(x=>x.directEdit)){
  if(!grouped.has(o.page))grouped.set(o.page,[]);
  grouped.get(o.page).push({type:o.type==='replace'?'replace':'delete',oldText:o.directEdit.oldText,newText:o.directEdit.newText||''});
 }
 const failed=[];
 for(const [page,edits] of grouped){const r=rewritePageLiteralEdits(doc,page-1,edits);if(!r.ok)failed.push({page,...r})}
 if(failed.length)return {ok:false,failed};
 const color=v=>{if(v?.startsWith('#')){const q=v.slice(1);return rgb(parseInt(q.slice(0,2),16)/255,parseInt(q.slice(2,4),16)/255,parseInt(q.slice(4,6),16)/255)}const m=(v||'0,0,0').match(/\d+/g)||[0,0,0];return rgb(+m[0]/255,+m[1]/255,+m[2]/255)};
 for(const o of objects){
  const p=doc.getPage(o.page-1),{width,height}=p.getSize(),x=o.x*width,h=o.h*height,w=o.w*width,y=height-o.y*height-h;
  if(o.type==='redact')p.drawRectangle({x,y,width:w,height:h,color:color(o.fill||'#111111')});
  if(o.type==='erase'&&!o.directEdit)p.drawRectangle({x,y,width:w,height:h,color:color(o.bg||'#ffffff')});
  if(o.type==='sign'){const im=await doc.embedPng(o.data);p.drawImage(im,{x,y,width:w,height:h})}
 }
 return {ok:true,bytes:await doc.save()};
}
