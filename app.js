// ===== CONFIG =====
const API_BASE = '/api';

// ===== AUTO‑LOGIN via token (from .login link) =====
window.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('token');
    if (token) {
        document.getElementById('auto-login')?.classList.remove('hidden');
        document.getElementById('no-token')?.classList.add('hidden');
        loginWithToken(token);
    } else {
        document.getElementById('auto-login')?.classList.add('hidden');
        document.getElementById('no-token')?.classList.remove('hidden');
    }
});

async function loginWithToken(token) {
    try {
        const res = await fetch(API_BASE + '/login?token=' + encodeURIComponent(token));
        const data = await res.json();
        if (data.token) {
            localStorage.setItem('sabaody_token', data.token);
            localStorage.setItem('sabaody_user', JSON.stringify(data.user));
            window.location.href = 'profile.html';
        } else {
            alert(data.error || 'Invalid or expired link. Get a new .login link.');
            document.getElementById('auto-login')?.classList.add('hidden');
            document.getElementById('no-token')?.classList.remove('hidden');
        }
    } catch (e) {
        alert('Connection error. Try again later.');
        document.getElementById('auto-login')?.classList.add('hidden');
        document.getElementById('no-token')?.classList.remove('hidden');
    }
}

// ===== LOGOUT =====
function logout() {
    localStorage.removeItem('sabaody_token');
    localStorage.removeItem('sabaody_user');
    window.location = 'index.html';
}

// ===== API HELPER =====
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
    if (res.status === 401) {
        logout();
        return null;
    }
    return res.json();
}

// ===== PROFILE =====
async function loadProfile() {
    const user = JSON.parse(localStorage.getItem('sabaody_user'));
    if (!user) return;
    const data = await apiFetch('/profile/' + user.id);
    if (!data || data.error) return alert(data?.error || 'Failed');
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

    document.getElementById('pokemon-party').innerHTML = '<p class="text-gray-400">Party info coming soon</p>';
}

