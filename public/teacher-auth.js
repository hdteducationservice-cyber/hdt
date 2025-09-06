// Lightweight teacher auth helper
(function() {
  const key = 'teacherToken';

  function setToken(token) {
    if (!token) return;
    localStorage.setItem(key, token);
  }

  function clearToken() {
    localStorage.removeItem(key);
  }

  function getToken() {
    return localStorage.getItem(key);
  }

  function attachAuthHeaders(options = {}) {
    options.headers = options.headers || {};
    const token = getToken();
    if (token) options.headers['Authorization'] = `Bearer ${token}`;
    return options;
  }

  async function checkSession() {
    const token = getToken();
    if (!token) return false;
    try {
      const res = await fetch('/api/teacher/profile', { headers: { 'Authorization': `Bearer ${token}` } });
      return res.ok;
    } catch (e) {
      return false;
    }
  }

  window.teacherAuth = {
    setToken,
    clearToken,
    getToken,
    attachAuthHeaders,
    checkSession
  };
})();
