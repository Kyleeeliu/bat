const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// --- Volleyball Court Settings ---
const ZOOM = 2;
const COURT_WIDTH = 480;
const COURT_HEIGHT = 240;
const NET_HEIGHT = 64;
const GROUND_Y = COURT_HEIGHT - 32;

// Bat settings
const SPRITE_SIZE = 64;
const batState = { name: 'IdleFly', file: 'Bat-IdleFly.png', frames: 4 };
const batSprites = {};
let loadedSprites = 0;
const img = new Image();
img.src = `assets.player/Bat with VFX/${batState.file}`;
img.onload = () => {
  loadedSprites = 1;
  requestAnimationFrame(drawStartScreen);
};
batSprites[batState.name] = img;

const batSpikeSprite = new Image();
batSpikeSprite.src = `assets.player/Bat with VFX/Bat-Attack1.png`;

let batX = 80;
let batY = GROUND_Y - SPRITE_SIZE;
let batVX = 0;
let batVY = 0;
const batSpeed = 3;
const batJump = 8;
let batFacing = 1; // 1 = right, -1 = left, 0 = up, 2 = down
let onGround = false;

let playerScore = 0;
let aiScore = 0;

// AI Bat
let aiBatX = COURT_WIDTH - 80 - SPRITE_SIZE;
let aiBatY = GROUND_Y - SPRITE_SIZE;
let aiBatVY = 0;
let aiOnGround = false;
let aiFacing = -1;

// Ball settings (slower)
let ballX = COURT_WIDTH / 2;
let ballY = 80;
let ballVX = 1.2; // slower
let ballVY = -1.2; // slower
const BALL_RADIUS = 16;
const GRAVITY_BAT = 0.35;
const GRAVITY_BALL = 0.08;
const BALL_BOUNCE = 0.55; // less bouncy

// Game state
let gameStarted = false;
let gameState = 'start'; // 'start', 'serve', 'play'
let server = 'player'; // 'player' or 'ai'
let serveTimer = 0;

// Controls
const keys = {};
window.addEventListener('keydown', e => {
  keys[e.key.toLowerCase()] = true;
});
window.addEventListener('keyup', e => {
  keys[e.key.toLowerCase()] = false;
});

// Resize canvas to window size
function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

let batFrame = 0;
let batFrameTimer = 0;
const batFrameSpeed = 8;

let batSkill = "idle"; // "idle", "bump", "set", "spike"
let skillTimer = 0;
let lastSkill = "none"; // Track last skill for spike logic
let canSpike = false;

let aiSkill = 'idle';
let aiSkillTimer = 0;
let aiLastSkill = 'none';
let aiCanSpike = false;

let playerTouches = 0;
let aiTouches = 0;
let lastSide = null; // 'player' or 'ai'
let lastTouchedBy = null; // 'player', 'ai', or null

function resetTouches() {
  playerTouches = 0;
  aiTouches = 0;
  lastTouchedBy = null;
}

function resetBall(direction = 1) {
  ballX = COURT_WIDTH / 2;
  ballY = 80;
  ballVX = 1.2 * direction;
  ballVY = -1.2;
}

