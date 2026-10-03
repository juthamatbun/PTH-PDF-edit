// Clean-room PDF.js operator parser.
// Captures text-show operators and active font/transform state so edits can be
// mapped back to actual PDF drawing operations instead of screen overlays.
export function parseTextItems(items){
 const out=[];
 items.forEach((i,index)=>{if(i.str?.length)out.push({
   id:'text-'+index,text:i.str,fontKey:i.fontName||null,
   transform:[...(i.transform||[])],width:i.width||0,height:i.height||0,
   hasEOL:!!i.hasEOL,sourceIndex:index
 })});
 return out;
}

export function parseOperatorList(opList, OPS){
 const out=[]; let fontKey=null,fontSize=null,textMatrix=null;
 const fn=opList.fnArray||[], args=opList.argsArray||[];
 for(let i=0;i<fn.length;i++){
   const op=fn[i], a=args[i]||[];
   if(op===OPS.setFont){fontKey=a[0]??fontKey;fontSize=a[1]??fontSize}
   if(op===OPS.setTextMatrix) textMatrix=[...a];
   if(op===OPS.showText||op===OPS.showSpacedText){
     const glyphs=a[0]||[];
     const text=Array.isArray(glyphs)?glyphs.map(g=>typeof g==='string'?g:(g?.unicode||'')).join(''):String(glyphs??'');
     out.push({operatorIndex:i,operator:op===OPS.showText?'showText':'showSpacedText',text,fontKey,fontSize,textMatrix:textMatrix?[...textMatrix]:null});
   }
 }
 return out;
}

export function linkRunsToOperators(runs,operators){
 const used=new Set();
 return runs.map(run=>{
   let best=-1;
   for(let i=0;i<operators.length;i++){
     if(used.has(i))continue;
     if(operators[i].text===run.text){best=i;break}
   }
   if(best<0) for(let i=0;i<operators.length;i++){
     if(used.has(i))continue;
     if(operators[i].text && (operators[i].text.includes(run.text)||run.text.includes(operators[i].text))){best=i;break}
   }
   if(best>=0){used.add(best);return {...run,operatorRef:operators[best]}}
   return {...run,operatorRef:null};
 });
}
