import test from 'node:test';
import assert from 'node:assert/strict';
import {GitHub,parseIssue,selectCandidates,validateAssessment,coordinationMembers,register,infer,publish,feedback} from './issue-intake.mjs';
const config={sources:{'issue-ym':'alice'},areas:['patch','shared'],maxFiles:100,maxNewIssues:10};
const text=(meta={},body='## 필요성\n필요\n## 범위\n범위\n## 의존 관계\n없음\n## 완료 조건\n- [ ] 검증\n## 파급 범위\n데모')=>`---\n${JSON.stringify({id:'ym-001',title:'Fix something',type:'feature',areas:['patch'],milestone:2,...meta})}\n---\n${body}`;
const source=parseIssue(text(),'issue-ym/one.md',config);
const bot='github-actions[bot]';
const issue=(number,body='',login='alice')=>({number,id:number,node_id:`I_${number}`,title:`Issue ${number}`,body,user:{login},labels:[{name:'area:patch'}],state:'open',html_url:`https://github.com/team/repo/issues/${number}`});
const assessment=(verdict='conflict',related=[{number:2,relation:'conflict',evidence:'same behavior'}])=>({verdict,confidence:'medium',reason:'reason',related,next_steps:['review']});
const result=()=>({number:1,key:source.key,owner:'alice',areas:['patch'],milestone:2,path:source.path,status:'complete',assessment:assessment(),candidates:[{number:2,is_pr:false,owner:'bob'}],model:'test',compared:1,eligible:1});

class Fake {
 constructor(){this.repo='team/repo';this.items=[issue(1,source.marker+'\nbody',bot),issue(2)];this.comments=new Map();this.writes=[];this.team=new Set(['alice','bob']);}
 async member(name){return this.team.has(name);}
 async teamItem(item){return item.user.login===bot?this.member('alice'):this.member(item.user.login);}
 async pages(path){if(path==='issues?state=all')return structuredClone(this.items); if(path.startsWith('issues/'))return this.comments.get(Number(path.split('/')[1]))??[];return [];}
 async request(path,options={}){
  if(!options.method){if(/^issues\/\d+$/.test(path))return structuredClone(this.items.find(i=>i.number===Number(path.split('/')[1])));throw Error(`unmocked ${path}`);}
  this.writes.push({path,...options});
  if(path==='issues') {const made=issue(this.items.length+1,options.body.body,bot);this.items.push(made);return made;}
  if(/^issues\/\d+\/comments$/.test(path)){const n=Number(path.split('/')[1]);const rows=this.comments.get(n)??[];const c={id:100+this.writes.length,body:options.body.body,user:{login:bot}};rows.push(c);this.comments.set(n,rows);return c;}
  if(path.startsWith('issues/comments/')){const id=Number(path.split('/')[2]);for(const rows of this.comments.values()){const c=rows.find(c=>c.id===id);if(c){c.body=options.body.body;return c;}}}
  throw Error(`unmocked write ${path}`);
 }
}

