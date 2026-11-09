const http=require('node:http')
const WS=require('E:/Work/workbench/vendor/cs/code-server-4.145.2-windows-amd64/lib/vscode/node_modules/ws')
function list(){return new Promise((res,rej)=>{const r=http.get({host:'127.0.0.1',port:9555,path:'/json/list'},x=>{let b='';x.on('data',c=>b+=c);x.on('end',()=>res(JSON.parse(b)))});r.on('error',rej);r.setTimeout(6000,()=>{r.destroy();rej(new Error('timeout'))})})}
;(async()=>{
  const l=await list()
  const t=l.find(x=>x.type==='page') || l.find(x=>x.url.includes('index.html'))
  const ws=new WS(t.webSocketDebuggerUrl,{perMessageDeflate:false})
  await new Promise(r=>ws.on('open',r))
  let id=0
  const call=(m,p,to=8000)=>new Promise(res=>{const i=++id;const tm=setTimeout(()=>{ws.off('message',on);res({})},to);const on=raw=>{const x=JSON.parse(raw);if(x.id===i){clearTimeout(tm);ws.off('message',on);res(x.result||x.error)}};ws.on('message',on);ws.send(JSON.stringify({id:i,method:m,params:p}))})
  const ev=async(expr)=>{const r=await call('Runtime.evaluate',{expression:expr,returnByValue:true,awaitPromise:true});return r&&r.result?r.result.value:r}
  // 当前 cells + 每个面板是否只占一格（非跨格）+ 面板 DOM 数
  const st = await ev(`JSON.stringify((function(){const cs=state.grid?state.grid.cells:[];const count={};cs.forEach(r=>r.forEach(v=>{if(!v)return;count[v]=(count[v]||0)+1}));const dups=Object.entries(count).filter(([k,v])=>v>1).map(([k,v])=>k+'x'+v);return{cs,dups,dom:document.querySelectorAll('.panel').length,ids:Object.keys(state.panels)}})())`)
  console.log('grid:', st)
  ws.close()
})().catch(e=>console.log('ERR',e.message))