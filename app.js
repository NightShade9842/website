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

    // Load page-specific content
    if (document.getElementById('user-stats')) loadProfile();
    if (document.getElementById('card-grid')) loadCards();
    if (document.getElementById('tab-content')) loadTabContent();
    if (document.getElementById('lb-content')) loadLeaderboard();
    if (document.getElementById('duel-content')) loadDuelPage();
})();

// ===== AUTH =====
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

// ===== DUELS =====
let duelPollInterval = null;
let currentDuelData = null;

async function loadDuelPage() {
    const data = await apiFetch('/duel/active');
    if (data?.active) {
        currentDuelData = data.duel;
        if (duelPollInterval) clearInterval(duelPollInterval);
        duelPollInterval = setInterval(pollDuel, 3000);
        renderBattlefield(data.duel);
    } else {
        currentDuelData = null;
        if (duelPollInterval) clearInterval(duelPollInterval);
        loadLobby();
    }
}

async function loadLobby() {
    const container = document.getElementById('duel-content');
    if (!container) return;
    const [pending, players, stats] = await Promise.all([
        apiFetch('/duel/pending'),
        apiFetch('/duel/players'),
        apiFetch('/duel/stats')
    ]);

    let html = '<div class="grid grid-cols-1 md:grid-cols-3 gap-6">';
    html += `<div class="glass rounded-xl p-5"><h3 class="text-2xl pirate mb-4">📊 Your Stats</h3><div class="space-y-3 text-sm"><div class="flex justify-between"><span>⚔️ Total</span><span class="font-bold">${stats?.total||0}</span></div><div class="flex justify-between"><span>🏆 Wins</span><span class="text-green-400 font-bold">${stats?.wins||0}</span></div><div class="flex justify-between"><span>💀 Losses</span><span class="text-red-400 font-bold">${stats?.losses||0}</span></div><div class="flex justify-between"><span>📈 Win Rate</span><span class="font-bold">${stats?.total?Math.round((stats.wins/stats.total)*100):0}%</span></div></div></div>`;
    html += `<div class="glass rounded-xl p-5"><h3 class="text-2xl pirate mb-4">📨 Challenges</h3>`;
    if (pending?.length) {
        pending.forEach(d => { html += `<div class="flex justify-between items-center bg-gray-800 rounded-lg p-3 mb-2"><div><p class="font-bold">${d.challenger_name}</p></div><div class="space-x-1"><button onclick="acceptDuel()" class="bg-green-500 text-black px-3 py-1 rounded text-sm font-bold">✓</button><button onclick="declineDuel()" class="bg-red-500 text-white px-3 py-1 rounded text-sm font-bold">✗</button></div></div>`; });
    } else { html += '<p class="text-gray-400 text-center py-4">No challenges</p>'; }
    html += '</div>';
    html += `<div class="glass rounded-xl p-5"><h3 class="text-2xl pirate mb-4">🏴‍☠️ Challenge</h3><div class="space-y-2 max-h-64 overflow-y-auto">`;
    if (players?.length) {
        players.forEach(p => { html += `<div class="flex justify-between items-center bg-gray-800 rounded-lg p-3"><div><p class="font-bold">${p.pirate_name}</p><p class="text-xs text-gray-400">Lv.${p.level}</p></div><button onclick="challengePlayer('${p.user_id}')" class="bg-yellow-500 text-black px-4 py-1 rounded text-sm font-bold">⚔️ Duel</button></div>`; });
    } else { html += '<p class="text-gray-400 text-center py-4">No players</p>'; }
    html += '</div></div></div>';
    container.innerHTML = html;
}

async function challengePlayer(opponentId) {
    const res = await apiFetch('/duel/challenge', { method: 'POST', body: JSON.stringify({ opponentId }) });
    alert(res?.success ? '⚔️ Challenge sent!' : res?.error || 'Failed');
    if (res?.success) loadDuelPage();
}
async function acceptDuel() { const res = await apiFetch('/duel/accept', { method: 'POST' }); if (res?.success) loadDuelPage(); else alert(res?.error); }
async function declineDuel() { await apiFetch('/duel/decline', { method: 'POST' }); loadLobby(); }