// ===== CARDS COLLECTION =====
async function loadCards() {
    const user = JSON.parse(localStorage.getItem('sabaody_user'));
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

// ===== STORE TABS LOGIC =====
function switchTab(tab) {
    currentTab = tab;
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('tab-active'));
    const btn = document.getElementById('tab-' + tab);
    if (btn) btn.classList.add('tab-active');
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

let currentTab = 'cards';

document.addEventListener('DOMContentLoaded', () => {
    if (!localStorage.getItem('sabaody_token')) window.location = 'index.html';
    if (document.getElementById('tab-content')) loadTabContent();
});

// ===== CARD SHOP (player marketplace) =====
async function loadCardShop(container) {
    const listings = await apiFetch('/shop/cards');
    if (!listings || !listings.length) {
        container.innerHTML = '<p class="text-gray-400">No listings</p>';
        return;
    }
    container.innerHTML = listings.map(l => `
        <div class="glass rounded-xl p-4 flex items-center justify-between mb-3">
            <div class="flex items-center space-x-4">
                <img src="${l.image_url || 'https://via.placeholder.com/60'}" class="w-16 h-16 rounded-lg object-cover">
                <div>
                    <p class="font-bold">${l.card_name}</p>
                    <p class="text-sm text-gray-400">${l.rarity} • Seller: ${l.seller_name}</p>
                </div>
            </div>
            <div class="text-right">
                <p class="text-xl font-bold text-yellow-400">💰 ${Number(l.price).toLocaleString()}</p>
                <button onclick="buyCard(${l.id})" class="mt-2 bg-green-500 px-4 py-1 rounded-lg text-black font-semibold hover:bg-green-400">Buy</button>
            </div>
        </div>
    `).join('');
}

async function buyCard(listingId) {
    const res = await apiFetch('/shop/buy', {
        method: 'POST',
        body: JSON.stringify({ listingId })
    });
    if (res?.success) {
        alert('Card purchased!');
        switchTab('cards');
    } else {
        alert(res?.error || 'Purchase failed');
    }
}

// ===== AUCTIONS =====
async function loadAuctions(container) {
    const auctions = await apiFetch('/auctions');
    if (!auctions || !auctions.length) {
        container.innerHTML = '<p class="text-gray-400">No active auctions</p>';
        return;
    }
    container.innerHTML = auctions.map(a => `
        <div class="glass rounded-xl p-4 mb-3">
            <div class="flex justify-between items-center">
                <div class="flex items-center space-x-4">
                    <img src="${a.image_url || 'https://via.placeholder.com/60'}" class="w-16 h-16 rounded-lg object-cover">
                    <div>
                        <p class="font-bold">${a.card_name}</p>
                        <p class="text-sm text-gray-400">Current Bid: ${Number(a.current_bid).toLocaleString()}฿</p>
                        <p class="text-xs">Ends: ${new Date(a.end_time).toLocaleString()}</p>
                    </div>
                </div>
                <div>
                    <input type="number" id="bid-${a.id}" placeholder="Your bid" class="bg-gray-800 rounded px-3 py-1 text-white w-24 mb-1">
                    <button onclick="placeBid(${a.id})" class="bg-blue-500 px-3 py-1 rounded text-white hover:bg-blue-400">Bid</button>
                </div>
            </div>
        </div>
    `).join('');
}

async function placeBid(auctionId) {
    const amount = document.getElementById('bid-' + auctionId).value;
    if (!amount) return alert('Enter bid amount');
    const res = await apiFetch('/auctions/bid', {
        method: 'POST',
        body: JSON.stringify({ auctionId, amount: parseInt(amount) })
    });
    if (res?.success) {
        alert('Bid placed!');
        switchTab('auctions');
    } else {
        alert(res?.error || 'Bid failed');
    }
}

// ===== EVENT STORE =====
async function loadEventStore(container) {
    const items = await apiFetch('/events/cards');
    if (!items || !items.length) {
        container.innerHTML = '<p class="text-gray-400">No event items</p>';
        return;
    }
    container.innerHTML = items.map(item => `
        <div class="glass rounded-xl p-4 flex items-center justify-between mb-3">
            <div>
                <p class="font-bold">${item.name}</p>
                <p class="text-sm text-gray-400">${item.description}</p>
                <p class="text-yellow-400">🪙 ${item.price_coins} Gold Coins</p>
            </div>
            <button onclick="buyEventItem(${item.id})" class="bg-yellow-500 px-4 py-2 rounded-lg text-black font-semibold hover:bg-yellow-400">Buy</button>
        </div>
    `).join('');
}

async function buyEventItem(itemId) {
    const res = await apiFetch('/events/buy', {
        method: 'POST',
        body: JSON.stringify({ itemId })
    });
    if (res?.success) {
        alert('Purchased!');
        switchTab('events');
    } else {
        alert(res?.error || 'Purchase failed');
    }
}

// ===== ITEM STORE (Beli/Gems) =====
async function loadItemStore(container) {
    const items = await apiFetch('/store/items');
    if (!items || !items.length) {
        container.innerHTML = '<p class="text-gray-400">No items</p>';
        return;
    }
    container.innerHTML = items.map(item => `
        <div class="glass rounded-xl p-4 flex items-center justify-between mb-3">
            <div>
                <p class="font-bold">${item.name}</p>
                <p class="text-sm text-gray-400">${item.description}</p>
                <div class="flex space-x-4 text-sm">
                    ${item.price_gems ? `<span class="text-blue-400">💎 ${item.price_gems} Gems</span>` : ''}
                    ${item.price_beli ? `<span class="text-yellow-400">💰 ${Number(item.price_beli).toLocaleString()} Beli</span>` : ''}
                </div>
            </div>
            <button onclick="buyStoreItem(${item.id})" class="bg-green-500 px-4 py-2 rounded-lg text-black font-semibold hover:bg-green-400">Buy</button>
        </div>
    `).join('');
}

async function buyStoreItem(itemId) {
    const res = await apiFetch('/store/buy-item', {
        method: 'POST',
        body: JSON.stringify({ itemId })
    });
    if (res?.success) {
        alert('Item purchased!');
        switchTab('items');
    } else {
        alert(res?.error || 'Purchase failed');
    }
}

// ===== POKéMART =====
async function loadPokeMart(container) {
    const items = await apiFetch('/store/pokemart');
    if (!items || !items.length) {
        container.innerHTML = '<p class="text-gray-400">PokéMart is empty.</p>';
        return;
    }
    container.innerHTML = items.map(item => `
        <div class="glass rounded-xl p-4 flex items-center justify-between mb-3">
            <div>
                <p class="font-bold">${item.name}</p>
                <p class="text-sm text-gray-400">${item.description}</p>
                <p class="text-yellow-400">💰 ${Number(item.price_beli).toLocaleString()} Beli</p>
                <p class="text-xs text-gray-500">Qty: ${item.quantity_per_purchase}</p>
            </div>
            <button onclick="buyPokeMartItem(${item.id})" class="bg-blue-500 px-4 py-2 rounded-lg text-black font-semibold hover:bg-blue-400">Buy</button>
        </div>
    `).join('');
}

async function buyPokeMartItem(itemId) {
    const res = await apiFetch('/store/buy-pokemart', {
        method: 'POST',
        body: JSON.stringify({ itemId })
    });
    if (res?.success) {
        alert('Purchased! Added to inventory.');
        switchTab('pokemart');
    } else {
        alert(res?.error || 'Purchase failed');
    }
}

// ===== GUILD STORE =====
async function loadGuildStore(container) {
    const items = await apiFetch('/store/guild');
    if (!items || !items.length) {
        container.innerHTML = '<p class="text-gray-400">Guild store is empty.</p>';
        return;
    }
    container.innerHTML = items.map(item => `
        <div class="glass rounded-xl p-4 flex items-center justify-between mb-3">
            <div>
                <p class="font-bold">${item.name}</p>
                <p class="text-sm text-gray-400">${item.description}</p>
                <p class="text-purple-400">💨 ${item.price_dust} Dust</p>
            </div>
            <button onclick="buyGuildItem(${item.id})" class="bg-purple-500 px-4 py-2 rounded-lg text-white font-semibold hover:bg-purple-400">Buy</button>
        </div>
    `).join('');
}

async function buyGuildItem(itemId) {
    const res = await apiFetch('/store/buy-guild', {
        method: 'POST',
        body: JSON.stringify({ itemId })
    });
    if (res?.success) {
        alert('Purchased!');
        switchTab('guild');
    } else {
        alert(res?.error || 'Purchase failed');
    }
}

// ===== HATCHERY =====
async function loadHatchery(container) {
    const items = await apiFetch('/store/hatchery');
    if (!items || !items.length) {
        container.innerHTML = '<p class="text-gray-400">Hatchery is empty.</p>';
        return;
    }
    const rarityEmoji = { 'Common': '⚪', 'Uncommon': '🟢', 'Rare': '🔵', 'Epic': '🟣', 'Legendary': '🟠' };
    container.innerHTML = items.map(item => {
        let priceText = '';
        if (item.price_beli) priceText += `💰 ${Number(item.price_beli).toLocaleString()} Beli `;
        if (item.price_gems) priceText += `💎 ${item.price_gems} Gems `;
        priceText = priceText.trim() || 'Free';
        return `
            <div class="glass rounded-xl p-4 flex items-center justify-between mb-3">
                <div>
                    <p class="font-bold">${rarityEmoji[item.egg_rarity] || '🥚'} ${item.name}</p>
                    <p class="text-sm text-gray-400">${item.description}</p>
                    <p class="text-yellow-400">${priceText}</p>
                    <p class="text-xs text-gray-500">🐣 ${item.egg_rarity} Pokémon (×${item.pokemon_count})</p>
                </div>
                <button onclick="buyHatcheryItem(${item.id})" class="bg-pink-500 px-4 py-2 rounded-lg text-white font-semibold hover:bg-pink-400">Buy</button>
            </div>
        `;
    }).join('');
}

async function buyHatcheryItem(itemId) {
    const res = await apiFetch('/store/buy-hatchery', {
        method: 'POST',
        body: JSON.stringify({ itemId })
    });
    if (res?.success) {
        alert('Egg added to inventory!');
        switchTab('hatchery');
    } else {
        alert(res?.error || 'Purchase failed');
    }
}

// ===== LEADERBOARD =====
let currentLB = 'level';
function switchLB(type) {
    currentLB = type;
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('tab-active'));
    document.getElementById('lb-' + type).classList.add('tab-active');
    loadLeaderboard();
}
async function loadLeaderboard() {
    const container = document.getElementById('lb-content');
    if (!container) return;
    container.innerHTML = 'Loading...';
    const data = await apiFetch('/leaderboard/' + currentLB);
    if (Array.isArray(data)) {
        const rows = data.map((e,i) => {
            let info = '';
            if (currentLB === 'level') info = `Level ${e.level} (XP: ${e.xp})`;
            else if (currentLB === 'richest') info = `💰 ${e.total ? e.total.toLocaleString() : (e.beli+e.bank).toLocaleString()}`;
            else if (currentLB === 'legendary') info = `${e.count} Legendary Cards`;
            else if (currentLB === 'guild') info = `Treasury: ${e.treasury?.toLocaleString()}, Members: ${e.members}`;
            return `<tr class="border-b border-gray-800">
                <td class="py-2">${i+1}</td>
                <td class="py-2">${e.pirate_name || e.name || 'Unknown'}</td>
                <td class="py-2">${info}</td>
            </tr>`;
        }).join('');
        container.innerHTML = `<table class="w-full text-left"><thead><tr class="text-gray-400 border-b border-gray-700"><th>#</th><th>Pirate</th><th>Stats</th></tr></thead><tbody>${rows}</tbody></table>`;
    } else {
        container.innerHTML = '<p class="text-red-400">Failed to load leaderboard</p>';
    }
}
document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('lb-content')) loadLeaderboard();
});

