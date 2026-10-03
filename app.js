import * as pdfjsLib from 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs';
pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs';
const $=s=>document.querySelector(s), pagesEl=$('#pages'), thumbs=$('#thumbs'), file=$('#file');
let pdf=null, bytes=null, zoom=1, tool='select', objects=[], undo=[], signature=null, textItems={}, selected=null;
const open=()=>file.click(); $('#openBtn').onclick=open; $('#welcomeOpen').onclick=open;

function rgbCss(a){return `rgb(${a[0]},${a[1]},${a[2]})`}
function sampleBackground(canvas,x,y,w=1,h=1){
  const ctx=canvas?.getContext?.('2d'); if(!ctx)return 'rgb(255,255,255)';
  const pad=Math.max(3,Math.min(8,h*.25)), pts=[
    [x-pad,y+h/2],[x+w+pad,y+h/2],[x+w/2,y-pad],[x+w/2,y+h+pad],
    [x-pad,y-pad],[x+w+pad,y-pad],[x-pad,y+h+pad],[x+w+pad,y+h+pad]
  ];
  const colors=[];
  for(const [xx,yy] of pts){const px=Math.max(0,Math.min(canvas.width-1,Math.round(xx))),py=Math.max(0,Math.min(canvas.height-1,Math.round(yy)));colors.push([...ctx.getImageData(px,py,1,1).data].slice(0,3))}
  colors.sort((a,b)=>(b[0]+b[1]+b[2])-(a[0]+a[1]+a[2]));
  return rgbCss(colors[Math.floor(colors.length/2)]||[255,255,255]);
}
function saveUndo(){undo.push(JSON.stringify(objects));if(undo.length>30)undo.shift()}
function norm(o){if(o.w<0){o.x+=o.w;o.w=-o.w}if(o.h<0){o.y+=o.h;o.h=-o.h}}
function selectObject(o){selected=o;$('#objectBar').classList.toggle('hidden',!o);if(o){$('#fontSize').value=Math.round(o.size||16);if(o.color?.startsWith('#'))$('#textColor').value=o.color}}

file.onchange=async()=>{
  if(!file.files[0])return;
  bytes=await file.files[0].arrayBuffer(); pdf=await pdfjsLib.getDocument({data:bytes.slice(0)}).promise;
  textItems={}; objects=[]; undo=[]; selected=null;
  for(let n=1;n<=pdf.numPages;n++){const pg=await pdf.getPage(n),tc=await pg.getTextContent();textItems[n]=tc.items.filter(it=>it.str?.trim())}
  $('#welcome').style.display='none';$('#downloadBtn').disabled=false;await render();
};

