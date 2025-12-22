// Swagger Theme Sync Script
(function () {
  function getStoredTheme() {
    try {
      return localStorage.getItem('theme') || 'dark';
    } catch (e) {
      return 'dark';
    }
  }

  function applyTheme(theme) {
    const existingLink = document.getElementById('swagger-theme-css');

    if (theme === 'dark') {
      if (!existingLink) {
        const link = document.createElement('link');
        link.id = 'swagger-theme-css';
        link.rel = 'stylesheet';
        link.href = '/public/swagger-dark.css';
        document.head.appendChild(link);
      }
    } else {
      if (existingLink) {
        existingLink.remove();
      }
    }
  }

  // Apply theme on load
  applyTheme(getStoredTheme());

  // Listen for theme changes from parent window
  window.addEventListener('message', function (event) {
    if (event.data && event.data.type === 'THEME_CHANGE') {
      applyTheme(event.data.theme);
    }
  });

  // Also listen for storage changes (when opened directly)
  window.addEventListener('storage', function (event) {
    if (event.key === 'theme') {
      applyTheme(event.newValue || 'dark');
    }
  });
})();
