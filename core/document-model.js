// PPDF clean-room document model. No RevPDF code is used.
export class PPDFDocumentModel {
  constructor(){ this.pages=new Map(); this.edits=[]; }
  setPage(n, page){ this.pages.set(n,page); }
  getPage(n){ return this.pages.get(n); }
  replaceText(ref,text){ this.edits.push({op:'replaceText',ref,text}); }
  deleteText(ref){ this.edits.push({op:'deleteText',ref}); }
  moveText(ref,x,y){ this.edits.push({op:'moveText',ref,x,y}); }
}