async function render(){
  pagesEl.innerHTML='';thumbs.innerHTML='';
  for(let n=1;n<=pdf.numPages;n++){
    const p=await pdf.getPage(n),vp=p.getViewport({scale:1.35*zoom});
    const wrap=document.createElement('div');wrap.className='page';wrap.dataset.page=n;Object.assign(wrap.style,{width:vp.width+'px',height:vp.height+'px'});
    const c=document.createElement('canvas');c.width=Math.ceil(vp.width);c.height=Math.ceil(vp.height);wrap.append(c);
    const ov=document.createElement('div');ov.className='overlay';wrap.append(ov);pagesEl.append(wrap);
    await p.render({canvasContext:c.getContext('2d'),viewport:vp}).promise;
    bindOverlay(ov,n,vp,c); drawTextTargets(ov,n,vp,c); drawObjects(ov,n,vp);
    const tv=p.getViewport({scale:.22}),tc=document.createElement('canvas');tc.width=tv.width;tc.height=tv.height;
    await p.render({canvasContext:tc.getContext('2d'),viewport:tv}).promise;
    const t=document.createElement('div');t.className='thumb';t.append(tc);t.insertAdjacentHTML('beforeend',`<div>Page ${n}</div>`);t.onclick=()=>wrap.scrollIntoView({behavior:'smooth',block:'start'});thumbs.append(t);
  }
}
function itemBox(it,vp){
  const tx=pdfjsLib.Util.transform(vp.transform,it.transform), fs=Math.max(6,Math.hypot(tx[2],tx[3]));
  return {x:tx[4],y:tx[5]-fs*.88,w:Math.max(3,it.width*vp.scale),h:fs*1.12,fs};
}
function addFromWord(type,page,b,vp,canvas,it){
  saveUndo();const bg=sampleBackground(canvas,b.x,b.y,b.w,b.h);
  if(type==='text'){
    const v=prompt('Edit text',it.str); if(v===null){undo.pop();return}
    objects.push({type:'replaceText',page,x:b.x/vp.width,y:b.y/vp.height,w:b.w/vp.width,h:b.h/vp.height,text:v,size:Math.max(8,b.fs/(1.35*zoom)),bg,color:'#111111'});
  }else if(type==='erase'){
    objects.push({type:'eraseArea',page,x:b.x/vp.width,y:b.y/vp.height,w:b.w/vp.width,h:b.h/vp.height,bg});
  }else if(type==='redact'){
    objects.push({type:'redact',page,x:b.x/vp.width,y:b.y/vp.height,w:b.w/vp.width,h:b.h/vp.height,color:bg});
  }
  render();
}
function drawTextTargets(ov,page,vp,canvas){
  if(!['text','erase','redact'].includes(tool))return;
  for(const it of textItems[page]||[]){
    const b=itemBox(it,vp), hit=document.createElement('div');hit.className='pdf-word-hit';hit.title=it.str;
    Object.assign(hit.style,{position:'absolute',left:b.x+'px',top:b.y+'px',width:b.w+'px',height:b.h+'px',zIndex:'6',cursor:'pointer',background:'transparent'});
    hit.onpointerdown=e=>{e.preventDefault();e.stopPropagation();addFromWord(tool,page,b,vp,canvas,it)};
    ov.append(hit);
  }
}
function bindOverlay(ov,page,vp,canvas){
  let sx=0,sy=0,temp=null;
  ov.onpointerdown=e=>{
    if(e.target!==ov||tool==='select'||['text','erase'].includes(tool))return;
    const r=ov.getBoundingClientRect();sx=e.clientX-r.left;sy=e.clientY-r.top;
    if(tool==='sign'){openSign(()=>{saveUndo();objects.push({type:'sign',page,x:sx/vp.width,y:sy/vp.height,w:.25,h:.08,data:signature});render()});return}
    saveUndo();temp={type:tool,page,x:sx/vp.width,y:sy/vp.height,w:0,h:0};
    if(tool==='redact')temp.color=sampleBackground(canvas,sx,sy,1,1);
    objects.push(temp);ov.setPointerCapture(e.pointerId);
  };
  ov.onpointermove=e=>{if(!temp)return;const r=ov.getBoundingClientRect();temp.w=(e.clientX-r.left-sx)/vp.width;temp.h=(e.clientY-r.top-sy)/vp.height;drawObjects(ov,page,vp)};
  ov.onpointerup=()=>{if(!temp)return;norm(temp);if(temp.w<.004||temp.h<.004){objects.splice(objects.indexOf(temp),1)}temp=null;render()};
}
function drawObjects(ov,page,vp){
  ov.querySelectorAll('.obj').forEach(x=>x.remove());
  objects.filter(o=>o.page===page).forEach(o=>{
    const d=document.createElement(o.type==='sign'?'img':'div');d.className='obj '+(o.type==='redact'?'redact':o.type==='replaceText'?'textobj':o.type==='sign'?'signature':'');
    let x=o.x*vp.width,y=o.y*vp.height,w=Math.abs(o.w||.2)*vp.width,h=Math.abs(o.h||.04)*vp.height;
    Object.assign(d.style,{left:x+'px',top:y+'px',width:Math.max(w,3)+'px',height:Math.max(h,3)+'px',zIndex:'8'});
    if(o.type==='eraseArea'||o.type==='redact')d.style.background=o.bg||o.color||'#fff';
    if(o.type==='replaceText'){
      d.textContent=o.text;Object.assign(d.style,{background:o.bg||'#fff',fontSize:Math.max(8,(o.size||16)*1.35*zoom)+'px',color:o.color||'#111',padding:'0 1px',display:'flex',alignItems:'center',whiteSpace:'nowrap',overflow:'visible'});
      d.ondblclick=()=>{const v=prompt('Edit text',o.text);if(v!==null){saveUndo();o.text=v;render()}};
    }
    if(o.type==='sign')d.src=o.data;
    if(o.type==='draw'){d.style.border='2px solid #111';d.style.borderRadius='50%'}
    if(selected===o)d.classList.add('selected');
    let drag=null;
    d.onpointerdown=e=>{if(tool!=='select')return;e.preventDefault();e.stopPropagation();selectObject(o);drag={px:e.clientX,py:e.clientY,ox:o.x,oy:o.y};d.setPointerCapture(e.pointerId);d.classList.add('selected')};
    d.onpointermove=e=>{if(!drag)return;const r=ov.getBoundingClientRect();o.x=Math.max(0,Math.min(1-Math.abs(o.w||.02),drag.ox+(e.clientX-drag.px)/r.width));o.y=Math.max(0,Math.min(1-Math.abs(o.h||.02),drag.oy+(e.clientY-drag.py)/r.height));d.style.left=o.x*vp.width+'px';d.style.top=o.y*vp.height+'px'};
    d.onpointerup=()=>{if(drag){drag=null;saveUndo()}};
    ov.append(d);
  });
}
document.querySelectorAll('[data-tool]').forEach(b=>b.onclick=()=>{document.querySelectorAll('[data-tool]').forEach(x=>x.classList.remove('active'));b.classList.add('active');tool=b.dataset.tool;selectObject(null);if(pdf)render()});
$('#zoomIn').onclick=()=>{zoom=Math.min(2,zoom+.15);$('#zoomLabel').textContent=Math.round(zoom*100)+'%';render()};
$('#zoomOut').onclick=()=>{zoom=Math.max(.55,zoom-.15);$('#zoomLabel').textContent=Math.round(zoom*100)+'%';render()};
$('#undoBtn').onclick=()=>{if(undo.length){objects=JSON.parse(undo.pop());selected=null;selectObject(null);render()}};
function openSign(done){
  const m=$('#signModal'),c=$('#signPad'),ctx=c.getContext('2d');m.classList.remove('hidden');ctx.clearRect(0,0,c.width,c.height);let drawing=false;
  const pos=e=>{const r=c.getBoundingClientRect();return[(e.clientX-r.left)*c.width/r.width,(e.clientY-r.top)*c.height/r.height]};
  c.onpointerdown=e=>{drawing=true;ctx.beginPath();ctx.moveTo(...pos(e));c.setPointerCapture(e.pointerId)};c.onpointermove=e=>{if(drawing){ctx.lineWidth=3;ctx.lineCap='round';ctx.lineTo(...pos(e));ctx.stroke()}};c.onpointerup=()=>drawing=false;
  $('#clearSign').onclick=()=>ctx.clearRect(0,0,c.width,c.height);$('#cancelSign').onclick=()=>m.classList.add('hidden');$('#useSign').onclick=()=>{signature=c.toDataURL('image/png');m.classList.add('hidden');done()};
}
$('#fontSize').onchange=e=>{if(selected?.type==='replaceText'){saveUndo();selected.size=Math.max(8,Math.min(72,+e.target.value||16));render()}};
$('#textColor').oninput=e=>{if(selected){if(selected.type==='replaceText'||selected.type==='redact'){selected.color=e.target.value;render()}}};
$('#deleteSelected').onclick=()=>{if(selected){saveUndo();objects.splice(objects.indexOf(selected),1);selected=null;selectObject(null);render()}};

