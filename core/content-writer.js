// PPDF clean-room rewrite planner.
// IMPORTANT: this module never pretends an overlay is a direct content edit.
export function buildRewritePlan(model){
 const plan=[];
 for(const edit of model.edits){
   const page=model.getPage(edit.ref?.page),run=page?.runs?.find(r=>r.id===edit.ref?.runId);
   if(!page||!run)continue;
   const op=run.operatorRef||null;
   plan.push({
     page:edit.ref.page,runId:run.id,sourceIndex:run.sourceIndex,
     operatorIndex:op?.operatorIndex??null,operator:op?.operator??null,
     fontKey:op?.fontKey||run.fontKey||null,fontSize:op?.fontSize??null,
     textMatrix:op?.textMatrix?[...op.textMatrix]:null,transform:[...run.transform],
     originalText:run.text,operation:edit.op,replacementText:edit.text??null,
     directEligible:!!op && op.text===run.text && ['replaceText','deleteText'].includes(edit.op)
   });
 }
 return plan;
}
export function auditRewritePlan(plan){
 const direct=plan.filter(x=>x.directEligible),fallback=plan.filter(x=>!x.directEligible);
 return {total:plan.length,direct,fallback,allDirect:fallback.length===0};
}
export function canRewriteDirectly(entry){return !!entry?.directEligible}
