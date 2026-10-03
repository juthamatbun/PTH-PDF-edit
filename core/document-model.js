// PPDF clean-room document model. No RevPDF code/assets/binaries are used.
export class PPDFDocumentModel {
  constructor(){ this.pages=new Map(); this.edits=[]; }
  setPage(n,page){ this.pages.set(n,page); }
  getPage(n){ return this.pages.get(n); }
  findRun(page,runId){ return this.getPage(page)?.runs?.find(r=>r.id===runId)||null; }
  upsert(edit){
    const k=e=>e.ref?.page+'|'+e.ref?.runId;
    const i=this.edits.findIndex(e=>k(e)===k(edit));
    if(i>=0)this.edits[i]=edit; else this.edits.push(edit);
  }
  replaceText(ref,text){ this.upsert({op:'replaceText',ref,text}); }
  deleteText(ref){ this.upsert({op:'deleteText',ref}); }
  moveText(ref,x,y){ this.upsert({op:'moveText',ref,x,y}); }
  removeEdit(ref){const key=ref?.page+'|'+ref?.runId;this.edits=this.edits.filter(e=>(e.ref?.page+'|'+e.ref?.runId)!==key)}
  clear(){this.pages.clear();this.edits=[]}
}