$('#downloadBtn').onclick=async()=>{
  const {PDFDocument,rgb,StandardFonts}=PDFLib,doc=await PDFDocument.load(bytes.slice(0)),font=await doc.embedFont(StandardFonts.Helvetica);
  const col=v=>{if(v?.startsWith('#')){const q=v.slice(1);return rgb(parseInt(q.slice(0,2),16)/255,parseInt(q.slice(2,4),16)/255,parseInt(q.slice(4,6),16)/255)}const m=(v||'rgb(255,255,255)').match(/\d+/g)||[255,255,255];return rgb(+m[0]/255,+m[1]/255,+m[2]/255)};
  for(const o of objects){const p=doc.getPage(o.page-1),{width,height}=p.getSize(),x=o.x*width,top=o.y*height,h=Math.abs(o.h||.04)*height,w=Math.abs(o.w||.2)*width,y=height-top-h;
    if(o.type==='replaceText'){p.drawRectangle({x,y,width:w,height:h,color:col(o.bg)});p.drawText(o.text,{x:x+1,y:y+Math.max(1,(h-(o.size||14))*.45),size:o.size||14,font,color:col(o.color||'#111111')})}
    if(o.type==='eraseArea')p.drawRectangle({x,y,width:w,height:h,color:col(o.bg)});
    if(o.type==='redact')p.drawRectangle({x,y,width:w,height:h,color:col(o.color||'#ffffff')});
    if(o.type==='sign'){const img=await doc.embedPng(o.data);p.drawImage(img,{x,y,width:w,height:h})}
  }
  const out=await doc.save(),blob=new Blob([out],{type:'application/pdf'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='edited-document.pdf';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
};