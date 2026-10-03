// Builds a content-aware model from PDF.js text operators.
// Phase 1 preserves glyph/text-run identity, transform, font key and geometry.
export function parseTextItems(items){
 return items.filter(i=>i.str?.length).map((i,index)=>({
   id:'text-'+index,text:i.str,fontKey:i.fontName||null,
   transform:[...(i.transform||[])],width:i.width||0,height:i.height||0,
   hasEOL:!!i.hasEOL, sourceIndex:index
 }));
}