// ===== BOARD WAR =====
let currentBoardTab = 'lobby';
let currentWarId = null;
let pollInterval = null;

function switchBoardTab(tab) {
    currentBoardTab = tab;
    document.querySelectorAll('.board-tab-btn').forEach(b => b.classList.remove('tab-active'));
    document.getElementById('boardtab-' + tab)?.classList.add('tab-active');
    loadBoardContent();
}

async function loadBoardContent() {
    const container = document.getElementById('board-content');
    if (!container) return;
    if (currentBoardTab === 'lobby') await loadLobby(container);
    else if (currentBoardTab === 'create') showCreateWarForm(container);
}

async function loadLobby(container) {
    const wars = await apiFetch('/boardwar/list');
    if (!wars?.length) {
        container.innerHTML = '<p class="text-gray-400">No active board wars. Create one!</p>';
        return;
    }
    container.innerHTML = wars.map(w => `
        <div class="glass rounded-xl p-4 mb-3 flex justify-between items-center">
            <div>
                <p class="font-bold text-lg">${w.name}</p>
                <p class="text-sm text-gray-400">Players: ${w.player_count}/${w.max_guilds}</p>
                <p class="text-sm text-gray-400">Status: ${w.status}</p>
            </div>
            <div class="space-x-2">
                ${w.status === 'pending' ? `<button onclick="joinBoardWar(${w.id})" class="bg-blue-500 px-4 py-2 rounded-lg text-white hover:bg-blue-400">Join</button>` : ''}
                ${w.status === 'active' ? `<button onclick="viewBoardWar(${w.id})" class="bg-yellow-500 px-4 py-2 rounded-lg text-black hover:bg-yellow-400">Enter</button>` : ''}
            </div>
        </div>
    `).join('');
}

