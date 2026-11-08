(async()=>{
 const P=(id)=>document.querySelector('.panel[data-panel-id="'+id+'"]')
 const snap=()=>[...document.querySelectorAll('#grid > .col')].map(c=>[...c.querySelectorAll(':scope > .panel')].map(p=>p.dataset.panelId).join('+'))
 const before=snap()
 const src=P('ai'), tgt=P('files')
 const sh=src.querySelector('.panel-head').getBoundingClientRect()
 const th=tgt.getBoundingClientRect()
 const ev=(t,el,x,y)=>el.dispatchEvent(new PointerEvent(t,{clientX:x,clientY:y,bubbles:true,button:0,buttons:1,pointerId:1,isPrimary:true}))
 ev('pointerdown',src.querySelector('.panel-head'),sh.left+40,sh.top+8)
 await new Promise(r=>setTimeout(r,40))
 ev('pointermove',document,th.right-25,th.top+th.height/2)
 await new Promise(r=>setTimeout(r,80))
 const under=document.elementFromPoint(th.right-25,th.top+th.height/2)
 const d=window.__wtDebug.drag()
 const h=document.querySelector('.drag-hint')
 const hint=h?{hidden:h.hidden,w:Math.round(parseFloat(h.style.width)||-1)}:null
 ev('pointerup',document,th.right-25,th.top+th.height/2)
 await new Promise(r=>setTimeout(r,1500))
 return {before, after:snap(), hint, under: under? (under.className||under.tagName) : null,
   state: d? {active:d.active,target:d.target,side:d.side} : null}
})()