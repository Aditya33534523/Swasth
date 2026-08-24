// Apply the saved or system theme before React paints.
(function () {
  const stored = localStorage.getItem('swasthsetu-theme');
  if (stored === 'dark' || (!stored && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
    document.documentElement.classList.add('dark');
  }
})();
