(function exposeNavigation(root, factory) {
  const navigation = factory();
  if (typeof module === 'object' && module.exports) module.exports = navigation;
  else root.MasterListNavigation = navigation;
}(typeof globalThis !== 'undefined' ? globalThis : this, function createNavigationModule() {
  function initNavigation({ document, location }) {
    const toggle = document.querySelector('#mobile-menu-toggle');
    const nav = document.querySelector('#site-nav');

    toggle?.addEventListener('click', () => {
      const open = nav.classList.toggle('is-open');
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
    });

    nav?.querySelectorAll('a').forEach((link) => {
      if (link.pathname === location.pathname) link.setAttribute('aria-current', 'page');
      link.addEventListener('click', () => {
        nav.classList.remove('is-open');
        toggle?.setAttribute('aria-expanded', 'false');
        toggle?.setAttribute('aria-label', 'Open navigation');
      });
    });

    return { toggle, nav };
  }

  return { initNavigation };
}));