function updateBat() {
  // Left/right movement (player only left half)
  batVX = (keys['a'] ? -1 : 0) + (keys['d'] ? 1 : 0);
  if (batVX < 0) batFacing = 1;
  else if (batVX > 0) batFacing = -1;
  // Jump (flap)
  if ((keys[' '] || keys['w']) && onGround) {
    batVY = -batJump;
    onGround = false;
  }
  batX += batVX * batSpeed;
  batY += batVY;
  batVY += GRAVITY_BAT;
  // Clamp to left side
  if (batX < 0) batX = 0;
  if (batX > COURT_WIDTH / 2 - SPRITE_SIZE) batX = COURT_WIDTH / 2 - SPRITE_SIZE;
  if (batY > GROUND_Y - SPRITE_SIZE) {
    batY = GROUND_Y - SPRITE_SIZE;
    batVY = 0;
    onGround = true;
  }
  if (batY < 0) batY = 0;

  // Skill input
  let canSkill = false;
  let batCenterX = batX + SPRITE_SIZE / 2;
  let batCenterY = batY + SPRITE_SIZE / 2;
  let dx = ballX - batCenterX;
  let dy = ballY - batCenterY;
  let dist = Math.sqrt(dx * dx + dy * dy);
  if (dist < BALL_RADIUS + SPRITE_SIZE / 2 + 8) canSkill = true;

  if (batSkill !== "spike" && canSkill && skillTimer <= 0 && ballX < COURT_WIDTH / 2) {
    // Only allow bump on first touch
    if (playerTouches === 0 && (keys['s'] || keys['arrowdown'])) {
      batSkill = "bump";
      lastSkill = "bump";
      canSpike = false;
      ballVX = 1.2 * (ballX < COURT_WIDTH/2 ? 1 : -1);
      ballVY = -2.5;
      skillTimer = 18;
    }
    // Set (Q, ground or air) on 2nd/3rd touch
    else if (playerTouches > 0 && playerTouches < 3 && keys['q']) {
      batSkill = "set";
      lastSkill = "set";
      canSpike = true;
      ballVX = 0.8 * (ballX < COURT_WIDTH/2 ? 1 : -1);
      ballVY = -3.5;
      skillTimer = 18;
    }
    // Spike (Shift, only after set, airborne, ball above bat) on 2nd/3rd touch
    else if (playerTouches > 0 && playerTouches < 3 && (keys['shift'] || keys['shiftleft'] || keys['shiftright']) && canSpike && !onGround && ballY < batY + 8 && lastSkill === "set") {
      batSkill = "spike";
      lastSkill = "spike";
      canSpike = false;
      ballVX = 3.2 * (ballX < COURT_WIDTH/2 ? 1 : -1);
      ballVY = 4.2;
      skillTimer = 20;
    }
    // Block (E, in air, near net, ball above) on 2nd/3rd touch
    else if (playerTouches > 0 && playerTouches < 3 && keys['e'] && !onGround && Math.abs(batX + SPRITE_SIZE/2 - COURT_WIDTH/2) < 40 && ballY < batY + 8) {
      batSkill = "block";
      lastSkill = "block";
      canSpike = false;
      ballVX = -2.2 * (ballX < COURT_WIDTH/2 ? 1 : -1);
      ballVY = -2.2;
      skillTimer = 16;
    }
  }
  if (skillTimer > 0) skillTimer--;
  if (skillTimer === 0 && batSkill !== "idle") batSkill = "idle";
}

function updateAIBat() {
  // Simple AI: follow ball if on right side
  let targetY = ballY - SPRITE_SIZE / 2;
  let dx = ballX - (aiBatX + SPRITE_SIZE / 2);
  // Only move if ball is on AI's side or above net
  if (ballX > COURT_WIDTH / 2 || ballY < GROUND_Y - NET_HEIGHT) {
    if (Math.abs(dx) > 8) {
      aiBatX += Math.sign(dx) * batSpeed * 0.9;
      aiFacing = dx < 0 ? 1 : -1;
    }
    // AI jump if ball is above
    if (ballY < aiBatY && aiOnGround && Math.abs(dx) < 48) {
      aiBatVY = -batJump;
      aiOnGround = false;
    }
  }
  aiBatY += aiBatVY;
  aiBatVY += GRAVITY_BAT;
  // Clamp to right side
  if (aiBatX < COURT_WIDTH / 2) aiBatX = COURT_WIDTH / 2;
  if (aiBatX > COURT_WIDTH - SPRITE_SIZE) aiBatX = COURT_WIDTH - SPRITE_SIZE;
  if (aiBatY > GROUND_Y - SPRITE_SIZE) {
    aiBatY = GROUND_Y - SPRITE_SIZE;
    aiBatVY = 0;
    aiOnGround = true;
  }
  if (aiBatY < 0) aiBatY = 0;

  // AI skill logic
  let canSkill = false;
  let aiBatCenterX = aiBatX + SPRITE_SIZE / 2;
  let aiBatCenterY = aiBatY + SPRITE_SIZE / 2;
  let dxBall = ballX - aiBatCenterX;
  let dyBall = ballY - aiBatCenterY;
  let dist = Math.sqrt(dxBall * dxBall + dyBall * dyBall);
  if (dist < BALL_RADIUS + SPRITE_SIZE / 2 + 8) canSkill = true;

  if (aiSkill !== 'spike' && canSkill && aiSkillTimer <= 0 && ballX > COURT_WIDTH / 2) {
    // Always bump first
    if (aiTouches === 0) {
      aiSkill = 'bump';
      aiLastSkill = 'bump';
      aiCanSpike = false;
      ballVX = -1.2;
      ballVY = -2.5;
      aiSkillTimer = 18;
    }
    // Set on 2nd/3rd touch
    else if (aiTouches > 0 && aiTouches < 3 && ballY < aiBatY + 8) {
      aiSkill = 'set';
      aiLastSkill = 'set';
      aiCanSpike = true;
      ballVX = -0.8;
      ballVY = -3.5;
      aiSkillTimer = 18;
    }
    // Spike (only after set, airborne, ball above bat) on 2nd/3rd touch
    else if (aiTouches > 0 && aiTouches < 3 && aiCanSpike && !aiOnGround && ballY < aiBatY + 8 && aiLastSkill === 'set') {
      aiSkill = 'spike';
      aiLastSkill = 'spike';
      aiCanSpike = false;
      ballVX = -3.2;
      ballVY = 4.2;
      aiSkillTimer = 20;
    }
  }
  if (aiSkillTimer > 0) aiSkillTimer--;
  if (aiSkillTimer === 0 && aiSkill !== 'idle') aiSkill = 'idle';
}

