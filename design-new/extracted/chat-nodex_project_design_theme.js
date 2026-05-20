// Shared theme toggle. Reads ?theme=dark|light from URL or localStorage.
(function () {
  const params = new URLSearchParams(location.search);
  const fromUrl = params.get('theme');
  const saved = localStorage.getItem('nodex-theme');
  const initial = fromUrl || saved || 'light';
  if (initial === 'dark') document.documentElement.classList.add('dark');

  window.toggleTheme = function () {
    const isDark = document.documentElement.classList.toggle('dark');
    localStorage.setItem('nodex-theme', isDark ? 'dark' : 'light');
    document.querySelectorAll('[data-theme-label]').forEach((el) => {
      el.textContent = isDark ? 'Dark' : 'Light';
    });
  };

  // Helper to render a small floating theme button
  window.mountThemeFab = function () {
    const fab = document.createElement('button');
    fab.className = 'theme-fab';
    fab.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>
      <span data-theme-label>${document.documentElement.classList.contains('dark') ? 'Dark' : 'Light'}</span>
    `;
    fab.onclick = window.toggleTheme;
    document.body.appendChild(fab);
  };
})();
