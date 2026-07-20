(function () {
  var storageKey = 'elearning-theme';
  var root = document.documentElement;

  // Detect system preference or saved theme
  var savedTheme = window.localStorage.getItem(storageKey);
  var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  var theme = savedTheme || (prefersDark ? 'dark' : 'light');

  // Apply immediately to prevent FOUC
  if (theme === 'dark') {
    root.classList.add('dark');
  }

  // Toggle handler
  var toggle = document.querySelector('[data-theme-toggle]');
  if (toggle) {
    toggle.addEventListener('click', function () {
      var isDark = root.classList.toggle('dark');
      window.localStorage.setItem(storageKey, isDark ? 'dark' : 'light');

      // Update toggle icon accessibility
      toggle.setAttribute('aria-label', isDark ? 'Switch to light mode' : 'Switch to dark mode');
    });
  }

  // Listen for system preference changes
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function (e) {
    // Only auto-switch if user hasn't manually set a preference
    if (!window.localStorage.getItem(storageKey)) {
      if (e.matches) {
        root.classList.add('dark');
      } else {
        root.classList.remove('dark');
      }
    }
  });
})();
