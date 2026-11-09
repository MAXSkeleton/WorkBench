const fs=require('node:fs')
const http=require('node:http')
const WS=require('E:/Work/workbench/vendor/cs/code-server-4.145.2-windows-amd64/lib/vscode/node_modules/ws')
function list(){return new Promise((res,rej)=>{const r=http.get({host:'127.0.0.1',port:9555,path:'/json/list'},x=>{let b='';x.on('data',c=>b+=c);x.on('end',()=>res(JSON.parse(b)))});r.on('error',rej);r.setTimeout(6000,()=>{r.destroy();rej(new Error('timeout'))})})}
;(async()=>{
  const l=await list()
  const t=l.find(x=>x.type==='page') || l.find(x=>x.url.includes('index.html'))
  const ws=new WS(t.webSocketDebuggerUrl,{perMessageDeflate:false})
  await new Promise(r=>ws.on('open',r))
  let id=0
  const call=(m,p,to=10000)=>new Promise(res=>{const i=++id;const tm=setTimeout(()=>{ws.off('message',on);res(null)},to);const on=raw=>{const x=JSON.parse(raw);if(x.id===i){clearTimeout(tm);ws.off('message',on);res(x)}};ws.on('message',on);ws.send(JSON.stringify({id:i,method:m,params:p}))})
  const val=async(expr)=>{const r=await call('Runtime.evaluate',{expression:expr,returnByValue:true,awaitPromise:true});return r&&r.result&&r.result.result?r.result.result.value:null}
  // 打开设置弹窗
  await val(`openSettings(state.scenario)`)
  await new Promise(r=>setTimeout(r,600))
  await call('Page.enable',{},4000)
  const shot = await call('Page.captureScreenshot',{format:'png'},12000)
  if (shot && shot.result && shot.result.data) {
    fs.writeFileSync('E:/Work/workbench/logs/settings-shot2.png', Buffer.from(shot.result.data,'base64'))
    console.log('saved', shot.result.data.length)
  } else console.log('shot fail', JSON.stringify(shot).slice(0,200))
  process.exit(0)
})().catch(e=>console.log('ERR',e.message))