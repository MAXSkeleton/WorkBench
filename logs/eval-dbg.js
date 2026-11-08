(async()=>{
 const hd=document.querySelector('.panel[data-panel-id="ai"] .panel-head')
 const r=hd.getBoundingClientRect()
 hd.dispatchEvent(new PointerEvent('pointerdown',{clientX:r.left+40,clientY:r.top+8,bubbles:true,button:0,buttons:1,pointerId:1,isPrimary:true}))
 await new Promise(x=>setTimeout(x,50))
 const d1 = window.__wtDebug ? window.__wtDebug.drag() : null
 document.dispatchEvent(new PointerEvent('pointermove',{clientX:r.left+200,clientY:r.top+200,bubbles:true,button:0,buttons:1,pointerId:1,isPrimary:true}))
 await new Promise(x=>setTimeout(x,60))
 const d2 = window.__wtDebug ? window.__wtDebug.drag() : null
 return {d1: d1 && {id:d1.id,active:d1.active}, d2: d2 && {id:d2.id,active:d2.active,target:d2.target,side:d2.side}}
})()