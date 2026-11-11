/** Opt-in measurement transform; engine/app source files stay untouched.
 * Uses the parser already shipped with Vite's Rolldown (no added dependency).
 */
import { parseSync } from 'rolldown/utils';
const fields=new Set(['counters','insideHeatmap','childrenInsideHeatmap']);
const name=n=>n?.name ?? n?.value;
const counterCall=n=>n?.type==='CallExpression' && ['count','newCounters'].includes(n.callee?.name);
export function stripCounters(code, filename) {
  const {program,errors}=parseSync(filename,code);
  if(errors.length) throw Error(JSON.stringify(errors));
  const edits=[];
  const put=(n,text='void 0')=>edits.push([n.start,n.end,text]);
  const dropLast=(list,last)=>edits.push([list.length>1?list.at(-2).end:last.start,last.end,'']);
  function visit(n) {
    if(!n || typeof n!=='object') return;
    if(n.type==='PropertyDefinition' && fields.has(name(n.key))) {put(n,'');return;}
    if(n.type==='ObjectExpression') {
      // Group adjacent removed properties, so comma edits never overlap.
      const list=n.properties;
      for(let i=0;i<list.length;i++) if(list[i].type==='Property' && fields.has(name(list[i].key))) {
        let end=i;while(end+1<list.length && list[end+1].type==='Property' && fields.has(name(list[end+1].key)))end++;
        edits.push([i>0?list[i-1].end:list[i].start,end+1<list.length && i===0?list[end+1].start:list[end].end,'']);i=end;
      }
    }
    if(n.type==='ExpressionStatement' && n.expression.type==='AssignmentExpression' && fields.has(name(n.expression.left.property))) {put(n,'');return;}
    if(n.type==='VariableDeclaration' && n.declarations.length===1 && name(n.declarations[0].id)==='inside') {put(n,'');return;}
    if(n.type==='IfStatement' && n.consequent?.type==='ExpressionStatement' && counterCall(n.consequent.expression?.expression ?? n.consequent.expression)) {put(n,'');return;}
    if(counterCall(n)) {put(n);return;}
    if(n.type==='CallExpression') {
      const last=n.arguments.at(-1),callee=name(n.callee);
      if(last && ((['createHost','updateProps'].includes(callee) && last.type==='ArrowFunctionExpression') ||
        (['setProp','formProp'].includes(callee) && name(last)==='count'))) dropLast(n.arguments,last);
    }
    if(n.type==='FunctionDeclaration' && name(n.params.at(-1))==='count') dropLast(n.params,n.params.at(-1));
    for(const [key,value] of Object.entries(n)) {
      if(['start','end','loc'].includes(key))continue;
      if(Array.isArray(value))value.forEach(visit);else if(value && typeof value==='object')visit(value);
    }
  }
  visit(program);
  const outer=edits.filter(([s,e],i)=>!edits.some(([a,b],j)=>j!==i&&a<=s&&b>=e&&(a<s||b>e)));
  for(const [s,e,text] of outer.sort((a,b)=>b[0]-a[0]))code=code.slice(0,s)+text+code.slice(e);
  const parsed=parseSync(filename,code);if(parsed.errors.length)throw Error(JSON.stringify(parsed.errors));
  return {code,edits:outer.length};
}
export function counterBuildPlugin() {
  return {name:'b4-counter-measurement',enforce:'pre',apply:'build',transform(code,id) {
    if(process.env.B4_COUNTERS!=='off' || !/\/src\/fiber\/(root|workLoop|commit|dom)\.ts$/.test(id))return null;
    const result=stripCounters(code,id);if(!result.edits)throw Error(`No counter instrumentation in ${id}`);
    return {code:result.code,map:null};
  }};
}