function showCreateWarForm(container) {
    container.innerHTML = `
        <div class="max-w-md mx-auto">
            <h3 class="text-xl font-bold mb-4">Create Board War</h3>
            <input type="text" id="warName" placeholder="War Name" class="w-full bg-gray-800 rounded-xl px-4 py-3 mb-4 text-white border border-gray-600">
            <select id="maxPlayers" class="w-full bg-gray-800 rounded-xl px-4 py-3 mb-4 text-white border border-gray-600">
                <option value="2">2 Players</option>
                <option value="3">3 Players</option>
                <option value="4">4 Players</option>
            </select>
            <button onclick="createBoardWar()" class="w-full bg-yellow-500 py-3 rounded-xl text-black font-bold hover:bg-yellow-400">Create War</button>
        </div>
    `;
}

async function createBoardWar() {
    const name = document.getElementById('warName').value;
    const maxPlayers = parseInt(document.getElementById('maxPlayers').value);
    if (!name) return alert('Enter war name');
    const res = await apiFetch('/boardwar/create', {
        method: 'POST',
        body: JSON.stringify({ name, maxPlayers })
    });
    if (res?.success) {
        alert('War created!');
        switchBoardTab('lobby');
    } else {
        alert(res?.error || 'Failed');
    }
}

async function joinBoardWar(warId) {
    const captain = prompt('Choose your captain:\n\n1. Luffy - +1 movement\n2. Zoro - wins ties\n3. Nami - +20% Beli\n4. Sanji - immune to Marine\n5. Robin - see ahead\n\nType: luffy, zoro, nami, sanji, or robin');
    if (!captain) return;
    const validCaptains = ['luffy', 'zoro', 'nami', 'sanji', 'robin'];
    if (!validCaptains.includes(captain.toLowerCase())) return alert('Invalid captain choice');
    const res = await apiFetch('/boardwar/join', {
        method: 'POST',
        body: JSON.stringify({ warId, captain: captain.toLowerCase() })
    });
    if (res?.success) {
        alert('Joined! The war will start when all players have joined.');
        switchBoardTab('lobby');
    } else {
        alert(res?.error || 'Failed');
    }
}

