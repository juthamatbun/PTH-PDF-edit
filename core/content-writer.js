// PPDF clean-room content writer foundation.
//
// This layer intentionally does NOT paint replacement text over old text.
// It validates semantic edits against parsed source runs. Direct PDF operator
// rewriting will be added here once font/resource mapping is verified.

export function buildRewritePlan(model){
  const plan=[];
  for(const edit of model.edits){
    const page=model.getPage(edit.ref?.page);
    const run=page?.runs?.find(r=>r.id===edit.ref?.runId);
    if(!page||!run) continue;
    plan.push({
      page:edit.ref.page,
      sourceIndex:run.sourceIndex,
      runId:run.id,
      fontKey:run.fontKey,
      transform:[...run.transform],
      originalText:run.text,
      operation:edit.op,
      replacementText:edit.text ?? null
    });
  }
  return plan;
}

export function canRewriteDirectly(entry){
  return !!entry && entry.operation==='replaceText' &&
    typeof entry.originalText==='string' &&
    typeof entry.replacementText==='string' &&
    entry.transform.length===6;
}
