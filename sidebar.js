'use strict';
(() => {
  const storageKey = 'work-rhythm-sidebar-collapsed';
  let collapsed = false;
  try { collapsed = localStorage.getItem(storageKey) === 'true'; } catch { /* Keep the default layout when storage is restricted. */ }
  function apply() {
    document.documentElement.dataset.sidebar = collapsed ? 'collapsed' : 'expanded';
    const sidebar = document.getElementById('sidebar');
    const button = document.getElementById('sidebarToggle');
    if (sidebar) sidebar.hidden = collapsed;
    if (button) {
      button.textContent = collapsed ? '☰ 展開側邊欄' : '☰ 收起側邊欄';
      button.setAttribute('aria-expanded', String(!collapsed));
      button.title = collapsed ? '展開側邊欄' : '收起側邊欄';
    }
  }
  apply();
  document.addEventListener('DOMContentLoaded', () => {
    apply();
    document.getElementById('sidebarToggle').addEventListener('click', () => {
      collapsed = !collapsed;
      apply();
      try { localStorage.setItem(storageKey, String(collapsed)); } catch { /* Switching still works for this page. */ }
    });
  });
  window.addEventListener('storage', event => {
    if (event.key === storageKey) { collapsed = event.newValue === 'true'; apply(); }
  });
})();
