const API = '/api'; // Vercel will map /api to serverless functions

// Auth helpers
function getToken() { return localStorage.getItem('token'); }
function getUser() { return JSON.parse(localStorage.getItem('user') || 'null'); }

function saveAuth(token, user) {
  localStorage.setItem('token', token);
  localStorage.setItem('user', JSON.stringify(user));
}

function logout() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  window.location.href = '/';
}

async function apiFetch(url, options = {}) {
  const token = getToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(token && { Authorization: `Bearer ${token}` }),
    ...options.headers
  };
  const res = await fetch(`${API}${url}`, { ...options, headers });
  return res.json();
}

// Check if logged in (for pages that require auth)
function requireAuth() {
  if (!getToken()) window.location.href = '/';
}

// Render navbar if logged in
function renderNavbar() {
  const user = getUser();
  if (!user) return '';
  return `
    <nav class="navbar">
      <a href="/dashboard.html" class="text-gold">⚓ SABAODY</a>
      <div>
        <a href="/profile.html">Profile</a>
        <a href="/store.html">Store</a>
        <a href="/guild.html">Guild</a>
        <a href="/cards.html">Cards</a>
        <a href="/pokemon.html">Pokémon</a>
        <button onclick="logout()" style="background:none; border:none; color:#ffd700; cursor:pointer;">Logout</button>
      </div>
    </nav>
  `;
}

// On page load, inject navbar
document.addEventListener('DOMContentLoaded', () => {
  const nav = document.getElementById('navbar');
  if (nav) nav.innerHTML = renderNavbar();
});