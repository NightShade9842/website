// ===== CONFIG =====
const API_BASE = 'https://your-bot-api.onrender.com/api'; // change to your actual API URL (ngrok or server)

// ===== AUTH =====
function sendAuthCode() {
    const phone = document.getElementById('phoneInput').value.trim();
    if (!phone) return alert('Enter your WhatsApp number');
    fetch(API_BASE + '/auth/send-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone })
    }).then(r => r.json()).then(data => {
        if (data.success) {
            document.getElementById('login-box').classList.add('hidden');
            document.getElementById('code-box').classList.remove('hidden');
        } else {
            alert(data.error || 'Failed to send code');
        }
    }).catch(() => alert('Connection error'));
}

function verifyCode() {
    const code = document.getElementById('codeInput').value.trim();
    const phone = document.getElementById('phoneInput').value.trim();
    fetch(API_BASE + '/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, code })
    }).then(r => r.json()).then(data => {
        if (data.token) {
            localStorage.setItem('sabaody_token', data.token);
            localStorage.setItem('sabaody_user', JSON.stringify(data.user));
            window.location = 'profile.html';
        } else {
            alert(data.error || 'Invalid code');
        }
    }).catch(() => alert('Connection error'));
}

function logout() {
    localStorage.removeItem('sabaody_token');
    localStorage.removeItem('sabaody_user');
    window.location = 'index.html';
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
    return res.json();
}

// ===== PROFILE =====
async function loadProfile() {
    const user = JSON.parse(localStorage.getItem('sabaody_user'));
    if (!user) return;
    const data = await apiFetch('/profile/' + user.id);
    if (data.error) return alert(data.error);
    document.getElementById('user-stats').innerHTML = `
        <p><span class="text-gray-400">Name:</span> ${data.pirate_name || 'Unnamed'}</p>
        <p><span class="text-gray-400">Level:</span> ${data.level}</p>
        <p class="text-yellow-400">💰 Beli: ${data.beli?.toLocaleString()}</p>
        <p class="text-blue-400">💎 Gems: ${data.gems}</p>
        <p class="text-purple-400">🃏 Cards: ${data.cardCount}</p>
        <p class="text-red-400">🐾 Pokémon: ${data.pokemonCount}</p>
    `;

    // Recent cards
    const cards = await apiFetch('/cards/' + user.id);
    const cardDiv = document.getElementById('recent-cards');
    cardDiv.innerHTML = cards.slice(0,6).map(c => `
        <div class="glass card rarity-${c.rarity.replace(' ','')}">
            <img src="${c.image_url || 'https://via.placeholder.com/80'}" class="w-16 h-16 mx-auto rounded-lg object-cover mb-1">
            <p class="text-xs truncate">${c.card_name}</p>
            <span class="text-xs text-gray-400">${c.rarity}</span>
        </div>
    `).join('') || '<p class="text-gray-500">No cards yet</p>';

    // Pokémon party (simplified – you'll need a dedicated endpoint or parse party field)
    const pokemonDiv = document.getElementById('pokemon-party');
    // We don't have a specific party endpoint, so we'll just show a message
    pokemonDiv.innerHTML = '<p class="text-gray-400">Party info coming soon</p>';
}

