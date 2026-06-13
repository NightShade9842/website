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

// Virtual joystick state
let joystickActive = false;
let joystickVector = { x: 0, y: 0 };   // normalized -1..1

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

        localStorage.setItem('sabaody_token', data.token);
        localStorage.setItem('sabaody_user', JSON.stringify(data.user));
        playerData = data.user;

        document.getElementById('playerName').textContent =
            `🏴‍☠️ ${playerData.pirate_name || 'Pirate'}`;
        document.getElementById('playerBeli').textContent =
            `💰 ${Number(playerData.beli || 0).toLocaleString()}`;

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
    texture.magFilter = THREE.NearestFilter;

    function addPart(w, h, d, uOff, vOff, uSize, vSize, posY, posX = 0) {
        const geo = new THREE.BoxGeometry(w, h, d);
        const mat = new THREE.MeshLambertMaterial({ map: texture.clone() });
        mat.map.repeat.set(uSize / 64, vSize / 64);
        mat.map.offset.set(uOff / 64, vOff / 64);
        mat.map.wrapS = THREE.RepeatWrapping;
        mat.map.wrapT = THREE.RepeatWrapping;
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(posX, posY, 0);
        group.add(mesh);
        return mesh;
    }

    addPart(8, 8, 8, 0, 0, 8, 8, 28);          // head
    addPart(8, 12, 4, 16, 16, 8, 12, 20);        // body
    addPart(4, 12, 4, 32, 48, 4, 12, 22, -6);    // left arm
    addPart(4, 12, 4, 40, 16, 4, 12, 22, 6);     // right arm
    addPart(4, 12, 4, 16, 48, 4, 12, 8, -2);     // left leg
    addPart(4, 12, 4, 0, 16, 4, 12, 8, 2);       // right leg

    return group;
}

// ── Simple voxel world ──
function createVoxelWorld() {
    const world = new THREE.Group();
    const loader = new THREE.TextureLoader();

    const stoneTex = loader.load('/assets/textures/blocks/stone.png',
        undefined, undefined, () => console.warn('stone.png missing'));
    stoneTex.magFilter = THREE.NearestFilter;
    const grassTex = loader.load('/assets/textures/blocks/grass.png',
        undefined, undefined, () => console.warn('grass.png missing'));
    grassTex.magFilter = THREE.NearestFilter;

    const stoneMat = new THREE.MeshLambertMaterial({ map: stoneTex });
    const grassMat = new THREE.MeshLambertMaterial({ map: grassTex });
    const geo = new THREE.BoxGeometry(1, 1, 1);

    const range = 10;
    for (let x = -range; x <= range; x++) {
        for (let z = -range; z <= range; z++) {
            const height = Math.floor(Math.sin(x * 0.5) * 2 + Math.cos(z * 0.5) * 2 + 3);
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

// ── Mobile controls setup ──
function setupMobileControls() {
    const joystickBase = document.getElementById('joystick-base');
    const joystickThumb = document.getElementById('joystick-thumb');
    const joystickZone = document.getElementById('joystick-zone');

    // Show mobile controls only on touch devices
    if (!('ontouchstart' in window)) {
        joystickZone.style.display = 'none';
        document.getElementById('action-buttons').style.display = 'none';
        return;
    }

    // Joystick events
    joystickZone.addEventListener('touchstart', (e) => {
        e.preventDefault();
        joystickActive = true;
        updateJoystick(e.touches[0]);
    });
    joystickZone.addEventListener('touchmove', (e) => {
        e.preventDefault();
        if (joystickActive) updateJoystick(e.touches[0]);
    });
    joystickZone.addEventListener('touchend', (e) => {
        e.preventDefault();
        joystickActive = false;
        joystickVector.x = 0;
        joystickVector.y = 0;
        joystickThumb.style.top = '35px';
        joystickThumb.style.left = '35px';
    });

    function updateJoystick(touch) {
        const rect = joystickBase.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        let dx = touch.clientX - centerX;
        let dy = touch.clientY - centerY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const maxDist = 40;
        if (dist > maxDist) {
            dx = (dx / dist) * maxDist;
            dy = (dy / dist) * maxDist;
        }
        joystickThumb.style.left = (35 + dx) + 'px';
        joystickThumb.style.top = (35 + dy) + 'px';
        joystickVector.x = dx / maxDist;
        joystickVector.y = dy / maxDist;
    }

    // Action buttons
    document.getElementById('btn-attack').addEventListener('touchstart', (e) => {
        e.preventDefault();
        // Placeholder attack logic – we'll expand later
        console.log('Attack!');
    });
    document.getElementById('btn-jump').addEventListener('touchstart', (e) => {
        e.preventDefault();
        // Placeholder jump
        console.log('Jump!');
    });
}

// ── Main game loop ──
function startGame() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87CEEB);
    scene.fog = new THREE.Fog(0x87CEEB, 20, 50);

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 10, 15);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    document.body.appendChild(renderer.domElement);

    const sun = new THREE.DirectionalLight(0xffffff, 1);
    sun.position.set(10, 20, 5);
    sun.castShadow = true;
    scene.add(sun);
    scene.add(new THREE.AmbientLight(0x404040));

    worldGroup = createVoxelWorld();
    scene.add(worldGroup);

    playerGroup = new THREE.Group();
    playerModel = createMinecraftPlayer('/assets/skins/player.png');
    playerGroup.add(playerModel);
    playerGroup.position.set(0, 5, 0);
    scene.add(playerGroup);

    // Keyboard input
    window.addEventListener('keydown', e => { keys[e.key] = true; });
    window.addEventListener('keyup', e => { keys[e.key] = false; });

    // Mobile controls
    setupMobileControls();

    // Animation loop
    function animate() {
        requestAnimationFrame(animate);

        // Movement from keyboard or joystick
        const speed = 0.12;
        let moveX = 0, moveZ = 0;

        if (joystickActive) {
            moveX = joystickVector.x * speed;
            moveZ = joystickVector.y * speed;
        } else {
            if (keys['ArrowUp'] || keys['w'])    moveZ -= speed;
            if (keys['ArrowDown'] || keys['s'])  moveZ += speed;
            if (keys['ArrowLeft'] || keys['a'])  moveX -= speed;
            if (keys['ArrowRight'] || keys['d']) moveX += speed;
        }

        playerGroup.position.x += moveX;
        playerGroup.position.z += moveZ;

        // Camera follow
        camera.position.x = playerGroup.position.x;
        camera.position.z = playerGroup.position.z + 12;
        camera.lookAt(playerGroup.position);

        renderer.render(scene, camera);
    }
    animate();

    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });

    // Force landscape on mobile
    forceLandscape();
}

function forceLandscape() {
    const warning = document.getElementById('rotate-warning');
    function checkOrientation() {
        if (window.innerWidth < window.innerHeight) {
            warning.style.display = 'flex';
        } else {
            warning.style.display = 'none';
        }
    }
    window.addEventListener('resize', checkOrientation);
    window.addEventListener('orientationchange', checkOrientation);
    checkOrientation();

    // Request fullscreen on first touch (helps with immersive mode)
    document.addEventListener('touchstart', function requestFull() {
        if (document.fullscreenElement) return;
        document.documentElement.requestFullscreen?.().catch(() => {});
    }, { once: true });
}

// ── Boot ──
loginAndLoad();