// Shared by every admin page. Keeps the staff logged-in check and makes
// sure every /api/ call carries the staff username so the server can
// verify the request is really coming from a logged-in admin/registrar.
(function () {
  const user = JSON.parse(localStorage.getItem('bjUser') || 'null');
  const onLoginPage = location.pathname.endsWith('/admin/login.html');
  if (!user && !onLoginPage) { location.href = '/admin/login.html'; return; }
  window.bjUser = user;

  const originalFetch = window.fetch.bind(window);
  window.fetch = (url, opts = {}) => {
    if (typeof url === 'string' && url.startsWith('/api/') && user) {
      opts = { ...opts, headers: { ...(opts.headers || {}), 'x-bj-username': user.username } };
    }
    return originalFetch(url, opts);
  };

  window.bjLogout = function () {
    localStorage.removeItem('bjUser');
    location.href = '/admin/login.html';
  };

  window.bjFmtDate = d => d ? new Date(d).toLocaleDateString() : '—';
})();
