'use strict';
(() => {
  const storageKey = 'work-rhythm-theme';
  let theme = 'light';
  try { if (localStorage.getItem(storageKey) === 'dark') theme = 'dark'; } catch { /* Storage may be restricted. */ }
  function apply() {
    document.documentElement.dataset.theme = theme;
    const button = document.getElementById('themeToggle');
    if (button) {
      button.textContent = theme === 'dark' ? '☀ 淺色模式' : '☾ 深色模式';
      button.setAttribute('aria-label', theme === 'dark' ? '切換為淺色模式' : '切換為深色模式');
      button.title = theme === 'dark' ? '切換為淺色模式' : '切換為深色模式';
    }
  }
  apply(); // Apply the saved theme before the stylesheet paints the page.
  document.addEventListener('DOMContentLoaded', () => {
    apply();
    document.getElementById('themeToggle').addEventListener('click', () => {
      theme = theme === 'dark' ? 'light' : 'dark';
      apply();
      try { localStorage.setItem(storageKey, theme); } catch { /* Keep the current session's choice. */ }
    });
  });
  window.addEventListener('storage', event => {
    if (event.key === storageKey) { theme = event.newValue === 'dark' ? 'dark' : 'light'; apply(); }
  });
})();
