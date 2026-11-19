'use strict';
// Keep native select behavior while centering the selected label and chevron
// together. Measure the visible label so full-width form selects work too.
(() => {
  function init() {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) return;
    const observed = new WeakSet();
    const selector = 'select:not([multiple]):not([size])';
    let frame = 0;
    function align(select) {
      if (!select.isConnected || !select.clientWidth) return;
      const style = getComputedStyle(select);
      const text = select.selectedOptions[0]?.label || '';
      context.font = style.font;
      const spacing = parseFloat(style.letterSpacing) || 0;
      const textWidth = context.measureText(text).width + spacing * Math.max(0, [...text].length - 1);
      const available = Math.max(0, select.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight));
      const offset = text ? Math.min(textWidth, available) / 2 + 4 : 0;
      select.style.setProperty('--select-arrow-offset', offset + 'px');
    }
    const resize = new ResizeObserver(entries => entries.forEach(entry => align(entry.target)));
    function refresh() {
      frame = 0;
      document.querySelectorAll(selector).forEach(select => {
        if (!observed.has(select)) { observed.add(select); resize.observe(select); }
        align(select);
      });
    }
    function schedule() { if (!frame) frame = requestAnimationFrame(refresh); }
    document.addEventListener('change', event => { if (event.target.matches(selector)) align(event.target); }, true);
    document.addEventListener('focusin', event => { if (event.target.matches(selector)) align(event.target); });
    // Controls and options are recreated by filters, inline edits and dialogs.
    new MutationObserver(records => {
      for (const record of records) for (const node of record.removedNodes) {
        if (node.nodeType !== 1) continue;
        const removed = [...node.querySelectorAll(selector)];
        if (node.matches(selector)) removed.push(node);
        for (const select of removed) { resize.unobserve(select); observed.delete(select); }
      }
      schedule();
    }).observe(document.body, {childList:true,subtree:true,characterData:true});
    if (document.fonts) document.fonts.ready.then(schedule);
    refresh();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, {once:true});
  else init();
})();
