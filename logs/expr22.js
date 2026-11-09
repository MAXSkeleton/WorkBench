(function () {
  var bar = document.getElementById('taskbar');
  var btn = bar.querySelector('.lbar-item');
  var r0 = btn.getBoundingClientRect();
  btn.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r0.x + 8, clientY: r0.y + 8 }));
  var m = document.querySelector('.lbar-menu');
  if (!m) return { opened: false };
  var r = m.getBoundingClientRect();
  var cs = getComputedStyle(m);
  var top = document.elementFromPoint(r.x + r.width / 2, r.y + Math.min(10, r.height / 2));
  return {
    opened: true,
    rect: { x: r.x, y: r.y, w: r.width, h: r.height },
    style: { z: cs.zIndex, op: cs.opacity, disp: cs.display, pos: cs.position, vis: cs.visibility },
    topEl: top ? (top.className || top.tagName) : null,
    items: [].slice.call(m.children).map(function (e) { return (e.textContent || '').trim() + (e.className ? ' [' + e.className + ']' : ''); }),
    viewport: { w: innerWidth, h: innerHeight }
  };
})()