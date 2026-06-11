// ===== CONFIG =====
const API_BASE = '/api';

// ===== RUN ON PAGE LOAD =====
(function() {
    const isIndexPage = window.location.pathname === '/' || window.location.pathname.endsWith('index.html');

    if (isIndexPage) {
        const urlParams = new URLSearchParams(window.location.search);
        const token = urlParams.get('token');

        if (token) {
            document.getElementById('auto-login').classList.remove('hidden');
            document.getElementById('no-token').classList.add('hidden');
            loginWithToken(token);
        } else {
            document.getElementById('auto-login').classList.add('hidden');
            document.getElementById('no-token').classList.remove('hidden');
        }
        return;
    }

    if (!localStorage.getItem('sabaody_token')) {
        window.location.href = 'index.html';
        return;
    }

    // Load page content
    if (document.getElementById('user-stats')) loadProfile();
    if (document.getElementById('card-grid')) loadCards();
    if (document.getElementById('tab-content')) loadTabContent();
    if (document.getElementById('lb-content')) loadLeaderboard();
})();

async function loginWithToken(token) {
    try {
        const res = await fetch(API_BASE + '/login?token=' + encodeURIComponent(token));
        const data = await res.json();

        if (data.token) {
            localStorage.setItem('sabaody_token', data.token);
            localStorage.setItem('sabaody_user', JSON.stringify(data.user));
            window.location.href = 'profile.html';
        } else {
            showError(data.error || 'Invalid or expired link. Get a new .login link from the bot.');
        }
    } catch (e) {
        showError('Cannot connect to server. Try again later.');
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

// ===== PROFILE =====
async function loadProfile() {
    const user = JSON.parse(localStorage.getItem('sabaody_user'));
    if (!user) return;
    const data = await apiFetch('/profile/' + user.id);
    if (!data || data.error) return;
    document.getElementById('user-stats').innerHTML = `
        <p><span class="text-gray-400">Name:</span> ${data.pirate_name || 'Unnamed'}</p>
        <p><span class="text-gray-400">Level:</span> ${data.level}</p>
        <p class="text-yellow-400">💰 Beli: ${Number(data.beli).toLocaleString()}</p>
        <p class="text-blue-400">💎 Gems: ${data.gems}</p>
        <p class="text-purple-400">🃏 Cards: ${data.cardCount}</p>
        <p class="text-red-400">🐾 Pokémon: ${data.pokemonCount}</p>
    `;

    const cards = await apiFetch('/cards/' + user.id);
    const cardDiv = document.getElementById('recent-cards');
    if (cards && cards.length) {
        cardDiv.innerHTML = cards.slice(0, 6).map(c => `
            <div class="glass card rarity-${c.rarity?.replace(' ','')}">
                <img src="${c.image_url || 'https://via.placeholder.com/80'}" class="w-16 h-16 mx-auto rounded-lg object-cover mb-1">
                <p class="text-xs truncate">${c.card_name}</p>
                <span class="text-xs text-gray-400">${c.rarity}</span>
            </div>
        `).join('');
    } else {
        cardDiv.innerHTML = '<p class="text-gray-500">No cards yet</p>';
    }
}

// ===== CARDS =====
async function loadCards() {
    const user = JSON.parse(localStorage.getItem('sabaody_user'));
    if (!user) return;
    const cards = await apiFetch('/cards/' + user.id);
    const grid = document.getElementById('card-grid');
    if (!cards || !cards.length) {
        grid.innerHTML = '<p class="text-gray-400 col-span-full text-center py-8">No cards in collection</p>';
        return;
    }
    grid.innerHTML = cards.map(c => `
        <div class="glass card rarity-${c.rarity?.replace(' ','')}">
            <img src="${c.image_url || 'https://via.placeholder.com/120'}" class="w-full h-32 object-cover rounded-xl mb-2">
            <h3 class="text-sm font-bold truncate">${c.card_name}</h3>
            <div class="flex justify-between text-xs mt-1">
                <span>${c.rarity}</span>
                <span>⚔️${c.attack} 🛡️${c.defense}</span>
            </div>
        </div>
    `).join('');
}

// ===== STORE TABS =====
let currentTab = 'cards';

function switchTab(tab) {
    currentTab = tab;
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('tab-active'));
    document.getElementById('tab-' + tab)?.classList.add('tab-active');
    loadTabContent();
}

async function loadTabContent() {
    const container = document.getElementById('tab-content');
    if (!container) return;
    switch(currentTab) {
        case 'cards': await loadCardShop(container); break;
        case 'auctions': await loadAuctions(container); break;
        case 'events': await loadEventStore(container); break;
        case 'items': await loadItemStore(container); break;
        case 'pokemart': await loadPokeMart(container); break;
        case 'guild': await loadGuildStore(container); break;
        case 'hatchery': await loadHatchery(container); break;
    }
}

// ===== CARD SHOP =====
async function loadCardShop(container) {
    const listings = await apiFetch('/shop/cards');
    if (!listings || !listings.length) { container.innerHTML = '<p class="text-gray-400">No listings</p>'; return; }
    container.innerHTML = listings.map(l => `
        <div class="glass rounded-xl p-4 flex items-center justify-between mb-3">
            <div class="flex items-center space-x-4">
                <img src="${l.image_url || 'https://via.placeholder.com/60'}" class="w-16 h-16 rounded-lg object-cover">
                <div><p class="font-bold">${l.card_name}</p><p class="text-sm text-gray-400">${l.rarity} • ${l.seller_name}</p></div>
            </div>
            <div class="text-right">
                <p class="text-xl font-bold text-yellow-400">💰 ${Number(l.price).toLocaleString()}</p>
                <button onclick="buyCard(${l.id})" class="mt-2 bg-green-500 px-4 py-1 rounded-lg text-black font-semibold">Buy</button>
            </div>
        </div>
    `).join('');
}
async function buyCard(id) {
    const res = await apiFetch('/shop/buy', { method: 'POST', body: JSON.stringify({ listingId: id }) });
    alert(res?.success ? 'Purchased!' : res?.error || 'Failed');
    if (res?.success) switchTab('cards');
}

// ===== AUCTIONS =====
async function loadAuctions(container) {
    const auctions = await apiFetch('/auctions');
    if (!auctions || !auctions.length) { container.innerHTML = '<p class="text-gray-400">No active auctions</p>'; return; }
    container.innerHTML = auctions.map(a => `
        <div class="glass rounded-xl p-4 mb-3"><div class="flex justify-between items-center">
            <div class="flex items-center space-x-4">
                <img src="${a.image_url || 'https://via.placeholder.com/60'}" class="w-16 h-16 rounded-lg object-cover">
                <div><p class="font-bold">${a.card_name}</p><p class="text-sm text-gray-400">${Number(a.current_bid).toLocaleString()}฿</p><p class="text-xs">Ends: ${new Date(a.end_time).toLocaleString()}</p></div>
            </div>
            <div><input type="number" id="bid-${a.id}" placeholder="Bid" class="bg-gray-800 rounded px-3 py-1 text-white w-24 mb-1"><button onclick="placeBid(${a.id})" class="bg-blue-500 px-3 py-1 rounded text-white">Bid</button></div>
        </div></div>
    `).join('');
}
async function placeBid(id) {
    const amount = document.getElementById('bid-' + id).value;
    if (!amount) return alert('Enter amount');
    const res = await apiFetch('/auctions/bid', { method: 'POST', body: JSON.stringify({ auctionId: id, amount: parseInt(amount) }) });
    alert(res?.success ? 'Bid placed!' : res?.error || 'Failed');
    if (res?.success) switchTab('auctions');
}

// ===== EVENT STORE =====
async function loadEventStore(container) {
    const items = await apiFetch('/events/cards');
    if (!items || !items.length) { container.innerHTML = '<p class="text-gray-400">No event items</p>'; return; }
    container.innerHTML = items.map(i => `<div class="glass rounded-xl p-4 flex items-center justify-between mb-3"><div><p class="font-bold">${i.name}</p><p class="text-sm text-gray-400">${i.description}</p><p class="text-yellow-400">🪙 ${i.price_coins} Gold Coins</p></div><button onclick="buyEventItem(${i.id})" class="bg-yellow-500 px-4 py-2 rounded-lg text-black font-semibold">Buy</button></div>`).join('');
}
async function buyEventItem(id) {
    const res = await apiFetch('/events/buy', { method: 'POST', body: JSON.stringify({ itemId: id }) });
    alert(res?.success ? 'Purchased!' : res?.error || 'Failed');
    if (res?.success) switchTab('events');
}

// ===== ITEM STORE =====
async function loadItemStore(container) {
    const items = await apiFetch('/store/items');
    if (!items || !items.length) { container.innerHTML = '<p class="text-gray-400">No items</p>'; return; }
    container.innerHTML = items.map(i => `<div class="glass rounded-xl p-4 flex items-center justify-between mb-3"><div><p class="font-bold">${i.name}</p><p class="text-sm text-gray-400">${i.description}</p><div class="flex space-x-4 text-sm">${i.price_gems?`<span class="text-blue-400">💎 ${i.price_gems}</span>`:''}${i.price_beli?`<span class="text-yellow-400">💰 ${Number(i.price_beli).toLocaleString()}</span>`:''}</div></div><button onclick="buyStoreItem(${i.id})" class="bg-green-500 px-4 py-2 rounded-lg text-black font-semibold">Buy</button></div>`).join('');
}
async function buyStoreItem(id) {
    const res = await apiFetch('/store/buy-item', { method: 'POST', body: JSON.stringify({ itemId: id }) });
    alert(res?.success ? 'Purchased!' : res?.error || 'Failed');
    if (res?.success) switchTab('items');
}

// ===== POKéMART =====
async function loadPokeMart(container) {
    const items = await apiFetch('/store/pokemart');
    if (!items || !items.length) { container.innerHTML = '<p class="text-gray-400">Empty</p>'; return; }
    container.innerHTML = items.map(i => `<div class="glass rounded-xl p-4 flex items-center justify-between mb-3"><div><p class="font-bold">${i.name}</p><p class="text-sm text-gray-400">${i.description}</p><p class="text-yellow-400">💰 ${Number(i.price_beli).toLocaleString()}</p></div><button onclick="buyPokeMartItem(${i.id})" class="bg-blue-500 px-4 py-2 rounded-lg text-black font-semibold">Buy</button></div>`).join('');
}
async function buyPokeMartItem(id) {
    const res = await apiFetch('/store/buy-pokemart', { method: 'POST', body: JSON.stringify({ itemId: id }) });
    alert(res?.success ? 'Purchased!' : res?.error || 'Failed');
    if (res?.success) switchTab('pokemart');
}

// ===== GUILD STORE =====
async function loadGuildStore(container) {
    const items = await apiFetch('/store/guild');
    if (!items || !items.length) { container.innerHTML = '<p class="text-gray-400">Empty</p>'; return; }
    container.innerHTML = items.map(i => `<div class="glass rounded-xl p-4 flex items-center justify-between mb-3"><div><p class="font-bold">${i.name}</p><p class="text-sm text-gray-400">${i.description}</p><p class="text-purple-400">💨 ${i.price_dust} Dust</p></div><button onclick="buyGuildItem(${i.id})" class="bg-purple-500 px-4 py-2 rounded-lg text-white font-semibold">Buy</button></div>`).join('');
}
async function buyGuildItem(id) {
    const res = await apiFetch('/store/buy-guild', { method: 'POST', body: JSON.stringify({ itemId: id }) });
    alert(res?.success ? 'Purchased!' : res?.error || 'Failed');
    if (res?.success) switchTab('guild');
}

// ===== HATCHERY =====
async function loadHatchery(container) {
    const items = await apiFetch('/store/hatchery');
    if (!items || !items.length) { container.innerHTML = '<p class="text-gray-400">Empty</p>'; return; }
    const emoji = { 'Common': '⚪', 'Uncommon': '🟢', 'Rare': '🔵', 'Epic': '🟣', 'Legendary': '🟠' };
    container.innerHTML = items.map(i => `<div class="glass rounded-xl p-4 flex items-center justify-between mb-3"><div><p class="font-bold">${emoji[i.egg_rarity]||'🥚'} ${i.name}</p><p class="text-sm text-gray-400">${i.description}</p><p class="text-yellow-400">${i.price_beli?`💰 ${Number(i.price_beli).toLocaleString()}`:''} ${i.price_gems?`💎 ${i.price_gems}`:''}</p></div><button onclick="buyHatcheryItem(${i.id})" class="bg-pink-500 px-4 py-2 rounded-lg text-white font-semibold">Buy</button></div>`).join('');
}
async function buyHatcheryItem(id) {
    const res = await apiFetch('/store/buy-hatchery', { method: 'POST', body: JSON.stringify({ itemId: id }) });
    alert(res?.success ? 'Purchased!' : res?.error || 'Failed');
    if (res?.success) switchTab('hatchery');
}

// ===== LEADERBOARD =====
let currentLB = 'level';
function switchLB(type) { currentLB = type; loadLeaderboard(); }
async function loadLeaderboard() {
    const container = document.getElementById('lb-content');
    if (!container) return;
    const data = await apiFetch('/leaderboard/' + currentLB);
    if (!Array.isArray(data)) { container.innerHTML = '<p class="text-red-400">Failed</p>'; return; }
    container.innerHTML = `<table class="w-full text-left"><thead><tr class="text-gray-400 border-b border-gray-700"><th>#</th><th>Pirate</th><th>Stats</th></tr></thead><tbody>${data.map((e,i) => `<tr class="border-b border-gray-800"><td class="py-2">${i+1}</td><td class="py-2">${e.pirate_name||e.name||'?'}</td><td class="py-2">${currentLB==='level'?`Lv.${e.level}`:currentLB==='richest'?`💰 ${(e.total||0).toLocaleString()}`:`${e.count} Cards`}</td></tr>`).join('')}</tbody></table>`;
}