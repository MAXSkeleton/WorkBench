const http=require('node:http')
const WS=require('E:/Work/workbench/vendor/cs/code-server-4.145.2-windows-amd64/lib/vscode/node_modules/ws')
function list(){return new Promise((res,rej)=>{const r=http.get({host:'127.0.0.1',port:9555,path:'/json/list'},x=>{let b='';x.on('data',c=>b+=c);x.on('end',()=>res(JSON.parse(b)))});r.on('error',rej);r.setTimeout(6000,()=>{r.destroy();rej(new Error('timeout'))})})}
;(async()=>{
  const l=await list()
  const t=l.find(x=>x.type==='page') || l.find(x=>x.url.includes('index.html'))
  const ws=new WS(t.webSocketDebuggerUrl,{perMessageDeflate:false})
  await new Promise(r=>ws.on('open',r))
  let id=0
  const call=(m,p,to=8000)=>new Promise(res=>{const i=++id;const tm=setTimeout(()=>{ws.off('message',on);res({})},to);const on=raw=>{const x=JSON.parse(raw);if(x.id===i){clearTimeout(tm);ws.off('message',on);res(x)}};ws.on('message',on);ws.send(JSON.stringify({id:i,method:m,params:p}))})
  const ev=async(expr)=>{const r=await call('Runtime.evaluate',{expression:expr,returnByValue:true,awaitPromise:true});return r}
  const r = await ev(`(function(){try{const ids=Object.keys(state.panels);return 'ids='+ids.length+' first='+ids[0]+' second='+ids[1]}catch(e){return 'ERR-init:'+e.message}})()`)
  console.log(JSON.stringify(r.result.result))
  ws.close()
})().catch(e=>console.log('ERR',e.message))