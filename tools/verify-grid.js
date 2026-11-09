const http=require('node:http')
const WS=require('E:/Work/workbench/vendor/cs/code-server-4.145.2-windows-amd64/lib/vscode/node_modules/ws')
function list(){return new Promise((res,rej)=>{const r=http.get({host:'127.0.0.1',port:9555,path:'/json/list'},x=>{let b='';x.on('data',c=>b+=c);x.on('end',()=>res(JSON.parse(b)))});r.on('error',rej);r.setTimeout(6000,()=>{r.destroy();rej(new Error('timeout'))})})}
;(async()=>{
  const l=await list()
  const t=l.find(x=>x.type==='page') || l.find(x=>x.url.includes('index.html'))
  console.log('targets:', l.map(x=>x.type+':'+x.url.slice(0,60)).join(' | '))
  if(!t){console.log('no page target');return}
  const ws=new WS(t.webSocketDebuggerUrl,{perMessageDeflate:false})
  await new Promise(r=>ws.on('open',r))
  let id=0
  const call=(m,p,to=8000)=>new Promise(res=>{const i=++id;const tm=setTimeout(()=>{ws.off('message',on);res({__t:1})},to);const on=raw=>{const x=JSON.parse(raw);if(x.id===i){clearTimeout(tm);ws.off('message',on);res(x.result||x.error)}};ws.on('message',on);ws.send(JSON.stringify({id:i,method:m,params:p}))})
  const ev=async(expr)=>{const r=await call('Runtime.evaluate',{expression:expr,returnByValue:true,awaitPromise:true});return r&&r.result?r.result.value:r}
  // 1) 加窗（用一个新 type）。统计加窗前后的面板数 & 是否每个 id 只出现一次
  const before = await ev(`JSON.stringify((function(){const cs=state.grid?state.grid.cells:[];const count={};cs.forEach(r=>r.forEach(v=>{if(!v)return;count[v]=(count[v]||0)+1}));return {cells:cs,dups:Object.entries(count).filter(([k,v])=>v>1).map(([k,v])=>k+'x'+v)}})())`)
  console.log('before:', before)
  const add = await ev(`(function(){addWindow('note');const cs=state.grid.cells;const count={};cs.forEach(r=>r.forEach(v=>{if(!v)return;count[v]=(count[v]||0)+1}));return {cells:cs,dups:Object.entries(count).filter(([k,v])=>v>1).map(([k,v])=>k+'x'+v),panels:document.querySelectorAll('.panel').length}})())`)
  console.log('after note add:', add)
  // 2) gridApplyMove 测试：把第一个面板移到第二个的右边
  const mv = await ev(`(function(){const ids=Object.keys(state.panels);if(ids.length<2)return 'need2';gridApplyMove(ids[0], ids[1], 'right');const cs=state.grid.cells;const count={};cs.forEach(r=>r.forEach(v=>{if(!v)return;count[v]=(count[v]||0)+1}));const dups=Object.entries(count).filter(([k,v])=>v>1).map(([k,v])=>k+'x'+v);return {cs,dups,panels:document.querySelectorAll('.panel').length}})())`)
  console.log('move test:', mv)
  ws.close()
})().catch(e=>console.log('ERR',e.message))