function updateLeaderboardUI() {
  const playerScoreElem = document.getElementById('playerScoreUI');
  const aiScoreElem = document.getElementById('aiScoreUI');
  if (playerScoreElem && aiScoreElem) {
    playerScoreElem.innerText = playerScore;
    aiScoreElem.innerText = aiScore;
  }
}

function updateBall() {
  if (gameState !== 'play') return;
  // Track which side the ball is on
  let currentSide = ballX < COURT_WIDTH / 2 ? 'player' : 'ai';
  if (currentSide !== lastSide) {
    resetTouches();
    lastSide = currentSide;
  }
  ballX += ballVX;
  ballY += ballVY;
  ballVY += GRAVITY_BALL;
  // Bounce on ground
  if (ballY + BALL_RADIUS > GROUND_Y) {
    // Score check
    if (ballX < COURT_WIDTH / 2) {
      aiScore++;
      updateLeaderboardUI();
      server = 'player';
      startServe();
      return;
    } else if (ballX > COURT_WIDTH / 2) {
      playerScore++;
      updateLeaderboardUI();
      server = 'ai';
      startServe();
      return;
    }
    ballY = GROUND_Y - BALL_RADIUS;
    ballVY *= -BALL_BOUNCE;
    if (Math.abs(ballVY) < 1) ballVY = 0;
  }
  // 3-touch rule
  if (playerTouches > 3) {
    aiScore++;
    updateLeaderboardUI();
    server = 'ai';
    startServe();
    return;
  }
  if (aiTouches > 3) {
    playerScore++;
    updateLeaderboardUI();
    server = 'player';
    startServe();
    return;
  }
  // Bounce on walls
  if (ballX - BALL_RADIUS < 0) {
    ballX = BALL_RADIUS;
    ballVX *= -1;
  }
  if (ballX + BALL_RADIUS > COURT_WIDTH) {
    ballX = COURT_WIDTH - BALL_RADIUS;
    ballVX *= -1;
  }
  // Bounce on net
  if (
    ballX + BALL_RADIUS > COURT_WIDTH / 2 - 4 &&
    ballX - BALL_RADIUS < COURT_WIDTH / 2 + 4 &&
    ballY + BALL_RADIUS > GROUND_Y - NET_HEIGHT
  ) {
    if (ballVX > 0) ballX = COURT_WIDTH / 2 - BALL_RADIUS - 4;
    else ballX = COURT_WIDTH / 2 + BALL_RADIUS + 4;
    ballVX *= -1;
  }
  // Bat collision (player)
  let batCenterX = batX + SPRITE_SIZE / 2;
  let batCenterY = batY + SPRITE_SIZE / 2;
  let dx = ballX - batCenterX;
  let dy = ballY - batCenterY;
  let dist = Math.sqrt(dx * dx + dy * dy);
  if (dist < BALL_RADIUS + SPRITE_SIZE / 2 - 8) {
    if (lastTouchedBy !== 'player') {
      playerTouches++;
      lastTouchedBy = 'player';
    }
    let angle = Math.atan2(dy, dx);
    let force = 3.5;
    ballVX = Math.cos(angle) * force;
    ballVY = Math.sin(angle) * force;
    ballX = batCenterX + Math.cos(angle) * (BALL_RADIUS + SPRITE_SIZE / 2 - 8);
    ballY = batCenterY + Math.sin(angle) * (BALL_RADIUS + SPRITE_SIZE / 2 - 8);
  }
  // Bat collision (AI)
  let aiBatCenterX = aiBatX + SPRITE_SIZE / 2;
  let aiBatCenterY = aiBatY + SPRITE_SIZE / 2;
  let adx = ballX - aiBatCenterX;
  let ady = ballY - aiBatCenterY;
  let adist = Math.sqrt(adx * adx + ady * ady);
  if (adist < BALL_RADIUS + SPRITE_SIZE / 2 - 8) {
    if (lastTouchedBy !== 'ai') {
      aiTouches++;
      lastTouchedBy = 'ai';
    }
    let angle = Math.atan2(ady, adx);
    let force = 3.5;
    ballVX = Math.cos(angle) * force;
    ballVY = Math.sin(angle) * force;
    ballX = aiBatCenterX + Math.cos(angle) * (BALL_RADIUS + SPRITE_SIZE / 2 - 8);
    ballY = aiBatCenterY + Math.sin(angle) * (BALL_RADIUS + SPRITE_SIZE / 2 - 8);
  }
}

