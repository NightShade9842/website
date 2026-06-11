// ===== CONFIG =====
const API_BASE = '/api';

// ===== RUN ON PAGE LOAD =====
(function() {
    const isIndexPage = window.location.pathname === '/' || window.location.pathname.endsWith('index.html');

    // If on index page, check for token
    if (isIndexPage) {
        const urlParams = new URLSearchParams(window.location.search);
        const token = urlParams.get('token');

        if (token) {
            // Show loading
            document.getElementById('auto-login').classList.remove('hidden');
            document.getElementById('no-token').classList.add('hidden');
            loginWithToken(token);
        } else {
            // Show instructions
            document.getElementById('auto-login').classList.add('hidden');
            document.getElementById('no-token').classList.remove('hidden');
        }
        return;
    }

    // For other pages, check auth
    if (!localStorage.getItem('sabaody_token')) {
        window.location.href = 'index.html';
        return;
    }
})();

async function loginWithToken(token) {
    try {
        const res = await fetch(API_BASE + '/login?token=' + encodeURIComponent(token));
        
        if (!res.ok) {
            throw new Error('Server returned ' + res.status);
        }

        const data = await res.json();

        if (data.token) {
            localStorage.setItem('sabaody_token', data.token);
            localStorage.setItem('sabaody_user', JSON.stringify(data.user));
            window.location.href = 'profile.html';
        } else {
            showError(data.error || 'Invalid or expired link. Please get a new .login link from the bot.');
        }
    } catch (e) {
        console.error('Login error:', e);
        showError('Cannot connect to the server. Please try again later.');
    }
}

function showError(msg) {
    document.getElementById('auto-login').classList.add('hidden');
    document.getElementById('no-token').classList.add('hidden');
    document.getElementById('error-msg').classList.remove('hidden');
    document.getElementById('error-text').textContent = msg;
}

function logout() {
    localStorage.removeItem('sabaody_token');
    localStorage.removeItem('sabaody_user');
    window.location.href = 'index.html';
}

function getToken() {
    return localStorage.getItem('sabaody_token');
}

async function apiFetch(endpoint, options = {}) {
    const token = getToken();
    const headers = {
        'Content-Type': 'application/json',
        ...(token && { Authorization: `Bearer ${token}` })
    };
    const res = await fetch(API_BASE + endpoint, { ...options, headers });
    if (res.status === 401) { logout(); return null; }
    return res.json();
}