// ===== CARDS =====
async function loadCards() {
    const user = JSON.parse(localStorage.getItem('sabaody_user'));
    const cards = await apiFetch('/cards/' + user.id);
    const grid = document.getElementById('card-grid');
    if (!cards.length) {
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

// ===== STORE =====
async function loadCardShop(container) {
    const listings = await apiFetch('/shop/cards');
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
                <p class="text-xl font-bold text-yellow-400">💰 ${l.price.toLocaleString()}</p>
                <button onclick="buyCard(${l.id})" class="mt-2 bg-green-500 px-4 py-1 rounded-lg text-black font-semibold hover:bg-green-400">Buy</button>
            </div>
        </div>
    `).join('') || '<p class="text-gray-400">No listings</p>';
}

async function buyCard(listingId) {
    const res = await apiFetch('/shop/buy', {
        method: 'POST',
        body: JSON.stringify({ listingId })
    });
    if (res.success) {
        alert('Card purchased!');
        switchTab('cards'); // refresh
    } else {
        alert(res.error || 'Purchase failed');
    }
}

async function loadAuctions(container) {
    const auctions = await apiFetch('/auctions');
    container.innerHTML = auctions.map(a => `
        <div class="glass rounded-xl p-4 mb-3">
            <div class="flex justify-between items-center">
                <div class="flex items-center space-x-4">
                    <img src="${a.image_url || 'https://via.placeholder.com/60'}" class="w-16 h-16 rounded-lg object-cover">
                    <div>
                        <p class="font-bold">${a.card_name}</p>
                        <p class="text-sm text-gray-400">Current Bid: ${a.current_bid.toLocaleString()}฿</p>
                        <p class="text-xs">Ends: ${new Date(a.end_time).toLocaleString()}</p>
                    </div>
                </div>
                <div>
                    <input type="number" id="bid-${a.id}" placeholder="Your bid" class="bg-gray-800 rounded px-3 py-1 text-white w-24 mb-1">
                    <button onclick="placeBid(${a.id})" class="bg-blue-500 px-3 py-1 rounded text-white hover:bg-blue-400">Bid</button>
                </div>
            </div>
        </div>
    `).join('') || '<p class="text-gray-400">No active auctions</p>';
}

async function placeBid(auctionId) {
    const amount = document.getElementById('bid-' + auctionId).value;
    if (!amount) return alert('Enter bid amount');
    const res = await apiFetch('/auctions/bid', {
        method: 'POST',
        body: JSON.stringify({ auctionId, amount: parseInt(amount) })
    });
    if (res.success) {
        alert('Bid placed!');
        switchTab('auctions');
    } else {
        alert(res.error || 'Bid failed');
    }
}

async function loadEventStore(container) {
    const items = await apiFetch('/events/cards');
    container.innerHTML = items.map(item => `
        <div class="glass rounded-xl p-4 flex items-center justify-between mb-3">
            <div>
                <p class="font-bold">${item.name}</p>
                <p class="text-sm text-gray-400">${item.description}</p>
                <p class="text-yellow-400">🪙 ${item.price_coins} Gold Coins</p>
            </div>
            <button onclick="buyEventItem(${item.id})" class="bg-yellow-500 px-4 py-2 rounded-lg text-black font-semibold hover:bg-yellow-400">Buy</button>
        </div>
    `).join('') || '<p class="text-gray-400">No event items</p>';
}

async function buyEventItem(itemId) {
    const res = await apiFetch('/events/buy', {
        method: 'POST',
        body: JSON.stringify({ itemId })
    });
    if (res.success) {
        alert('Purchased!');
        switchTab('events');
    } else {
        alert(res.error || 'Purchase failed');
    }
}

async function loadItemStore(container) {
    const items = await apiFetch('/store/items');
    container.innerHTML = items.map(item => `
        <div class="glass rounded-xl p-4 flex items-center justify-between mb-3">
            <div>
                <p class="font-bold">${item.name}</p>
                <p class="text-sm text-gray-400">${item.description}</p>
                <div class="flex space-x-4 text-sm">
                    ${item.price_gems ? `<span class="text-blue-400">💎 ${item.price_gems} Gems</span>` : ''}
                    ${item.price_beli ? `<span class="text-yellow-400">💰 ${item.price_beli.toLocaleString()} Beli</span>` : ''}
                </div>
            </div>
            <button onclick="buyStoreItem(${item.id})" class="bg-green-500 px-4 py-2 rounded-lg text-black font-semibold hover:bg-green-400">Buy</button>
        </div>
    `).join('') || '<p class="text-gray-400">No items</p>';
}

async function buyStoreItem(itemId) {
    const res = await apiFetch('/store/buy-item', {
        method: 'POST',
        body: JSON.stringify({ itemId })
    });
    if (res.success) {
        alert('Item purchased!');
        switchTab('items');
    } else {
        alert(res.error || 'Purchase failed');
    }
}