function drawCourt() {
  // Center court in window
  const offsetX = (canvas.width / 2 - (COURT_WIDTH * ZOOM) / 2);
  const offsetY = (canvas.height / 2 - (COURT_HEIGHT * ZOOM) / 2);
  ctx.save();
  ctx.translate(offsetX, offsetY);
  ctx.scale(ZOOM, ZOOM);
  // Draw ground
  ctx.fillStyle = '#7ec850';
  ctx.fillRect(0, GROUND_Y, COURT_WIDTH, COURT_HEIGHT - GROUND_Y);
  // Draw court
  ctx.fillStyle = '#bfcfff';
  ctx.fillRect(0, 0, COURT_WIDTH, GROUND_Y);
  // Draw net
  ctx.fillStyle = '#fff';
  ctx.fillRect(COURT_WIDTH / 2 - 4, GROUND_Y - NET_HEIGHT, 8, NET_HEIGHT);
  ctx.restore();
}

function drawBall() {
  const offsetX = (canvas.width / 2 - (COURT_WIDTH * ZOOM) / 2);
  const offsetY = (canvas.height / 2 - (COURT_HEIGHT * ZOOM) / 2);
  ctx.save();
  ctx.translate(offsetX, offsetY);
  ctx.scale(ZOOM, ZOOM);
  ctx.fillStyle = '#ffe066';
  ctx.beginPath();
  ctx.arc(ballX, ballY, BALL_RADIUS, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#e0b800';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();
}

function drawBat() {
  const offsetX = (canvas.width / 2 - (COURT_WIDTH * ZOOM) / 2);
  const offsetY = (canvas.height / 2 - (COURT_HEIGHT * ZOOM) / 2);
  ctx.save();
  ctx.translate(offsetX, offsetY);
  ctx.scale(ZOOM, ZOOM);
  // Animate
  batFrameTimer++;
  if (batFrameTimer >= batFrameSpeed) {
    batFrame = (batFrame + 1) % batState.frames;
    batFrameTimer = 0;
  }
  ctx.save();
  ctx.translate(batX, batY);
  let sprite = (batSkill === "spike") ? batSpikeSprite : batSprites[batState.name];
  if (batFacing === -1) {
    ctx.translate(SPRITE_SIZE / 2, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(
      sprite,
      batFrame * SPRITE_SIZE, 0, SPRITE_SIZE, SPRITE_SIZE,
      -SPRITE_SIZE / 2, 0, SPRITE_SIZE, SPRITE_SIZE
    );
  } else {
    ctx.drawImage(
      sprite,
      batFrame * SPRITE_SIZE, 0, SPRITE_SIZE, SPRITE_SIZE,
      0, 0, SPRITE_SIZE, SPRITE_SIZE
    );
  }
  ctx.restore();
  ctx.restore();
}

function drawAIBat() {
  const offsetX = (canvas.width / 2 - (COURT_WIDTH * ZOOM) / 2);
  const offsetY = (canvas.height / 2 - (COURT_HEIGHT * ZOOM) / 2);
  ctx.save();
  ctx.translate(offsetX, offsetY);
  ctx.scale(ZOOM, ZOOM);
  ctx.save();
  ctx.translate(aiBatX, aiBatY);
  if (aiFacing === -1) {
    ctx.translate(SPRITE_SIZE / 2, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(
      batSprites[batState.name],
      batFrame * SPRITE_SIZE, 0, SPRITE_SIZE, SPRITE_SIZE,
      -SPRITE_SIZE / 2, 0, SPRITE_SIZE, SPRITE_SIZE
    );
  } else {
    ctx.drawImage(
      batSprites[batState.name],
      batFrame * SPRITE_SIZE, 0, SPRITE_SIZE, SPRITE_SIZE,
      0, 0, SPRITE_SIZE, SPRITE_SIZE
    );
  }
  ctx.restore();
  ctx.restore();
}

function startServe() {
  gameState = 'serve';
  serveTimer = 0;
  if (server === 'player') {
    batX = 40;
    batY = GROUND_Y - SPRITE_SIZE;
    batVY = 0;
    onGround = true;
    ballX = batX + SPRITE_SIZE + BALL_RADIUS + 24;
    ballY = batY - 32;
    ballVX = 0;
    ballVY = 0;
  } else {
    aiBatX = COURT_WIDTH - 40 - SPRITE_SIZE;
    aiBatY = GROUND_Y - SPRITE_SIZE;
    aiBatVY = 0;
    aiOnGround = true;
    ballX = aiBatX - BALL_RADIUS - 24;
    ballY = aiBatY - 32;
    ballVX = 0;
    ballVY = 0;
  }
}

function serveBall() {
  if (server === 'player') {
    ballVX = 2.2;
    ballVY = -2.2;
  } else {
    ballVX = -2.2;
    ballVY = -2.2;
  }
  gameState = 'play';
}

// Listen for serve key
window.addEventListener('keydown', function serveListener(e) {
  if (gameState === 'serve' && server === 'player' && (e.code === 'Space' || e.key === ' ')) {
    serveBall();
  }
});

// AI auto-serve
function updateAIServe() {
  if (gameState === 'serve' && server === 'ai') {
    serveTimer++;
    if (serveTimer > 40) {
      serveBall();
      serveTimer = 0;
    }
  }
}

// Draw serve overlay
function drawServeOverlay() {
  ctx.save();
  ctx.font = `bold ${Math.floor(canvas.height/18)}px 'Segoe UI', sans-serif`;
  ctx.fillStyle = '#ffe066';
  ctx.textAlign = 'center';
  ctx.shadowColor = '#000';
  ctx.shadowBlur = 8;
  if (server === 'player') {
    ctx.fillText('Press Space to Serve!', canvas.width/2, 120);
  } else {
    ctx.fillText('AI Serving...', canvas.width/2, 120);
  }
  ctx.restore();
}

function drawStartScreen() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.fillStyle = '#181824';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.font = `bold ${Math.floor(canvas.height/10)}px 'Press Start 2P', 'Courier New', monospace`;
  ctx.fillStyle = '#ffe066';
  ctx.textAlign = 'center';
  ctx.shadowColor = '#000';
  ctx.shadowBlur = 8;
  ctx.fillText('BAT VOLLEY!', canvas.width/2, canvas.height/2 - 60);
  ctx.font = `bold ${Math.floor(canvas.height/28)}px 'Press Start 2P', 'Courier New', monospace`;
  ctx.fillStyle = '#fff';
  ctx.shadowBlur = 0;
  ctx.fillText('Controls:', canvas.width/2, canvas.height/2 - 10);
  ctx.fillText('Move: A/D or Left/Right', canvas.width/2, canvas.height/2 + 30);
  ctx.fillText('Jump: W or Up', canvas.width/2, canvas.height/2 + 60);
  ctx.fillText('Bump: S or Down', canvas.width/2, canvas.height/2 + 90);
  ctx.fillText('Set: Q (ground/air)', canvas.width/2, canvas.height/2 + 120);
  ctx.fillText('Spike: Shift (air, after set)', canvas.width/2, canvas.height/2 + 150);
  ctx.fillText('Block: E (air, near net)', canvas.width/2, canvas.height/2 + 180);
  ctx.font = `bold ${Math.floor(canvas.height/22)}px 'Press Start 2P', 'Courier New', monospace`;
  ctx.fillStyle = '#ffe066';
  ctx.fillText('Tap or Click to Start', canvas.width/2, canvas.height/2 + 240);
  ctx.restore();
}

function startGameFromScreen() {
  if (gameState === 'start') {
    gameState = 'serve';
    startServe();
    window.removeEventListener('keydown', startListener);
    window.removeEventListener('mousedown', startGameFromScreen);
    window.removeEventListener('touchstart', startGameFromScreen);
    requestAnimationFrame(gameLoop);
  }
}

function startListener(e) {
  if (gameState === 'start' && (e.code === 'Enter' || e.key === 'Enter')) {
    startGameFromScreen();
  }
}

window.addEventListener('keydown', startListener);
window.addEventListener('mousedown', startGameFromScreen);
window.addEventListener('touchstart', startGameFromScreen);

function gameLoop() {
  if (gameState === 'play') {
    updateBat();
    updateAIBat();
    updateBall();
  } else if (gameState === 'serve') {
    updateAIServe();
  }
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawCourt();
  drawBall();
  drawBat();
  drawAIBat();
  if (gameState === 'serve') drawServeOverlay();
  if (gameState === 'start') drawStartScreen();
  requestAnimationFrame(gameLoop);
}

// At the end of the file, just call drawStartScreen() once to show the start screen
drawStartScreen(); 