async function viewBoardWar(warId) {
    currentWarId = warId;
    document.getElementById('board-content').innerHTML = '<p class="text-yellow-400 text-center py-8">Loading board...</p>';
    await pollGameState();
    if (pollInterval) clearInterval(pollInterval);
    pollInterval = setInterval(pollGameState, 5000);
}

async function pollGameState() {
    if (!currentWarId) return;
    const data = await apiFetch('/boardwar/state/' + currentWarId);
    if (!data) return;
    renderBoard(data);
}

function renderBoard(data) {
    const { sessions, tiles, war, yourTurn } = data;
    const container = document.getElementById('board-content');
    if (!container) return;

    const colors = ['#ef4444', '#3b82f6', '#22c55e', '#f59e0b'];
    const emojis = ['🔴', '🔵', '🟢', '🟡'];
    const tileEmojis = {
        'start': '🏁', 'raftel': '👑', 'island': '🏝️', 'marine': '⚓',
        'treasure': '💰', 'yonko': '🐉', 'thriller': '💀', 'weather': '🌀',
        'poseidon': '🔱', 'calm': '😴'
    };

    let html = `<h2 class="text-2xl pirate mb-4">${war.name}</h2>`;
    html += `<p class="text-sm text-gray-400 mb-4">${war.status === 'active' ? '⚔️ War in progress!' : '⏳ Waiting for players...'}</p>`;

    // Board grid
    html += '<div class="grid grid-cols-9 gap-1 mb-6">';
    tiles.forEach((tile, index) => {
        html += `<div class="board-tile tile-${tile.tile_type} relative text-center text-xs" title="${tile.name}: ${tile.description}">
            <span class="text-lg">${tileEmojis[tile.tile_type] || '❓'}</span>`;

        // Player tokens
        sessions.forEach((s, i) => {
            const pos = s.position % 45;
            if (pos === index) {
                html += `<div class="player-token" style="background: ${colors[i]}; top: -8px; right: -8px;" title="${s.guild_name}">${['L','Z','N','S'][i] || 'P'}</div>`;
            }
        });

        html += '</div>';
    });
    html += '</div>';

    // Player stats
    html += '<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">';
    sessions.forEach((s, i) => {
        html += `
            <div class="glass rounded-xl p-4">
                <p class="font-bold text-lg">${emojis[i]} ${s.guild_name}</p>
                <p class="text-sm text-gray-400">Captain: ${s.captain}</p>
                <p class="text-yellow-400 text-xl">⭐ ${s.stars} Stars</p>
                <p class="text-blue-400">💰 ${Number(s.beli).toLocaleString()} Beli</p>
                <p class="text-gray-400">📍 Tile: ${s.position % 45}</p>
                <p class="text-xs text-gray-500">Laps: ${s.laps_completed} | Wins: ${s.mini_games_won}/${s.mini_games_played}</p>
                ${s.is_current_turn ? '<p class="text-green-400 font-bold mt-2">▶ CURRENT TURN</p>' : ''}
            </div>
        `;
    });
    html += '</div>';

    // Roll button (if it's your turn)
    if (yourTurn) {
        html += `<div class="text-center">
            <button onclick="rollDice()" class="bg-yellow-500 hover:bg-yellow-400 px-8 py-4 rounded-xl text-black font-bold text-2xl pirate animate-pulse">🎲 Roll Dice!</button>
        </div>`;
    } else {
        html += '<p class="text-center text-gray-400">Waiting for other guild\'s turn...</p>';
    }

    container.innerHTML = html;
}