async function pollDuel() {
    const data = await apiFetch('/duel/active');
    if (!data?.active) { clearInterval(duelPollInterval); alert('🏁 Duel ended!'); loadDuelPage(); return; }
    currentDuelData = data.duel;
    renderBattlefield(data.duel);
}

function renderCardSlot(card, type, index) {
    if (!card) return `<div class="card-slot empty flex items-center justify-center"><span class="text-gray-600 text-xs">Slot ${index+1}</span></div>`;
    if (card.faceDown) return `<div class="card-slot face-down flex items-center justify-center"><span class="text-4xl">🂠</span></div>`;
    const imgSrc = card.img ? `/api/card-image?url=${encodeURIComponent(card.img)}` : '';
    const cardName = card.name || 'Card';
    const position = card.position || 'atk';
    const posClass = position === 'atk' ? 'pos-atk' : 'pos-def';
    const posLabel = position.toUpperCase();
    const typeClass = type === 'player' ? 'player-card glow-green' : type === 'opponent' ? 'opponent-card' : 'hand-card';
    return `<div class="card-slot ${typeClass}">
        ${imgSrc ? `<img src="${imgSrc}" alt="${cardName}" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';">` : ''}
        <div class="${imgSrc ? 'hidden' : ''} absolute inset-0 bg-gradient-to-b from-blue-900 to-blue-950 flex flex-col items-center justify-center p-1">
            <span class="text-xs font-bold text-center">${cardName.substring(0,10)}</span>
            <span class="text-yellow-400 text-xs mt-1">⚔️${card.attack}</span>
            <span class="text-blue-400 text-xs">🛡️${card.defense}</span>
        </div>
        <div class="card-stats"><div class="card-name text-white">${cardName.substring(0,12)}</div><div class="flex justify-center gap-2 text-xs"><span class="text-yellow-300">⚔️${card.attack}</span><span class="text-blue-300">🛡️${card.defense}</span></div></div>
        ${type !== 'hand' ? `<div class="card-position ${posClass}">${posLabel}</div>` : ''}
        ${type === 'player' && index !== undefined ? `<div class="absolute top-1 left-1 bg-yellow-500 text-black rounded-full w-5 h-5 flex items-center justify-center text-xs font-bold z-10">${index+1}</div>` : ''}
    </div>`;
}

function renderBattlefield(duel) {
    const container = document.getElementById('duel-content');
    if (!container) return;
    currentDuelData = duel;
    const hpPercent = (hp) => Math.max(0, Math.min(100, (hp / 4000) * 100));
    const hpColor = (hp) => hp < 1000 ? 'bg-red-500' : 'bg-green-500';
    let html = `<div class="text-center mb-6"><div class="flex justify-center items-center gap-3 mb-2 flex-wrap text-sm"><span class="text-gray-400">Turn ${duel.turnCount}</span><span class="bg-gray-700 px-3 py-1 rounded-full text-xs">${duel.phase.toUpperCase()}</span><span class="text-gray-400">🃏${duel.playerDeckCount} 💀${duel.playerGrave}</span></div>${duel.isMyTurn ? '<p class="text-green-400 font-bold text-lg pulse">▶ YOUR TURN</p>' : '<p class="text-yellow-400 text-lg">⏳ Waiting...</p>'}</div>
    <div class="mb-6"><div class="flex justify-between items-center mb-2"><p class="font-bold text-lg">👤 ${duel.opponent}</p><p class="font-bold">❤️ ${duel.opponentHP} / 4000</p></div><div class="hp-bar-bg mb-4"><div class="hp-bar ${hpColor(duel.opponentHP)}" style="width:${hpPercent(duel.opponentHP)}%"></div></div><div class="flex gap-2 justify-center flex-wrap">`;
    for (let i = 0; i < 5; i++) html += renderCardSlot(duel.opponentField?.[i], 'opponent', i);
    html += `</div></div><div class="text-center py-4 border-y border-gray-700 my-6"><p class="text-yellow-400 text-xl pirate">⚔️ BATTLEFIELD ⚔️</p>${duel.lastAction ? `<p class="text-sm text-gray-200 mt-2 bg-gray-800 rounded-lg px-4 py-2 inline-block">${duel.lastAction}</p>` : ''}</div>
    <div class="mb-6"><div class="flex gap-2 justify-center flex-wrap mb-4">`;
    for (let i = 0; i < 5; i++) html += renderCardSlot(duel.playerField?.[i], 'player', i);
    html += `</div><div class="flex justify-between items-center mb-2"><p class="font-bold text-lg">👤 You</p><p class="font-bold">❤️ ${duel.playerHP} / 4000</p></div><div class="hp-bar-bg"><div class="hp-bar ${hpColor(duel.playerHP)}" style="width:${hpPercent(duel.playerHP)}%"></div></div></div>
    <div class="mb-6"><p class="text-sm text-gray-400 mb-3">🃏 Your Hand (${duel.playerHand?.length||0} cards)</p><div class="flex gap-2 flex-wrap justify-center">`;
    if (duel.playerHand?.length) { duel.playerHand.forEach((c, i) => html += renderCardSlot(c, 'hand', i)); }
    else html += '<p class="text-gray-500 text-sm">No cards in hand</p>';
    html += `</div></div>`;
    if (duel.isMyTurn) {
        html += `<div class="flex gap-2 justify-center flex-wrap mt-6 pt-4 border-t border-gray-700">`;
        if (duel.phase === 'draw') html += `<button onclick="duelAction('draw')" class="btn btn-blue">📥 Draw</button>`;
        html += `<button onclick="duelAction('summon')" class="btn btn-gold">⚔️ Summon</button><button onclick="duelAction('attack')" class="btn btn-red">💥 Attack</button><button onclick="duelAction('set')" class="btn btn-purple">🛡️ Set</button><button onclick="duelAction('endturn')" class="btn btn-green">🏁 End Turn</button></div>`;
    }
    html += `<div class="text-center mt-6"><button onclick="duelAction('surrender')" class="bg-gray-700 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm transition">🏳️ Surrender</button></div>`;
    container.innerHTML = html;
}

async function duelAction(action) {
    let body = {};
    if (action === 'summon') { const slot = prompt('Hand slot? (1-'+(currentDuelData?.playerHand?.length||7)+'):'); if (!slot||isNaN(slot)) return; const pos = prompt('Position? (atk/def):','atk'); if (!pos||!['atk','def'].includes(pos.toLowerCase())) return alert('Use atk or def'); body = { handSlot: parseInt(slot)-1, position: pos.toLowerCase() }; }
    else if (action === 'attack') { const slot = prompt('Your monster slot? (1-5):'); if (!slot||isNaN(slot)) return; const target = prompt('Target slot? (1-5, blank for direct):'); body = { fieldSlot: parseInt(slot)-1 }; if (target&&!isNaN(target)) body.targetSlot = parseInt(target)-1; }
    else if (action === 'set') { const slot = prompt('Hand slot? (1-'+(currentDuelData?.playerHand?.length||7)+'):'); if (!slot||isNaN(slot)) return; body = { handSlot: parseInt(slot)-1 }; }
    const endpoints = { draw:'/duel/draw', summon:'/duel/summon', attack:'/duel/attack', set:'/duel/set', endturn:'/duel/endturn', surrender:'/duel/surrender' };
    const res = await apiFetch(endpoints[action], { method:'POST', body:JSON.stringify(body) });
    if (res?.success) { if (res.result?.gameOver) alert('🏆 VICTORY! +1000฿ +50 XP'); await pollDuel(); }
    else if (res?.error) alert('❌ '+res.error);
}

window.addEventListener('beforeunload', () => { if (duelPollInterval) clearInterval(duelPollInterval); });