import * as pdfjsLib from 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs';
import { PPDFDocumentModel } from './core/document-model.js';
import { parseTextItems, parseOperatorList, linkRunsToOperators } from './core/content-parser.js';
import { replacementMetrics } from './core/layout-engine.js';
import { exportPPDF } from './core/exporter.js';
pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs';
const $=s=>document.querySelector(s), pagesEl=$('#pages'), thumbs=$('#thumbs'), file=$('#file');
let pdf=null,bytes=null,zoom=1,tool='select',objects=[],history=[],selected=null,signature=null,pageModels={};
let contentModel=new PPDFDocumentModel();
const uid=()=>crypto.randomUUID?.()||Math.random().toString(36).slice(2);
const snapshot=()=>{history.push(JSON.stringify(objects));if(history.length>40)history.shift()};
const bgSample=(canvas,b)=>{
 const ctx=canvas.getContext('2d'),p=Math.max(3,Math.min(10,b.h*.3)),pts=[[b.x-p,b.y+b.h/2],[b.x+b.w+p,b.y+b.h/2],[b.x+b.w/2,b.y-p],[b.x+b.w/2,b.y+b.h+p]];
 const cs=pts.map(([x,y])=>{x=Math.max(0,Math.min(canvas.width-1,Math.round(x)));y=Math.max(0,Math.min(canvas.height-1,Math.round(y)));return [...ctx.getImageData(x,y,1,1).data].slice(0,3)});
 const m=[0,1,2].map(k=>Math.round(cs.reduce((a,c)=>a+c[k],0)/cs.length));return `rgb(${m.join(',')})`;
};
function boxFor(it,vp){const t=pdfjsLib.Util.transform(vp.transform,it.transform),h=Math.max(7,Math.hypot(t[2],t[3]));return{x:t[4],y:t[5]-h*.88,w:Math.max(4,it.width*vp.scale),h:h*1.08,font:h}}
function runForItem(page,item){const runs=pageModels[page]?.runs||[];return runs.find(r=>r.sourceIndex===pageModels[page].items.indexOf(item))||runs.find(r=>r.text===item.str)||null}
function splitWords(item,vp){
 const full=item.str||'', base=boxFor(item,vp), parts=[...full.matchAll(/\S+/g)]; if(!parts.length)return[];
 return parts.map(m=>{const before=full.slice(0,m.index),ratioStart=before.length/Math.max(1,full.length),ratioW=m[0].length/Math.max(1,full.length);return{...base,x:base.x+base.w*ratioStart,w:Math.max(5,base.w*ratioW),text:m[0],item}});
}
function setSelected(o){selected=o;$('#objectBar').classList.toggle('hidden',!o);if(o){$('#fontSize').value=Math.round(o.size||16);if((o.textColor||'').startsWith('#'))$('#textColor').value=o.textColor}}
file.onchange=async()=>{if(!file.files?.[0])return;try{
 bytes=await file.files[0].arrayBuffer();pdf=await pdfjsLib.getDocument({data:bytes.slice(0)}).promise;objects=[];history=[];pageModels={};contentModel=new PPDFDocumentModel();setSelected(null);
 for(let n=1;n<=pdf.numPages;n++){const p=await pdf.getPage(n),tc=await p.getTextContent({disableCombineTextItems:false});let runs=parseTextItems(tc.items);const opList=await p.getOperatorList();const operators=parseOperatorList(opList,pdfjsLib.OPS);runs=linkRunsToOperators(runs,operators);contentModel.setPage(n,{number:n,runs,operators});pageModels[n]={items:tc.items.filter(x=>x.str?.trim()),runs,operators}}
 $('#welcome').style.display='none';$('#downloadBtn').disabled=false;await render();
}catch(e){alert('Could not open this PDF: '+e.message)}};
async function render(){
 pagesEl.innerHTML='';thumbs.innerHTML='';
 for(let n=1;n<=pdf.numPages;n++){
  const p=await pdf.getPage(n),vp=p.getViewport({scale:1.35*zoom}),wrap=document.createElement('div');wrap.className='page';wrap.dataset.page=n;Object.assign(wrap.style,{width:vp.width+'px',height:vp.height+'px'});
  const canvas=document.createElement('canvas');canvas.width=Math.ceil(vp.width);canvas.height=Math.ceil(vp.height);wrap.append(canvas);
  const ov=document.createElement('div');ov.className='overlay';wrap.append(ov);pagesEl.append(wrap);await p.render({canvasContext:canvas.getContext('2d'),viewport:vp}).promise;
  buildWordLayer(ov,n,vp,canvas);drawObjects(ov,n,vp);bindFreeArea(ov,n,vp,canvas);
  const tv=p.getViewport({scale:.2}),tc=document.createElement('canvas');tc.width=tv.width;tc.height=tv.height;await p.render({canvasContext:tc.getContext('2d'),viewport:tv}).promise;
  const th=document.createElement('div');th.className='thumb';th.append(tc);th.insertAdjacentHTML('beforeend',`<div>Page ${n}</div>`);th.onclick=()=>wrap.scrollIntoView({behavior:'smooth'});thumbs.append(th);
 }
}
function buildWordLayer(ov,page,vp,canvas){
 if(!['select','text','erase','redact'].includes(tool))return;
 for(const it of pageModels[page].items)for(const b of splitWords(it,vp)){
  const hit=document.createElement('div');hit.className='word-hit';hit.dataset.word=b.text;Object.assign(hit.style,{left:b.x+'px',top:b.y+'px',width:b.w+'px',height:b.h+'px'});
  hit.onpointerdown=e=>{e.preventDefault();e.stopPropagation();if(tool==='select')return;
   snapshot();const bg=bgSample(canvas,b),base={id:uid(),page,x:b.x/vp.width,y:b.y/vp.height,w:b.w/vp.width,h:b.h/vp.height,bg,source:b.text};
   if(tool==='text'){const v=prompt('Edit text',b.text);if(v===null){history.pop();return}const run=runForItem(page,b.item);if(run){const metrics=replacementMetrics(run,v);contentModel.replaceText({page,runId:run.id,sourceIndex:run.sourceIndex},v);base.contentRef={page,runId:run.id,sourceIndex:run.sourceIndex};base.metrics=metrics;base.directEdit={oldText:b.text,newText:v}}objects.push({...base,type:'replace',text:v,size:Math.max(8,b.font/(1.35*zoom)),textColor:'#111111'})}
   if(tool==='erase'){const run=runForItem(page,b.item);if(run){contentModel.deleteText({page,runId:run.id,sourceIndex:run.sourceIndex});base.contentRef={page,runId:run.id,sourceIndex:run.sourceIndex};base.directEdit={oldText:b.text,newText:''}}objects.push({...base,type:'erase'});}
   if(tool==='redact'){const run=runForItem(page,b.item);if(run){contentModel.deleteText({page,runId:run.id,sourceIndex:run.sourceIndex});base.contentRef={page,runId:run.id,sourceIndex:run.sourceIndex};base.directEdit={oldText:b.text,newText:''}}objects.push({...base,type:'redact',fill:bg});}
   render();
  };ov.append(hit);
 }
}
function bindFreeArea(ov,page,vp,canvas){
 let start=null,temp=null;
 ov.onpointerdown=e=>{if(e.target!==ov)return;
  if(tool==='select'){setSelected(null);render();return}
  const r=ov.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top;
  if(tool==='sign'){openSign(()=>{snapshot();objects.push({id:uid(),type:'sign',page,x:x/vp.width,y:y/vp.height,w:.22,h:.07,data:signature});render()});return}
  if(!['redact','erase'].includes(tool))return;snapshot();start={x,y};temp={id:uid(),type:tool,page,x:x/vp.width,y:y/vp.height,w:0,h:0,bg:'rgb(255,255,255)',fill:'#111111'};objects.push(temp);ov.setPointerCapture(e.pointerId);
 };
 ov.onpointermove=e=>{if(!temp)return;const r=ov.getBoundingClientRect();temp.w=(e.clientX-r.left-start.x)/vp.width;temp.h=(e.clientY-r.top-start.y)/vp.height};
 ov.onpointerup=()=>{if(!temp)return;if(temp.w<0){temp.x+=temp.w;temp.w=-temp.w}if(temp.h<0){temp.y+=temp.h;temp.h=-temp.h}const b={x:temp.x*vp.width,y:temp.y*vp.height,w:temp.w*vp.width,h:temp.h*vp.height};temp.bg=bgSample(canvas,b);if(temp.type==='erase')temp.fill=temp.bg;if(temp.w<.004||temp.h<.004)objects.pop();temp=null;render()};
}
function drawObjects(ov,page,vp){
 for(const o of objects.filter(x=>x.page===page)){
  const el=document.createElement(o.type==='sign'?'img':'div');el.className='obj '+o.type+(selected?.id===o.id?' selected':'');let x=o.x*vp.width,y=o.y*vp.height,w=Math.max(4,Math.abs(o.w)*vp.width),h=Math.max(4,Math.abs(o.h)*vp.height);
  Object.assign(el.style,{left:x+'px',top:y+'px',width:w+'px',height:h+'px',zIndex:10});
  if(o.type==='replace'){el.textContent=o.text;Object.assign(el.style,{background:o.bg,fontSize:(o.size*1.35*zoom)+'px',color:o.textColor||'#111',whiteSpace:'nowrap',display:'flex',alignItems:'center',overflow:'visible',padding:'0 1px'})}
  if(o.type==='erase')el.style.background=o.bg;if(o.type==='redact')el.style.background=o.fill||'#111';if(o.type==='sign')el.src=o.data;
  let drag=null;el.onpointerdown=e=>{if(tool!=='select')return;e.preventDefault();e.stopPropagation();setSelected(o);drag={x:e.clientX,y:e.clientY,ox:o.x,oy:o.y};el.setPointerCapture(e.pointerId);el.classList.add('selected')};
  el.onpointermove=e=>{if(!drag)return;const r=ov.getBoundingClientRect();o.x=Math.max(0,Math.min(1-o.w,drag.ox+(e.clientX-drag.x)/r.width));o.y=Math.max(0,Math.min(1-o.h,drag.oy+(e.clientY-drag.y)/r.height));el.style.left=o.x*vp.width+'px';el.style.top=o.y*vp.height+'px'};
  el.onpointerup=()=>{if(drag){snapshot();drag=null}};
  el.ondblclick=()=>{if(o.type==='replace'){const v=prompt('Edit text',o.text);if(v!==null){snapshot();o.text=v;render()}}};ov.append(el);
 }
}
document.querySelectorAll('[data-tool]').forEach(b=>b.onclick=()=>{document.querySelectorAll('[data-tool]').forEach(x=>x.classList.remove('active'));b.classList.add('active');tool=b.dataset.tool;setSelected(null);if(pdf)render()});
$('#undoBtn').onclick=()=>{if(history.length){objects=JSON.parse(history.pop());setSelected(null);render()}};
$('#zoomIn').onclick=()=>{zoom=Math.min(2,zoom+.15);$('#zoomLabel').textContent=Math.round(zoom*100)+'%';render()};$('#zoomOut').onclick=()=>{zoom=Math.max(.55,zoom-.15);$('#zoomLabel').textContent=Math.round(zoom*100)+'%';render()};
$('#fontSize').onchange=e=>{if(selected?.type==='replace'){snapshot();selected.size=Math.max(8,Math.min(72,+e.target.value||16));render()}};
$('#textColor').oninput=e=>{if(selected?.type==='replace'){selected.textColor=e.target.value;render()}else if(selected?.type==='redact'){selected.fill=e.target.value;render()}};
$('#deleteSelected').onclick=()=>{if(selected){snapshot();if(selected.contentRef)contentModel.removeEdit(selected.contentRef);objects=objects.filter(x=>x.id!==selected.id);setSelected(null);render()}};
function openSign(done){const m=$('#signModal'),c=$('#signPad'),ctx=c.getContext('2d');m.classList.remove('hidden');ctx.clearRect(0,0,c.width,c.height);let d=false;const pos=e=>{const r=c.getBoundingClientRect();return[(e.clientX-r.left)*c.width/r.width,(e.clientY-r.top)*c.height/r.height]};c.onpointerdown=e=>{d=true;ctx.beginPath();ctx.moveTo(...pos(e));c.setPointerCapture(e.pointerId)};c.onpointermove=e=>{if(d){ctx.lineWidth=3;ctx.lineCap='round';ctx.lineTo(...pos(e));ctx.stroke()}};c.onpointerup=()=>d=false;$('#clearSign').onclick=()=>ctx.clearRect(0,0,c.width,c.height);$('#cancelSign').onclick=()=>m.classList.add('hidden');$('#useSign').onclick=()=>{signature=c.toDataURL();m.classList.add('hidden');done()}}
$('#downloadBtn').onclick=async()=>{
 const result=await exportPPDF(bytes,objects);
 if(!result.ok){alert('PPDF cannot safely edit the original text encoding on page '+result.failed.map(x=>x.page).join(', ')+'. Export stopped; no fake text overlay was used.');return}
 const a=document.createElement('a'),url=URL.createObjectURL(new Blob([result.bytes],{type:'application/pdf'}));
 a.href=url;a.download='edited-document.pdf';a.click();setTimeout(()=>URL.revokeObjectURL(url),1500);
};
