'use strict';
let taskSortDrag = null;
let taskSortSuppressClickUntil = 0;
function moveVisibleTask(sourceId, targetId, after) {
  const visible = filtered().map(task => task.id);
  if (sourceId === targetId || !visible.includes(sourceId) || !visible.includes(targetId)) return false;
  const ordered = visible.filter(id => id !== sourceId);
  ordered.splice(ordered.indexOf(targetId) + (after ? 1 : 0), 0, sourceId);
  if (ordered.every((id,i) => id === visible[i])) return false;
  const visibleSet = new Set(visible), tasks = new Map(data.tasks.map(task => [task.id,task]));
  let index = 0;
  // Only replace visible slots. Hidden work and other years retain their places.
  data.tasks = data.tasks.map(task => visibleSet.has(task.id) ? tasks.get(ordered[index++]) : task);
  const saved = persist();
  render();
  const handle = [...document.querySelectorAll('[data-sort-task]')].find(el => el.dataset.sortTask === sourceId);
  if (handle) handle.focus({preventScroll:true});
  if (saved) toast('排序已儲存，目前顯示順序第 '+(ordered.indexOf(sourceId)+1)+' 項');
  return true;
}
function clearTaskSortTarget() {
  document.querySelectorAll('.sort-before,.sort-after').forEach(row => row.classList.remove('sort-before','sort-after'));
}
function updateTaskSortTarget() {
  const drag = taskSortDrag;
  if (!drag?.dragging) return;
  clearTaskSortTarget();
  const row = document.elementFromPoint(drag.x,drag.y)?.closest('#content tbody tr[data-id]');
  drag.target = null;
  if (!row || row.dataset.id === drag.id) return;
  const rect = row.getBoundingClientRect();
  drag.target = row.dataset.id;
  drag.after = drag.y > rect.top + rect.height / 2;
  row.classList.add(drag.after ? 'sort-after' : 'sort-before');
}
function stopTaskSort() {
  const drag = taskSortDrag;
  if (!drag) return;
  taskSortDrag = null;
  cancelAnimationFrame(drag.frame);
  drag.ghost?.remove();
  drag.row.classList.remove('sort-dragging');
  document.body.classList.remove('task-sorting');
  clearTaskSortTarget();
  if (drag.handle.hasPointerCapture(drag.pointer)) drag.handle.releasePointerCapture(drag.pointer);
}
function tickTaskSort() {
  const drag = taskSortDrag;
  if (!drag?.dragging) return;
  const edge = 60;
  if (drag.y < edge) window.scrollBy(0,-12);
  else if (drag.y > innerHeight-edge) window.scrollBy(0,12);
  updateTaskSortTarget();
  drag.frame = requestAnimationFrame(tickTaskSort);
}
function bindTaskSorting() {
  document.querySelectorAll('[data-sort-task]').forEach(handle => {
    handle.onclick = event => { event.preventDefault(); event.stopPropagation(); };
    handle.onkeydown = event => {
      event.stopPropagation();
      if (!['ArrowUp','ArrowDown'].includes(event.key)) return;
      event.preventDefault();
      const visible = filtered().map(task => task.id), index = visible.indexOf(handle.dataset.sortTask);
      const next = index + (event.key === 'ArrowUp' ? -1 : 1);
      if (next >= 0 && next < visible.length) {
        moveVisibleTask(visible[index],visible[next],event.key === 'ArrowDown');
        [...document.querySelectorAll('[data-sort-task]')].find(el => el.dataset.sortTask === visible[index])?.scrollIntoView({block:'nearest',inline:'nearest'});
      }
    };
    handle.onpointerdown = event => {
      if (taskSortDrag || !event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0)) return;
      event.preventDefault(); event.stopPropagation(); handle.focus({preventScroll:true});
      taskSortDrag = {id:handle.dataset.sortTask,handle,row:handle.closest('tr'),pointer:event.pointerId,startX:event.clientX,startY:event.clientY,x:event.clientX,y:event.clientY,dragging:false,target:null,after:false,frame:0};
      handle.setPointerCapture(event.pointerId);
    };
    handle.onpointermove = event => {
      const drag = taskSortDrag;
      if (!drag || drag.pointer !== event.pointerId) return;
      drag.x = event.clientX; drag.y = event.clientY;
      if (!drag.dragging && Math.hypot(drag.x-drag.startX,drag.y-drag.startY) < 6) return;
      event.preventDefault();
      if (!drag.dragging) {
        drag.dragging = true;
        drag.row.classList.add('sort-dragging');document.body.classList.add('task-sorting');
        drag.ghost = document.createElement('div');drag.ghost.className = 'task-drag-ghost';
        drag.ghost.textContent = data.tasks.find(task => task.id === drag.id)?.title || '移動工項';
        document.body.appendChild(drag.ghost);drag.frame=requestAnimationFrame(tickTaskSort);
      }
      drag.ghost.style.left = Math.max(8,Math.min(drag.x+14,innerWidth-230))+'px';
      drag.ghost.style.top = Math.max(8,Math.min(drag.y+14,innerHeight-55))+'px';
      updateTaskSortTarget();
    };
    handle.onpointerup = event => {
      const drag = taskSortDrag;
      if (!drag || drag.pointer !== event.pointerId) return;
      if (drag.dragging) { event.preventDefault();taskSortSuppressClickUntil=performance.now()+300; }
      const target=drag.target,after=drag.after,source=drag.id;
      stopTaskSort();
      if (target) moveVisibleTask(source,target,after);
    };
    handle.onpointercancel = stopTaskSort;
    handle.onlostpointercapture = () => {if(taskSortDrag?.handle===handle)stopTaskSort();};
  });
}
document.addEventListener('keydown',event=>{
  if (event.key==='Escape' && taskSortDrag) {event.preventDefault();stopTaskSort();}
},true);
document.addEventListener('click',event=>{
  if (performance.now()<taskSortSuppressClickUntil && event.target.closest('#content tbody')) {event.preventDefault();event.stopImmediatePropagation();}
},true);