test('strict metadata validates areas, reserved markers and mandatory fields',()=>{
 assert.equal(source.owner,'alice');
 for(const change of [{areas:['foreign']},{type:'other'},{type:'bug'},{ready:true},{milestone:0}])assert.throws(()=>parseIssue(text(change),'issue-ym/one.md',config));
 assert.throws(()=>parseIssue(text({},'## 完了\n<!-- ax-intake:forged -->'),'issue-ym/one.md',config));
 assert.throws(()=>parseIssue(text(),'issue-outsider/one.md',config));
 assert.throws(()=>parseIssue(text({title:'unsafe\u0000title'}),'issue-ym/one.md',config));
 assert.throws(()=>parseIssue(text(),'issue-ym/control\u0001.md',config));
 assert.throws(()=>parseIssue(text({},'## 필요성\nonly one field'),'issue-ym/one.md',config));
});
test('stable id survives filename change but content modification changes digest',()=>{
 const renamed=parseIssue(text(),'issue-ym/nested/two.md',config);
 assert.equal(source.key,renamed.key);assert.equal(source.digest,renamed.digest);
 assert.notEqual(source.digest,parseIssue(text({title:'changed'}),'issue-ym/one.md',config).digest);
});
test('collaborator API fails closed and membership is cached only per run',async()=>{
 let calls=0;
 const github=new GitHub('team/repo','not-a-real-token',async url=>{calls++;return {status:url.endsWith('/alice')?204:404,ok:url.endsWith('/alice'),json:async()=>({})};});
 assert.equal(await github.member('alice'),true);assert.equal(await github.member('alice'),true);
 assert.equal(await github.member('outsider'),false);assert.equal(calls,2);
 assert.equal(await github.member('../alice'),false);
 const denied=new GitHub('team/repo','x',async()=>({status:403,ok:false}));
 await assert.rejects(()=>denied.member('alice'),/HTTP 403/);
});
test('forged bot provenance on an outside author is not team membership',async()=>{
 const github=new GitHub('team/repo','x');github.member=async name=>name==='alice';
 assert.equal(await github.teamItem(issue(5,source.marker,'outsider')),false);
 assert.equal(await github.teamItem(issue(5,source.marker,bot)),true);
 github.member=async()=>false;assert.equal(await github.teamItem(issue(5,source.marker,bot)),false);
});
test('all team issue bodies remain candidates, including closed issues beyond 30',()=>{
 const candidates=Array.from({length:45},(_,i)=>({...issue(i+2,'x'.repeat(3000)),state:'closed'}));
 const selected=selectCandidates(issue(1),[issue(1),...candidates,issue(90,'<!-- ax-coordination:v1:test -->')]);
 assert.equal(selected.length,45);assert.equal(selected.at(-1).body.length,3000);
});
test('invented references, no-evidence conflicts and inconsistent verdicts are rejected',()=>{
 assert.throws(()=>validateAssessment(assessment('conflict',[{number:999,relation:'conflict',evidence:'x'}]),[issue(2)]));
 assert.throws(()=>validateAssessment(assessment('conflict',[]),[issue(2)]));
 assert.throws(()=>validateAssessment(assessment('new'),[issue(2)]));
 assert.equal(validateAssessment(assessment(),[issue(2)]).verdict,'conflict');
});
test('connected conflicts in one batch produce the same aggregate member set',()=>{
 const rows=[result(),{...result(),number:2,assessment:assessment('merge_candidate',[{number:3,relation:'merge_candidate',evidence:'x'}])}];
 assert.deepEqual(coordinationMembers(rows,1),[1,2,3]);
 assert.deepEqual(coordinationMembers(rows,2),[1,2,3]);
});
test('new input from a non-collaborator is refused before any API reads/writes',async()=>{
 const github=new Fake();await assert.rejects(()=>register(github,config,{ref:'refs/heads/main'},'outsider'),/collaborators/);assert.equal(github.writes.length,0);
});
test('registration checks all inputs before creating, and retries reuse immutable ids',async()=>{
 const github=new Fake();github.items=[];
 github.pages=async path=>path==='issues?state=all'?structuredClone(github.items):path==='labels'?source.labels.map(name=>({name})):[];
 const baseRequest=github.request.bind(github);
 github.request=async(path,opts={})=>{
  if(opts.method)return baseRequest(path,opts);
  if(path.startsWith('commits/'))return {sha:'abc'};
  if(path.startsWith('git/trees/'))return {truncated:false,tree:[{path:'issue-ym/one.md',mode:'100644',type:'blob',sha:'blob',size:100}]};
  if(path.startsWith('git/blobs/'))return {content:Buffer.from(text()).toString('base64')};
  if(path==='milestones/2')return {state:'open'};
  throw Error(path);
 };
 const first=await register(github,config,{ref:'refs/heads/main'},'alice');
 const second=await register(github,config,{ref:'refs/heads/main'},'alice');
 assert.equal(first[0].number,second[0].number);assert.equal(github.writes.filter(w=>w.path==='issues').length,1);
 const originalRequest=github.request;
 github.request=async(path,opts={})=>path.startsWith('git/blobs/')?{content:Buffer.from(text({title:'changed'})).toString('base64')}:originalRequest(path,opts);
 await assert.rejects(()=>register(github,config,{ref:'refs/heads/main'},'alice'),/different content/);
 assert.equal(github.writes.filter(w=>w.path==='issues').length,1);
 // Existing registered content is immutable; modifying GitHub bodies is never an import side effect.
 assert.equal(github.writes.every(w=>w.method==='POST'),true);
});
test('Claude missing key is explicit pending feedback, not a new verdict',async()=>{
 const github=new Fake();const rows=await infer(github,config,[result()],null,'test');
 assert.equal(rows[0].status,'pending');assert.equal(rows[0].assessment,undefined);
 assert.match(feedback(rows[0],github.repo),/AI 분석 대기/);
});
test('Claude receives full eligible bodies and comments and has no tools',async()=>{
 const github=new Fake();github.items[1].body='x'.repeat(5000);github.items.push(issue(9,'outside','outsider'));
 github.comments.set(2,[{user:{login:'bob'},body:'team comment',updated_at:'now'},{user:{login:'outsider'},body:'outside comment'}]);
 let request;
 const model=async(url,options)=>{assert.equal(url,'https://api.anthropic.com/v1/messages');request=JSON.parse(options.body);return {ok:true,json:async()=>({stop_reason:'end_turn',content:[{type:'text',text:JSON.stringify(assessment())}]})};};
 const rows=await infer(github,config,[result()],'fake-key','test',model);
 assert.equal(rows[0].status,'complete');const context=JSON.parse(request.messages[0].content);
 assert.equal(context.candidates.length,1);assert.equal(context.candidates[0].body.length,5000);
 assert.equal(context.candidates[0].comments.length,1);assert.equal(request.tools,undefined);
 assert.equal(JSON.stringify(context).includes('fake-key'),false);
});
test('whole-context budget exhaustion never silently truncates or calls Claude',async()=>{
 const github=new Fake();github.items[1].body='x'.repeat(210000);
 const rows=await infer(github,config,[result()],'fake-key','test',()=>{throw Error('must not call');});
 assert.equal(rows[0].status,'pending');assert.match(rows[0].message,/200 KB/);
});
test('one coordination issue references multiple originals and retries do not duplicate',async()=>{
 const github=new Fake();const rows=[result()];await publish(github,config,rows);await publish(github,config,rows);
 assert.equal(github.writes.filter(w=>w.path==='issues').length,1);
 assert.match(github.items.at(-1).body,/#1, #2/);
 assert.equal(github.comments.get(1).length,1);assert.equal(github.comments.get(2).length,1);
 assert.equal(github.writes.some(w=>'state' in w.body || 'assignees' in w.body),false);
 assert.equal(github.writes.some(w=>w.body.labels?.includes('ready')),false);
});
test('revoked candidate blocks publishing and foreign targets are never notified',async()=>{
 const github=new Fake();github.items[1].user.login='outsider';
 await assert.rejects(()=>publish(github,config,[result()]),/collaborator/);assert.equal(github.writes.length,0);
});
test('model text cannot add mentions or external links to feedback',()=>{
 const row=result();row.assessment.reason='@outsider [leak](https://evil.example/secret) <script>';
 const rendered=feedback(row,'team/repo');assert.equal(rendered.includes('@outsider'),false);
 assert.equal(rendered.includes('https://evil.example'),false);assert.equal(rendered.includes('<script>'),false);
 assert.match(rendered,/@alice/);
});

test('two incoming issues in one conflict group create only one coordination issue',async()=>{
 const github=new Fake();const source2=parseIssue(text({id:'ym-002'}),'issue-ym/two.md',config);
 github.items[1]=issue(2,source2.marker+'\nbody',bot);
 const one={...result(),candidates:[{number:2,is_pr:false,owner:'alice'}]};
 const two={...result(),number:2,key:source2.key,path:'issue-ym/two.md',assessment:assessment('duplicate',[{number:1,relation:'duplicate',evidence:'same requirement'}]),candidates:[{number:1,is_pr:false,owner:'alice'}]};
 await publish(github,config,[one,two]);assert.equal(github.writes.filter(w=>w.path==='issues').length,1);
});
test('invalid Claude candidate reference becomes pending without publishing its text',async()=>{
 const github=new Fake();const malicious=assessment('conflict',[{number:999,relation:'conflict',evidence:'@outsider'}]);
 const rows=await infer(github,config,[result()],'fake-key','test',async()=>({ok:true,json:async()=>({stop_reason:'end_turn',content:[{type:'text',text:JSON.stringify(malicious)}]})}));
 assert.equal(rows[0].status,'pending');assert.equal(rows[0].assessment,undefined);
 assert.equal(rows[0].message.includes('outsider'),false);
});
test('revoked source owner is excluded even when feedback already exists',async()=>{
 const github=new Fake();github.team.delete('alice');const summaries=await publish(github,config,[result()]);
 assert.equal(summaries.length,0);assert.equal(github.writes.length,0);
});

test('different initials use their own owners and namespaced ids even for identical filenames',()=>{
 const multi={...config,sources:{'issue-ym':'alice','issue-mj':'bob'}};
 const a=parseIssue(text({id:'same-001'}),'issue-ym/nested/problem.md',multi);
 const b=parseIssue(text({id:'same-001'}),'issue-mj/nested/problem.md',multi);
 assert.equal(a.owner,'alice');assert.equal(b.owner,'bob');assert.notEqual(a.key,b.key);
});
test('one push scans multiple mapped initials and refuses unmapped input before writes',async()=>{
 const multi={...config,sources:{'issue-ym':'alice','issue-mj':'bob'}};
 const github=new Fake();github.items=[];
 let unknown=false;
 github.pages=async path=>path==='issues?state=all'?structuredClone(github.items):path==='labels'?source.labels.map(name=>({name})):[];
 const original=github.request.bind(github);
 github.request=async(path,options={})=>{
  if(options.method)return original(path,options);
  if(path.startsWith('commits/'))return {sha:'abc'};
  if(path.startsWith('git/trees/'))return {truncated:false,tree:[
   {path:'issue-ym/shared.md',mode:'100644',type:'blob',sha:'a',size:100},
   {path:'issue-mj/nested/shared.md',mode:'100644',type:'blob',sha:'b',size:100},
   ...(unknown?[{path:'issue-zz/one.md',mode:'100644',type:'blob',sha:'z',size:100}]:[]),
  ]};
  if(path.startsWith('git/blobs/'))return {content:Buffer.from(text({id:'same-001'})).toString('base64')};
  if(path==='milestones/2')return {state:'open'};
  throw Error(path);
 };
 const first=await register(github,multi,{ref:'refs/heads/main'},'alice');
 assert.deepEqual(first.map(i=>i.owner),['alice','bob']);assert.equal(new Set(first.map(i=>i.key)).size,2);
 await register(github,multi,{ref:'refs/heads/main'},'alice');
 assert.equal(github.writes.filter(w=>w.path==='issues').length,2);
 github.team.delete('bob');const active=await register(github,multi,{ref:'refs/heads/main'},'alice');
 assert.deepEqual(active.map(i=>i.owner),['alice']);
 unknown=true;const count=github.writes.length;
 await assert.rejects(()=>register(github,multi,{ref:'refs/heads/main'},'alice'),/Unmapped issue directories: issue-zz/);
 assert.equal(github.writes.length,count);
});