async function rollDice() {
    if (!currentWarId) return;
    const res = await apiFetch('/boardwar/roll', {
        method: 'POST',
        body: JSON.stringify({ warId: currentWarId })
    });
    if (!res) return;

    const tileData = res.tile?.data ? JSON.parse(typeof res.tile.data === 'string' ? res.tile.data : JSON.stringify(res.tile.data)) : null;

    // Check if tile triggers a mini-game
    if (tileData?.mini_game) {
        const gameType = tileData.mini_game.replace(/_/g, '-');
        alert(`Rolled: ${res.roll}! 🎲\n\nLanded on: ${res.tile?.name || 'Unknown'}\n${res.tile?.description || ''}\n\nA mini-game will now start!`);
        
        // Check if mini-game file exists, otherwise show alert
        const gameUrl = `/mini-games/${gameType}.html`;
        fetch(gameUrl, { method: 'HEAD' }).then(r => {
            if (r.ok) {
                document.getElementById('miniGameOverlay').classList.remove('hidden');
                document.getElementById('miniGameFrame').src = gameUrl;
            } else {
                // Fallback: simulate mini-game with a simple prompt
                simulateMiniGame(gameType, tileData);
            }
        }).catch(() => simulateMiniGame(gameType, tileData));
    } else if (tileData?.beli_bonus) {
        alert(`Rolled: ${res.roll}! 🎲\n\nLanded on: ${res.tile?.name}\n+${tileData.beli_bonus} Beli!`);
        pollGameState();
    } else if (tileData?.star_bonus) {
        alert(`Rolled: ${res.roll}! 🎲\n\nLanded on: ${res.tile?.name}\n+${tileData.star_bonus} Stars!`);
        pollGameState();
    } else if (tileData?.move_back) {
        alert(`Rolled: ${res.roll}! 🎲\n\nLanded on: ${res.tile?.name}\nGo back ${tileData.move_back} spaces!`);
        pollGameState();
    } else if (tileData?.move_forward) {
        alert(`Rolled: ${res.roll}! 🎲\n\nLanded on: ${res.tile?.name}\nMove forward ${tileData.move_forward} spaces!`);
        pollGameState();
    } else if (tileData?.endgame) {
        alert(`Rolled: ${res.roll}! 🎲\n\n🏆 You reached Laugh Tale! The endgame has been triggered!`);
        pollGameState();
    } else {
        alert(`Rolled: ${res.roll}! 🎲\n\nLanded on: ${res.tile?.name || 'Unknown tile'}`);
        pollGameState();
    }
}

// Fallback mini-game (simple prompt-based)
function simulateMiniGame(gameType, tileData) {
    const target = Math.floor(Math.random() * 20) + 1;
    const guess = prompt(`🎮 ${gameType.replace(/-/g, ' ').toUpperCase()}!\n\nGuess a number between 1 and 20:`);
    const score = parseInt(guess) === target ? 100 : 0;
    
    apiFetch('/boardwar/minigame-result', {
        method: 'POST',
        body: JSON.stringify({ warId: currentWarId, gameType, score })
    }).then(res => {
        alert(res?.won ? `🎉 You won! +${res.beliEarned} Beli, +${res.starsEarned} Stars` : '😢 You lost! Better luck next time.');
        pollGameState();
    });
}

// Listen for mini-game results from iframe
window.addEventListener('message', async (e) => {
    if (e.data?.game && e.data?.score !== undefined) {
        const res = await apiFetch('/boardwar/minigame-result', {
            method: 'POST',
            body: JSON.stringify({ warId: currentWarId, gameType: e.data.game, score: e.data.score })
        });
        document.getElementById('miniGameOverlay').classList.add('hidden');
        document.getElementById('miniGameFrame').src = '';
        alert(res?.won ? `🎉 You won! +${res.beliEarned} Beli, +${res.starsEarned} Stars` : '😢 You lost! Better luck next time.');
        pollGameState();
    }
});

function closeMiniGame() {
    document.getElementById('miniGameOverlay').classList.add('hidden');
    document.getElementById('miniGameFrame').src = '';
}

// Cleanup polling when leaving board war page
window.addEventListener('beforeunload', () => {
    if (pollInterval) clearInterval(pollInterval);
});