// Layout utilities for true-content editing.
// Keeps text metrics separate from UI overlays so a writer can later rewrite operators.
export function replacementMetrics(run,newText){
 const oldLen=Math.max(1,[...run.text].length), newLen=[...newText].length;
 return {...run, text:newText, estimatedWidth:run.width*(newLen/oldLen)};
}
