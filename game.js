// game.js
import * as THREE from 'three';

// ── Constants ──
const API_BASE = '/api';

// ── Global references ──
let scene, camera, renderer;
let playerGroup, playerModel;
let worldGroup;
const keys = {};
let playerData = null;

// ── Login with token from URL ──
const urlParams = new URLSearchParams(window.location.search);
const token = urlParams.get('token');

if (!token) {
    alert('No login token. Use .login on WhatsApp to get one.');
    window.location.href = 'index.html';
}

async function loginAndLoad() {
    try {
        const res = await fetch(`${API_BASE}/login?token=${encodeURIComponent(token)}`);
        const data = await res.json();
        if (!data.token) throw new Error(data.error || 'Invalid token');

        // Save auth for future API calls
        localStorage.setItem('sabaody_token', data.token);
        localStorage.setItem('sabaody_user', JSON.stringify(data.user));
        playerData = data.user;

        // Update HUD
        document.getElementById('playerName').textContent =
            `🏴‍☠️ ${playerData.pirate_name || 'Pirate'}`;
        document.getElementById('playerBeli').textContent =
            `💰 ${Number(playerData.beli || 0).toLocaleString()}`;

        // Start the 3D game
        startGame();
    } catch (e) {
        alert('Login failed: ' + e.message);
        window.location.href = 'index.html';
    }
}

// ── Minecraft‑style player model ──
function createMinecraftPlayer(skinUrl) {
    const group = new THREE.Group();
    const texture = new THREE.TextureLoader().load(skinUrl);
    texture.magFilter = THREE.NearestFilter;   // pixelated look

    // Helper to create a box with UV mapping
    function addPart(w, h, d, uOffset, vOffset, uSize, vSize, posY, posX = 0) {
        const geo = new THREE.BoxGeometry(w, h, d);
        const mat = new THREE.MeshLambertMaterial({ map: texture.clone() });
        // UV mapping
        mat.map.repeat.set(uSize / 64, vSize / 64);
        mat.map.offset.set(uOffset / 64, vOffset / 64);
        mat.map.wrapS = THREE.RepeatWrapping;
        mat.map.wrapT = THREE.RepeatWrapping;
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(posX, posY, 0);
        group.add(mesh);
        return mesh;
    }

    // Head
    addPart(8, 8, 8, 0, 0, 8, 8, 28);
    // Body
    addPart(8, 12, 4, 16, 16, 8, 12, 20);
    // Left Arm
    addPart(4, 12, 4, 32, 48, 4, 12, 22, -6);
    // Right Arm
    addPart(4, 12, 4, 40, 16, 4, 12, 22, 6);
    // Left Leg
    addPart(4, 12, 4, 16, 48, 4, 12, 8, -2);
    // Right Leg
    addPart(4, 12, 4, 0, 16, 4, 12, 8, 2);

    return group;
}

// ── Simple voxel world ──
function createVoxelWorld() {
    const world = new THREE.Group();

    // Load textures (fallback to colours if missing)
    const loader = new THREE.TextureLoader();
    const stoneTex = loader.load('/assets/textures/blocks/stone.png',
        undefined, undefined,
        () => console.warn('stone.png not found, using gray')
    );
    stoneTex.magFilter = THREE.NearestFilter;
    const grassTex = loader.load('/assets/textures/blocks/grass.png',
        undefined, undefined,
        () => console.warn('grass.png not found, using green')
    );
    grassTex.magFilter = THREE.NearestFilter;

    const stoneMat = new THREE.MeshLambertMaterial({ map: stoneTex });
    const grassMat = new THREE.MeshLambertMaterial({ map: grassTex });
    const geo = new THREE.BoxGeometry(1, 1, 1);

    // Generate a small island (20×20) with rolling hills
    const range = 10;
    for (let x = -range; x <= range; x++) {
        for (let z = -range; z <= range; z++) {
            const height = Math.floor(
                Math.sin(x * 0.5) * 2 + Math.cos(z * 0.5) * 2 + 3
            );
            for (let y = 0; y < height; y++) {
                const mat = (y === height - 1) ? grassMat : stoneMat;
                const block = new THREE.Mesh(geo, mat);
                block.position.set(x, y, z);
                world.add(block);
            }
        }
    }
    return world;
}

// ── Main game loop ──
function startGame() {
    // Scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87CEEB);
    scene.fog = new THREE.Fog(0x87CEEB, 20, 50);

    // Camera
    camera = new THREE.PerspectiveCamera(
        75, window.innerWidth / window.innerHeight, 0.1, 1000
    );
    camera.position.set(0, 10, 15);

    // Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    document.body.appendChild(renderer.domElement);

    // Lighting
    const sun = new THREE.DirectionalLight(0xffffff, 1);
    sun.position.set(10, 20, 5);
    sun.castShadow = true;
    scene.add(sun);
    scene.add(new THREE.AmbientLight(0x404040));

    // World
    worldGroup = createVoxelWorld();
    scene.add(worldGroup);

    // Player
    playerGroup = new THREE.Group();
    playerModel = createMinecraftPlayer('/assets/skins/player.png');
    playerGroup.add(playerModel);
    playerGroup.position.set(0, 5, 0);
    scene.add(playerGroup);

    // Input
    window.addEventListener('keydown', e => { keys[e.key] = true; });
    window.addEventListener('keyup', e => { keys[e.key] = false; });

    // Animation loop
    function animate() {
        requestAnimationFrame(animate);

        // Movement (arrow keys / WASD)
        const speed = 0.12;
        if (keys['ArrowUp'] || keys['w'])    playerGroup.position.z -= speed;
        if (keys['ArrowDown'] || keys['s'])  playerGroup.position.z += speed;
        if (keys['ArrowLeft'] || keys['a'])  playerGroup.position.x -= speed;
        if (keys['ArrowRight'] || keys['d']) playerGroup.position.x += speed;

        // Camera follow
        camera.position.x = playerGroup.position.x;
        camera.position.z = playerGroup.position.z + 12;
        camera.lookAt(playerGroup.position);

        renderer.render(scene, camera);
    }
    animate();

    // Handle window resize
    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });
}

// ── Boot ──
loginAndLoad();