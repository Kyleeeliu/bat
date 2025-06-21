const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// --- Volleyball Court Settings ---
const ZOOM = 2;
const COURT_WIDTH = 480;
const COURT_HEIGHT = 240;
const NET_HEIGHT = 64;
const GROUND_Y = COURT_HEIGHT - 32;

// Player indicator
const ARROW_SIZE = 16;
const ARROW_COLOR = '#4287f5';
const ARROW_OFFSET_Y = -10;

// Bat settings
const SPRITE_SIZE = 64;
const BAT_HITBOX_RADIUS = 14; // Smaller hitbox for more precise collision
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

// Second AI Bat
let ai2BatX = COURT_WIDTH - 160 - SPRITE_SIZE;
let ai2BatY = GROUND_Y - SPRITE_SIZE;
let ai2BatVY = 0;
let ai2OnGround = false;
let ai2Facing = -1;
let ai2Skill = 'idle';
let ai2SkillTimer = 0;

// Teammate AI
let teammateBatX = 120;
let teammateBatY = GROUND_Y - SPRITE_SIZE;
let teammateBatVY = 0;
let teammateOnGround = true; // Always true since no jumping
let teammateFacing = 1;
let teammateSkill = 'idle';
let teammateSkillTimer = 0;
let teammateLastTouch = 0; // Track when teammate last touched the ball

// Ball settings (slower)
let ballX = COURT_WIDTH / 2;
let ballY = 80;
let ballVX = 1.2; // slower
let ballVY = -1.2; // slower
const BALL_RADIUS = 10;
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

// Debug toggle
let debugMode = false;
window.addEventListener('keydown', e => {
  if (e.key.toLowerCase() === 'h') debugMode = !debugMode;
});

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
  if (dist < BALL_RADIUS + BAT_HITBOX_RADIUS - 8) canSkill = true;

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
      ballVX = 0; // Completely vertical set
      ballVY = -4.2; // Slightly stronger upward velocity for vertical set
      skillTimer = 18;
    }
    // Spike (automatic, only after set, airborne, ball above bat) on 2nd/3rd touch
    else if (playerTouches > 0 && playerTouches < 3 && canSpike && !onGround && ballY < batY + 8 && lastSkill === "set") {
      batSkill = "spike";
      lastSkill = "spike";
      canSpike = false;
      ballVX = 3.2 * (ballX < COURT_WIDTH/2 ? 1 : -1);
      ballVY = 4.2;
      skillTimer = 20;
      spawnSpikeParticles(ballX, ballY);
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

function updateTeammateAI() {
  // Simple AI: follow ball on left side, focus on setting and bumping
  let targetX = ballX - SPRITE_SIZE / 2;
  let dx = ballX - (teammateBatX + SPRITE_SIZE / 2);
  
  // Only move if ball is on team's side
  if (ballX < COURT_WIDTH / 2) {
    // Stay in the back half of the court
    if (teammateBatX < COURT_WIDTH / 4) {
      teammateBatX += batSpeed * 0.7;
      teammateFacing = -1;
    } else if (teammateBatX > COURT_WIDTH / 2 - SPRITE_SIZE) {
      teammateBatX -= batSpeed * 0.7;
      teammateFacing = 1;
    } else if (Math.abs(dx) > 8) {
      teammateBatX += Math.sign(dx) * batSpeed * 0.7;
      teammateFacing = dx < 0 ? 1 : -1;
    }
  }

  // No jumping logic since teammate stays on ground

  // Clamp to left side
  if (teammateBatX < 0) teammateBatX = 0;
  if (teammateBatX > COURT_WIDTH / 2 - SPRITE_SIZE) teammateBatX = COURT_WIDTH / 2 - SPRITE_SIZE;
  teammateBatY = GROUND_Y - SPRITE_SIZE; // Always stay on ground

  // Teammate skill logic
  let canSkill = false;
  let teammateBatCenterX = teammateBatX + SPRITE_SIZE / 2;
  let teammateBatCenterY = teammateBatY + SPRITE_SIZE / 2;
  let dxBall = ballX - teammateBatCenterX;
  let dyBall = ballY - teammateBatCenterY;
  let dist = Math.sqrt(dxBall * dxBall + dyBall * dyBall);
  
  if (dist < BALL_RADIUS + SPRITE_SIZE / 2 + 8) canSkill = true;

  // Check if enough time has passed since last touch (prevent consecutive touches)
  let canTouchBall = (performance.now() - teammateLastTouch) > 1000; // 1 second cooldown

  if (canSkill && teammateSkillTimer <= 0 && ballX < COURT_WIDTH / 2 && canTouchBall) {
    // Bump on first touch
    if (playerTouches === 0) {
      teammateSkill = 'bump';
      ballVX = 0.8;
      ballVY = -2.5;
      teammateSkillTimer = 18;
      teammateLastTouch = performance.now();
    }
    // Vertical set on second touch
    else if (playerTouches === 1) {
      teammateSkill = 'set';
      ballVX = 0; // Completely vertical
      ballVY = -4.2;
      teammateSkillTimer = 18;
      teammateLastTouch = performance.now();
    }
  }

  if (teammateSkillTimer > 0) teammateSkillTimer--;
  if (teammateSkillTimer === 0 && teammateSkill !== 'idle') teammateSkill = 'idle';
}

function updateAIBat() {
  // Nerfed AI: slower, jumps less, less precise
  let targetY = ballY - SPRITE_SIZE / 2;
  let dx = ballX - (aiBatX + SPRITE_SIZE / 2);
  // Only move if ball is on AI's side or above net
  if (ballX > COURT_WIDTH / 2 || ballY < GROUND_Y - NET_HEIGHT) {
    if (Math.abs(dx) > 16) { // Less precise
      aiBatX += Math.sign(dx) * batSpeed * 0.45; // Slower
      aiFacing = dx < 0 ? 1 : -1;
    }
    // AI jump if ball is high and close (even more restrictive)
    if (ballY < aiBatY - SPRITE_SIZE/2 && aiOnGround && Math.abs(dx) < 24 && Math.random() > 0.92) { // Very rare
      aiBatVY = -batJump * 0.6; // Lower jump
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
    // Spike (automatic, only after set, airborne, ball above bat) on 2nd/3rd touch
    else if (aiTouches > 0 && aiTouches < 3 && aiCanSpike && !aiOnGround && ballY < aiBatY + 8 && aiLastSkill === 'set') {
      aiSkill = 'spike';
      aiLastSkill = 'spike';
      aiCanSpike = false;
      ballVX = -3.2;
      ballVY = 4.2;
      aiSkillTimer = 20;
      spawnSpikeParticles(ballX, ballY);
    }
  }
  if (aiSkillTimer > 0) aiSkillTimer--;
  if (aiSkillTimer === 0 && aiSkill !== 'idle') aiSkill = 'idle';
}

function updateAI2Bat() {
  // Nerfed second AI: even slower, jumps very rarely
  let dx = ballX - (ai2BatX + SPRITE_SIZE / 2);
  
  // Only move if ball is on AI's side
  if (ballX > COURT_WIDTH / 2) {
    // Stay in the back portion of the right court
    if (ai2BatX < COURT_WIDTH * 0.75) {
      ai2BatX += batSpeed * 0.35;
      ai2Facing = -1;
    } else if (ai2BatX > COURT_WIDTH - SPRITE_SIZE) {
      ai2BatX -= batSpeed * 0.35;
      ai2Facing = 1;
    } else if (Math.abs(dx) > 16) {
      ai2BatX += Math.sign(dx) * batSpeed * 0.35;
      ai2Facing = dx < 0 ? 1 : -1;
    }
    // Jump very rarely
    if (ballY < ai2BatY - SPRITE_SIZE/2 && ai2OnGround && Math.abs(dx) < 32 && Math.random() > 0.97) {
      ai2BatVY = -batJump * 0.5;
      ai2OnGround = false;
    }
  }
  
  ai2BatY += ai2BatVY;
  ai2BatVY += GRAVITY_BAT;
  
  // Clamp to right side
  if (ai2BatX < COURT_WIDTH / 2) ai2BatX = COURT_WIDTH / 2;
  if (ai2BatX > COURT_WIDTH - SPRITE_SIZE) ai2BatX = COURT_WIDTH - SPRITE_SIZE;
  if (ai2BatY > GROUND_Y - SPRITE_SIZE) {
    ai2BatY = GROUND_Y - SPRITE_SIZE;
    ai2BatVY = 0;
    ai2OnGround = true;
  }
  if (ai2BatY < 0) ai2BatY = 0;
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
      server = 'player';
      startServe();
      return;
    } else if (ballX > COURT_WIDTH / 2) {
      playerScore++;
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
    server = 'ai';
    startServe();
    return;
  }
  if (aiTouches > 3) {
    playerScore++;
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
    // If the ball is above the net and coming down, bounce it up
    if (ballY < GROUND_Y - NET_HEIGHT + BALL_RADIUS && ballVY > 0) {
      ballY = GROUND_Y - NET_HEIGHT - BALL_RADIUS;
      ballVY = -Math.max(Math.abs(ballVY), 1.2); // always bounce up strongly
      // Nudge horizontally away from net
      if (ballX < COURT_WIDTH / 2) {
        ballX = COURT_WIDTH / 2 - BALL_RADIUS - 12;
        ballVX = -Math.max(Math.abs(ballVX), 1.2); // always left
      } else {
        ballX = COURT_WIDTH / 2 + BALL_RADIUS + 12;
        ballVX = Math.max(Math.abs(ballVX), 1.2); // always right
      }
    } else {
      // Side collision (normal case)
      if (ballVX > 0) {
        ballX = COURT_WIDTH / 2 - BALL_RADIUS - 12;
        ballVX = -Math.max(Math.abs(ballVX), 1.2);
      } else {
        ballX = COURT_WIDTH / 2 + BALL_RADIUS + 12;
        ballVX = Math.max(Math.abs(ballVX), 1.2);
      }
      // Nudge ball vertically if stuck
      if (Math.abs(ballVY) < 0.7) ballVY += (Math.random() - 0.5) * 1.8;
    }
  }
  // Bat collision (player)
  let batCenterX = batX + SPRITE_SIZE / 2;
  let batCenterY = batY + SPRITE_SIZE / 2;
  let dx = ballX - batCenterX;
  let dy = ballY - batCenterY;
  let dist = Math.sqrt(dx * dx + dy * dy);
  if (dist < BALL_RADIUS + BAT_HITBOX_RADIUS - 8) {
    if (lastTouchedBy !== 'player') {
      playerTouches++;
      lastTouchedBy = 'player';
    }
    let angle = Math.atan2(dy, dx);
    let force = 3.5;
    ballVX = Math.cos(angle) * force;
    ballVY = Math.sin(angle) * force;
    ballX = batCenterX + Math.cos(angle) * (BALL_RADIUS + BAT_HITBOX_RADIUS - 8);
    ballY = batCenterY + Math.sin(angle) * (BALL_RADIUS + BAT_HITBOX_RADIUS - 8);
  }

  // Bat collision (teammate)
  let teammateBatCenterX = teammateBatX + SPRITE_SIZE / 2;
  let teammateBatCenterY = teammateBatY + SPRITE_SIZE / 2;
  let tdx = ballX - teammateBatCenterX;
  let tdy = ballY - teammateBatCenterY;
  let tdist = Math.sqrt(tdx * tdx + tdy * tdy);
  if (tdist < BALL_RADIUS + BAT_HITBOX_RADIUS - 8) {
    if (lastTouchedBy !== 'player') {
      playerTouches++;
      lastTouchedBy = 'player';
    }
    let angle = Math.atan2(tdy, tdx);
    let force = 3.5;
    ballVX = Math.cos(angle) * force;
    ballVY = Math.sin(angle) * force;
    ballX = teammateBatCenterX + Math.cos(angle) * (BALL_RADIUS + BAT_HITBOX_RADIUS - 8);
    ballY = teammateBatCenterY + Math.sin(angle) * (BALL_RADIUS + BAT_HITBOX_RADIUS - 8);
  }
  // Bat collision (AI)
  let aiBatCenterX = aiBatX + SPRITE_SIZE / 2;
  let aiBatCenterY = aiBatY + SPRITE_SIZE / 2;
  let adx = ballX - aiBatCenterX;
  let ady = ballY - aiBatCenterY;
  let adist = Math.sqrt(adx * adx + ady * ady);
  if (adist < BALL_RADIUS + BAT_HITBOX_RADIUS - 8) {
    if (lastTouchedBy !== 'ai') {
      aiTouches++;
      lastTouchedBy = 'ai';
    }
    let angle = Math.atan2(ady, adx);
    let force = 3.5;
    ballVX = Math.cos(angle) * force;
    ballVY = Math.sin(angle) * force;
    ballX = aiBatCenterX + Math.cos(angle) * (BALL_RADIUS + BAT_HITBOX_RADIUS - 8);
    ballY = aiBatCenterY + Math.sin(angle) * (BALL_RADIUS + BAT_HITBOX_RADIUS - 8);
  }

  // Bat collision (AI 2)
  let ai2BatCenterX = ai2BatX + SPRITE_SIZE / 2;
  let ai2BatCenterY = ai2BatY + SPRITE_SIZE / 2;
  let a2dx = ballX - ai2BatCenterX;
  let a2dy = ballY - ai2BatCenterY;
  let a2dist = Math.sqrt(a2dx * a2dx + a2dy * a2dy);
  if (a2dist < BALL_RADIUS + BAT_HITBOX_RADIUS - 8) {
    if (lastTouchedBy !== 'ai') {
      aiTouches++;
      lastTouchedBy = 'ai';
    }
    let angle = Math.atan2(a2dy, a2dx);
    let force = 3.5;
    ballVX = Math.cos(angle) * force;
    ballVY = Math.sin(angle) * force;
    ballX = ai2BatCenterX + Math.cos(angle) * (BALL_RADIUS + BAT_HITBOX_RADIUS - 8);
    ballY = ai2BatCenterY + Math.sin(angle) * (BALL_RADIUS + BAT_HITBOX_RADIUS - 8);
  }
}

// --- Scoreboard State ---
let setNumber = 1;
let playerSets = 0;
let aiSets = 0;

function drawScoreboard() {
  // Digital scoreboard style
  const scoreboardH = 64;
  ctx.save();
  ctx.translate(0, 0);
  ctx.globalAlpha = 0.98;
  // Metallic frame
  let grad = ctx.createLinearGradient(0, 0, 0, scoreboardH);
  grad.addColorStop(0, '#bfcfff');
  grad.addColorStop(0.5, '#232946');
  grad.addColorStop(1, '#bfcfff');
  ctx.fillStyle = grad;
  ctx.fillRect(canvas.width/2-270, 0, 540, scoreboardH);
  ctx.strokeStyle = '#ffe066';
  ctx.lineWidth = 5;
  ctx.strokeRect(canvas.width/2-270, 0, 540, scoreboardH);
  // Glow effect
  ctx.save();
  ctx.shadowColor = '#ffe066';
  ctx.shadowBlur = 16;
  ctx.strokeRect(canvas.width/2-270, 0, 540, scoreboardH);
  ctx.restore();
  // Title
  ctx.font = 'bold 28px "Press Start 2P", monospace';
  ctx.fillStyle = '#ffe066';
  ctx.textAlign = 'center';
  ctx.shadowColor = '#000';
  ctx.shadowBlur = 8;
  ctx.fillText('BAT VOLLEYBALL TOURNAMENT', canvas.width/2, 36);
  ctx.shadowBlur = 0;
  // Team names
  ctx.font = 'bold 20px "Press Start 2P", monospace';
  ctx.fillStyle = '#bfcfff';
  ctx.textAlign = 'right';
  ctx.fillText('YOU', canvas.width/2-120, 60);
  ctx.textAlign = 'left';
  ctx.fillText('ENEMY', canvas.width/2+120, 60);
  // Scores (digital style)
  ctx.font = 'bold 40px "Press Start 2P", monospace';
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'right';
  ctx.shadowColor = '#ffe066';
  ctx.shadowBlur = 12;
  ctx.fillText(playerScore, canvas.width/2-40, 60);
  ctx.textAlign = 'left';
  ctx.fillText(aiScore, canvas.width/2+40, 60);
  ctx.shadowBlur = 0;
  // Sets
  ctx.font = 'bold 18px "Press Start 2P", monospace';
  ctx.fillStyle = '#ffe066';
  ctx.textAlign = 'center';
  ctx.fillText(`SET ${setNumber}  |  YOU: ${playerSets}  ENEMY: ${aiSets}`, canvas.width/2, 60);
  // Serving indicator
  ctx.font = 'bold 16px "Press Start 2P", monospace';
  ctx.fillStyle = '#ffe066';
  if (server === 'player') {
    ctx.beginPath();
    ctx.arc(canvas.width/2-140, 44, 10, 0, Math.PI*2);
    ctx.fill();
    ctx.fillStyle = '#181824';
    ctx.font = 'bold 16px "Press Start 2P", monospace';
    ctx.fillText('S', canvas.width/2-140, 50);
  } else {
    ctx.beginPath();
    ctx.arc(canvas.width/2+140, 44, 10, 0, Math.PI*2);
    ctx.fill();
    ctx.fillStyle = '#181824';
    ctx.font = 'bold 16px "Press Start 2P", monospace';
    ctx.fillText('S', canvas.width/2+140, 50);
  }
  ctx.restore();
}

// Redesign drawCourt for a real volleyball court look
function drawCourt() {
  // Center court in window
  const offsetX = (canvas.width / 2 - (COURT_WIDTH * ZOOM) / 2);
  const offsetY = (canvas.height / 2 - (COURT_HEIGHT * ZOOM) / 2) + 32; // push down for scoreboard
  ctx.save();
  ctx.translate(offsetX, offsetY);
  ctx.scale(ZOOM, ZOOM);

  // --- Stadium Background ---
  // Sky gradient
  let grad = ctx.createLinearGradient(0, 0, 0, COURT_HEIGHT);
  grad.addColorStop(0, '#3a4a7a'); // deep blue
  grad.addColorStop(0.5, '#6ec6ff'); // sky blue
  grad.addColorStop(0.8, '#ffe066'); // stadium lights
  grad.addColorStop(1, '#e0b080'); // floor reflection
  ctx.fillStyle = grad;
  ctx.fillRect(-60, -60, COURT_WIDTH+120, COURT_HEIGHT+120);

  // --- Stadium Stands (pixel-art style) ---
  // Draw several rows of stands as rectangles with crowd dots
  const standRows = 4;
  const standHeight = 18;
  const standColors = ['#232946', '#232946', '#232946', '#2a2e4a']; // more muted
  for (let row = 0; row < standRows; row++) {
    let y = 32 + row * standHeight;
    ctx.fillStyle = standColors[row % standColors.length];
    ctx.fillRect(-30, y, COURT_WIDTH+60, standHeight);
    // Draw crowd heads as dots (less, smaller, muted)
    for (let i = 0; i < 18; i++) {
      let cx = (i / 18) * COURT_WIDTH + 8 + Math.random()*2 - 1;
      let cy = y + standHeight - 6 + Math.random()*2 - 1;
      let crowdColors = ['#232946', '#2a2e4a', '#3a3e5a', '#44486a', '#bfcfff']; // mostly dark
      ctx.beginPath();
      ctx.arc(cx, cy, 1.2 + Math.random()*0.6, 0, Math.PI*2);
      ctx.fillStyle = crowdColors[Math.floor(Math.random()*crowdColors.length)];
      ctx.globalAlpha = 0.25 + Math.random()*0.15;
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  // Spotlights
  for (let i = 0; i < 3; i++) {
    ctx.save();
    ctx.globalAlpha = 0.12;
    ctx.beginPath();
    ctx.ellipse(COURT_WIDTH/2 + (i-1)*120, 0, 80, 180, 0, 0, Math.PI*2);
    ctx.fillStyle = '#fffbe6';
    ctx.fill();
    ctx.restore();
  }

  // Crowd silhouettes
  ctx.save();
  ctx.globalAlpha = 0.13;
  ctx.fillStyle = '#232946';
  for (let i = 0; i < 40; i++) {
    let x = (i/40) * COURT_WIDTH;
    let h = 10 + Math.sin(i*0.7)*4 + Math.random()*4;
    ctx.beginPath();
    ctx.ellipse(x, 18+h, 16, h, 0, 0, Math.PI*2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.restore();

  // --- Court Floor ---
  // Wood color with subtle gradient
  let woodGrad = ctx.createLinearGradient(0, GROUND_Y-16, 0, COURT_HEIGHT+40);
  woodGrad.addColorStop(0, '#e0b080');
  woodGrad.addColorStop(1, '#b97a56');
  ctx.fillStyle = woodGrad;
  ctx.fillRect(0, GROUND_Y, COURT_WIDTH, COURT_HEIGHT - GROUND_Y + 40);
  // Court colored area (side view, just a band)
  ctx.fillStyle = '#2a4d8f';
  ctx.fillRect(0, GROUND_Y-8, COURT_WIDTH, 8);

  // Court lines
  ctx.save();
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2/ZOOM;
  ctx.globalAlpha = 0.7;
  // Baselines
  ctx.beginPath();
  ctx.moveTo(0, GROUND_Y);
  ctx.lineTo(COURT_WIDTH, GROUND_Y);
  ctx.moveTo(0, GROUND_Y-32);
  ctx.lineTo(COURT_WIDTH, GROUND_Y-32);
  ctx.stroke();
  // Sidelines
  ctx.beginPath();
  ctx.moveTo(0, GROUND_Y-32);
  ctx.lineTo(0, GROUND_Y);
  ctx.moveTo(COURT_WIDTH, GROUND_Y-32);
  ctx.lineTo(COURT_WIDTH, GROUND_Y);
  ctx.stroke();
  // Center line
  ctx.beginPath();
  ctx.moveTo(COURT_WIDTH/2, GROUND_Y-32);
  ctx.lineTo(COURT_WIDTH/2, GROUND_Y);
  ctx.stroke();
  ctx.restore();

  // --- Net Posts ---
  ctx.save();
  ctx.fillStyle = '#bbb';
  ctx.strokeStyle = '#888';
  ctx.lineWidth = 2/ZOOM;
  // Left post
  ctx.beginPath();
  ctx.roundRect(COURT_WIDTH/2-8, GROUND_Y-NET_HEIGHT-16, 8, NET_HEIGHT+32, 4);
  ctx.fill(); ctx.stroke();
  // Right post
  ctx.beginPath();
  ctx.roundRect(COURT_WIDTH/2, GROUND_Y-NET_HEIGHT-16, 8, NET_HEIGHT+32, 4);
  ctx.fill(); ctx.stroke();
  ctx.restore();

  // --- Net Mesh ---
  ctx.save();
  ctx.globalAlpha = 0.8;
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 1/ZOOM;
  for (let y = 0; y < NET_HEIGHT; y += 6) {
    ctx.beginPath();
    ctx.moveTo(COURT_WIDTH/2-4, GROUND_Y - NET_HEIGHT + y);
    ctx.lineTo(COURT_WIDTH/2+4, GROUND_Y - NET_HEIGHT + y);
    ctx.stroke();
  }
  for (let x = -4; x <= 4; x += 2) {
    ctx.beginPath();
    ctx.moveTo(COURT_WIDTH/2 + x, GROUND_Y - NET_HEIGHT);
    ctx.lineTo(COURT_WIDTH/2 + x, GROUND_Y);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.restore();

  // --- Net Band ---
  ctx.fillStyle = '#ffe066';
  ctx.fillRect(COURT_WIDTH/2-5, GROUND_Y-NET_HEIGHT, 10, 7);
  // Net shadow
  ctx.globalAlpha = 0.18;
  ctx.fillStyle = '#000';
  ctx.fillRect(COURT_WIDTH/2-4, GROUND_Y-NET_HEIGHT+7, 8, NET_HEIGHT-7);
  ctx.globalAlpha = 1;

  ctx.restore();
}

function drawBall() {
  const offsetX = (canvas.width / 2 - (COURT_WIDTH * ZOOM) / 2);
  const offsetY = (canvas.height / 2 - (COURT_HEIGHT * ZOOM) / 2);
  ctx.save();
  ctx.translate(offsetX, offsetY);
  ctx.scale(ZOOM, ZOOM);
  // Ball shadow
  ctx.save();
  ctx.globalAlpha = 0.25;
  ctx.fillStyle = '#222';
  ctx.beginPath();
  ctx.ellipse(ballX, GROUND_Y-2, BALL_RADIUS*1.1, BALL_RADIUS*0.45, 0, 0, Math.PI*2);
  ctx.fill();
  ctx.restore();
  // Ball main
  ctx.save();
  ctx.beginPath();
  ctx.arc(ballX, ballY, BALL_RADIUS, 0, Math.PI * 2);
  ctx.fillStyle = '#ffe066';
  ctx.shadowColor = '#fffbe6';
  ctx.shadowBlur = 8;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = '#e0b800';
  ctx.lineWidth = 2;
  ctx.stroke();
  // Volleyball pattern
  ctx.save();
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 1.2;
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.arc(ballX, ballY, BALL_RADIUS-1, (i/3)*Math.PI*2, ((i+1)/3)*Math.PI*2);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.ellipse(ballX, ballY, BALL_RADIUS-2, BALL_RADIUS/2, Math.PI/4, 0, Math.PI*2);
  ctx.stroke();
  ctx.restore();
  ctx.restore();
  ctx.restore();
}

function drawBat() {
  const offsetX = (canvas.width / 2 - (COURT_WIDTH * ZOOM) / 2);
  const offsetY = (canvas.height / 2 - (COURT_HEIGHT * ZOOM) / 2);
  ctx.save();
  ctx.translate(offsetX, offsetY);
  ctx.scale(ZOOM, ZOOM);
  // Bat shadow
  ctx.save();
  ctx.globalAlpha = 0.18;
  ctx.fillStyle = '#222';
  ctx.beginPath();
  ctx.ellipse(batX + SPRITE_SIZE/2, GROUND_Y-2, SPRITE_SIZE*0.38, 7, 0, 0, Math.PI*2);
  ctx.fill();
  ctx.restore();
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
  // Bat shadow
  ctx.save();
  ctx.globalAlpha = 0.18;
  ctx.fillStyle = '#222';
  ctx.beginPath();
  ctx.ellipse(aiBatX + SPRITE_SIZE/2, GROUND_Y-2, SPRITE_SIZE*0.38, 7, 0, 0, Math.PI*2);
  ctx.fill();
  ctx.restore();
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

function drawTeammateBat() {
  const offsetX = (canvas.width / 2 - (COURT_WIDTH * ZOOM) / 2);
  const offsetY = (canvas.height / 2 - (COURT_HEIGHT * ZOOM) / 2);
  ctx.save();
  ctx.translate(offsetX, offsetY);
  ctx.scale(ZOOM, ZOOM);
  // Bat shadow
  ctx.save();
  ctx.globalAlpha = 0.18;
  ctx.fillStyle = '#222';
  ctx.beginPath();
  ctx.ellipse(teammateBatX + SPRITE_SIZE/2, GROUND_Y-2, SPRITE_SIZE*0.38, 7, 0, 0, Math.PI*2);
  ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.translate(teammateBatX, teammateBatY);
  if (teammateFacing === -1) {
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

function drawPlayerArrow() {
  const offsetX = (canvas.width / 2 - (COURT_WIDTH * ZOOM) / 2);
  const offsetY = (canvas.height / 2 - (COURT_HEIGHT * ZOOM) / 2);
  ctx.save();
  ctx.translate(offsetX, offsetY);
  ctx.scale(ZOOM, ZOOM);
  
  // Draw arrow above player
  ctx.beginPath();
  ctx.moveTo(batX + SPRITE_SIZE/2, batY + ARROW_OFFSET_Y);
  ctx.lineTo(batX + SPRITE_SIZE/2 - ARROW_SIZE/2, batY + ARROW_OFFSET_Y - ARROW_SIZE);
  ctx.lineTo(batX + SPRITE_SIZE/2 + ARROW_SIZE/2, batY + ARROW_OFFSET_Y - ARROW_SIZE);
  ctx.closePath();
  
  ctx.fillStyle = ARROW_COLOR;
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.stroke();
  
  ctx.restore();
}

function drawAI2Bat() {
  const offsetX = (canvas.width / 2 - (COURT_WIDTH * ZOOM) / 2);
  const offsetY = (canvas.height / 2 - (COURT_HEIGHT * ZOOM) / 2);
  ctx.save();
  ctx.translate(offsetX, offsetY);
  ctx.scale(ZOOM, ZOOM);
  // Bat shadow
  ctx.save();
  ctx.globalAlpha = 0.18;
  ctx.fillStyle = '#222';
  ctx.beginPath();
  ctx.ellipse(ai2BatX + SPRITE_SIZE/2, GROUND_Y-2, SPRITE_SIZE*0.38, 7, 0, 0, Math.PI*2);
  ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.translate(ai2BatX, ai2BatY);
  if (ai2Facing === -1) {
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
  ctx.globalAlpha = 0.7;
  ctx.fillStyle = '#232946';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.globalAlpha = 1;
  ctx.font = `bold ${Math.floor(canvas.height/18)}px 'Press Start 2P', 'Segoe UI', sans-serif`;
  ctx.fillStyle = '#ffe066';
  ctx.textAlign = 'center';
  ctx.shadowColor = '#000';
  ctx.shadowBlur = 8;
  let t = Date.now()/400;
  let y = 120 + Math.sin(t)*8;
  if (server === 'player') {
    ctx.fillText('Press Space to Serve!', canvas.width/2, y);
  } else {
    ctx.fillText('AI Serving...', canvas.width/2, y);
  }
  ctx.restore();
}

// --- Game Menu State ---
let menuState = {
  difficulty: 1, // 0: Easy, 1: Normal, 2: Hard
  mode: 1, // 0: 1v1, 1: 2v2
  selecting: 'mode', // 'mode' or 'difficulty' or 'start'
};
const DIFFICULTY_LABELS = ['Easy', 'Normal', 'Hard'];
const MODE_LABELS = ['1v1', '2v2'];

function drawStartScreen() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  // Background gradient
  let grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
  grad.addColorStop(0, '#232946');
  grad.addColorStop(1, '#12121c');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  // Animated overlay
  ctx.save();
  ctx.globalAlpha = 0.18;
  ctx.fillStyle = '#ffe066';
  ctx.beginPath();
  ctx.ellipse(canvas.width/2, canvas.height/2+40, 420, 80+Math.sin(Date.now()/400)*10, 0, 0, Math.PI*2);
  ctx.fill();
  ctx.restore();
  // Title
  ctx.save();
  ctx.font = `bold ${Math.floor(canvas.height/9)}px 'Press Start 2P', 'Segoe UI', 'Courier New', monospace`;
  ctx.fillStyle = '#ffe066';
  ctx.textAlign = 'center';
  ctx.shadowColor = '#000';
  ctx.shadowBlur = 16;
  ctx.fillText('BAT VOLLEY', canvas.width/2, canvas.height/2 - 180);
  ctx.restore();
  // Menu Card
  const cardW = 420, cardH = 320;
  const cardX = canvas.width/2 - cardW/2, cardY = canvas.height/2 - cardH/2 + 30;
  ctx.save();
  ctx.globalAlpha = 0.92;
  ctx.fillStyle = '#232946';
  ctx.strokeStyle = '#ffe066';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.roundRect(cardX, cardY, cardW, cardH, 32);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
  // Menu Options
  ctx.save();
  ctx.font = `bold 32px 'Press Start 2P', 'Segoe UI', monospace`;
  ctx.textAlign = 'center';
  ctx.shadowColor = '#000';
  ctx.shadowBlur = 8;
  // Mode
  ctx.fillStyle = menuState.selecting === 'mode' ? '#ffe066' : '#fff';
  ctx.fillText('Mode', canvas.width/2, cardY + 70);
  MODE_LABELS.forEach((label, i) => {
    ctx.font = menuState.mode === i ? `bold 30px 'Press Start 2P', monospace` : `24px 'Press Start 2P', monospace`;
    ctx.fillStyle = menuState.mode === i ? '#ffe066' : '#bfcfff';
    ctx.fillText(label, canvas.width/2 - 60 + i*120, cardY + 120);
    if (menuState.mode === i) {
      ctx.beginPath();
      ctx.arc(canvas.width/2 - 60 + i*120, cardY + 130, 8, 0, Math.PI*2);
      ctx.fillStyle = '#ffe066';
      ctx.fill();
    }
  });
  // Difficulty
  ctx.font = `bold 32px 'Press Start 2P', 'Segoe UI', monospace`;
  ctx.fillStyle = menuState.selecting === 'difficulty' ? '#ffe066' : '#fff';
  ctx.fillText('Difficulty', canvas.width/2, cardY + 180);
  DIFFICULTY_LABELS.forEach((label, i) => {
    ctx.font = menuState.difficulty === i ? `bold 30px 'Press Start 2P', monospace` : `24px 'Press Start 2P', monospace`;
    ctx.fillStyle = menuState.difficulty === i ? '#ffe066' : '#bfcfff';
    ctx.fillText(label, canvas.width/2 - 100 + i*100, cardY + 230);
    if (menuState.difficulty === i) {
      ctx.beginPath();
      ctx.arc(canvas.width/2 - 100 + i*100, cardY + 240, 8, 0, Math.PI*2);
      ctx.fillStyle = '#ffe066';
      ctx.fill();
    }
  });
  // Start Button
  ctx.font = `bold 36px 'Press Start 2P', 'Segoe UI', monospace`;
  ctx.fillStyle = menuState.selecting === 'start' ? '#ffe066' : '#fff';
  ctx.shadowBlur = 12;
  ctx.fillText('START', canvas.width/2, cardY + 300);
  ctx.restore();
  // Controls hint
  ctx.save();
  ctx.font = `18px 'Press Start 2P', monospace`;
  ctx.fillStyle = '#bfcfff';
  ctx.textAlign = 'center';
  ctx.shadowBlur = 0;
  ctx.fillText('Use Arrow Keys or Tab/Enter to navigate. Esc to quit.', canvas.width/2, cardY + cardH + 32);
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

function drawDebug() {
  // Draw hitboxes for all bats and the ball
  const offsetX = (canvas.width / 2 - (COURT_WIDTH * ZOOM) / 2);
  const offsetY = (canvas.height / 2 - (COURT_HEIGHT * ZOOM) / 2);
  ctx.save();
  ctx.translate(offsetX, offsetY);
  ctx.scale(ZOOM, ZOOM);
  ctx.globalAlpha = 0.5;
  // Player bat
  ctx.strokeStyle = '#00ff00';
  ctx.beginPath();
  ctx.arc(batX + SPRITE_SIZE/2, batY + SPRITE_SIZE/2, BAT_HITBOX_RADIUS, 0, Math.PI*2);
  ctx.stroke();
  // Teammate
  ctx.strokeStyle = '#00bfff';
  ctx.beginPath();
  ctx.arc(teammateBatX + SPRITE_SIZE/2, teammateBatY + SPRITE_SIZE/2, BAT_HITBOX_RADIUS, 0, Math.PI*2);
  ctx.stroke();
  // AI 1
  ctx.strokeStyle = '#ff0000';
  ctx.beginPath();
  ctx.arc(aiBatX + SPRITE_SIZE/2, aiBatY + SPRITE_SIZE/2, BAT_HITBOX_RADIUS, 0, Math.PI*2);
  ctx.stroke();
  // AI 2
  ctx.strokeStyle = '#ff8800';
  ctx.beginPath();
  ctx.arc(ai2BatX + SPRITE_SIZE/2, ai2BatY + SPRITE_SIZE/2, BAT_HITBOX_RADIUS, 0, Math.PI*2);
  ctx.stroke();
  // Ball
  ctx.strokeStyle = '#ffff00';
  ctx.beginPath();
  ctx.arc(ballX, ballY, BALL_RADIUS, 0, Math.PI*2);
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.restore();
  // Debug info (top left)
  ctx.save();
  ctx.font = '14px monospace';
  ctx.fillStyle = '#ffe066';
  ctx.textAlign = 'left';
  let y = 80;
  ctx.fillText(`Player: (${batX.toFixed(1)}, ${batY.toFixed(1)}) v=(${batVX.toFixed(2)}, ${batVY.toFixed(2)})`, 16, y); y += 18;
  ctx.fillText(`Teammate: (${teammateBatX.toFixed(1)}, ${teammateBatY.toFixed(1)})`, 16, y); y += 18;
  ctx.fillText(`AI1: (${aiBatX.toFixed(1)}, ${aiBatY.toFixed(1)}) vY=${aiBatVY.toFixed(2)}`, 16, y); y += 18;
  ctx.fillText(`AI2: (${ai2BatX.toFixed(1)}, ${ai2BatY.toFixed(1)}) vY=${ai2BatVY.toFixed(2)}`, 16, y); y += 18;
  ctx.fillText(`Ball: (${ballX.toFixed(1)}, ${ballY.toFixed(1)}) v=(${ballVX.toFixed(2)}, ${ballVY.toFixed(2)})`, 16, y); y += 18;
  ctx.fillText(`Touches: Player=${playerTouches} AI=${aiTouches} Last=${lastTouchedBy}`, 16, y); y += 18;
  ctx.fillText(`GameState: ${gameState} | Server: ${server}`, 16, y); y += 18;
  ctx.fillText(`BatSkill: ${batSkill} | AI1Skill: ${aiSkill} | AI2Skill: ${ai2Skill} | TeammateSkill: ${teammateSkill}`, 16, y); y += 18;
  ctx.restore();
}

// --- Particle System for Spike Effect ---
let particles = [];
function spawnSpikeParticles(x, y) {
  for (let i = 0; i < 18; i++) {
    let angle = Math.random() * Math.PI * 2;
    let speed = 2 + Math.random() * 2;
    particles.push({
      x: x,
      y: y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      alpha: 1,
      radius: 2 + Math.random() * 2,
      color: `hsl(${40 + Math.random()*40}, 100%, 60%)`,
      life: 18 + Math.random()*8
    });
  }
}
function updateParticles() {
  for (let p of particles) {
    p.x += p.vx;
    p.y += p.vy;
    p.vx *= 0.92;
    p.vy *= 0.92;
    p.life--;
    p.alpha = Math.max(0, p.life / 24);
  }
  particles = particles.filter(p => p.life > 0 && p.alpha > 0.01);
}
function drawParticles() {
  const offsetX = (canvas.width / 2 - (COURT_WIDTH * ZOOM) / 2);
  const offsetY = (canvas.height / 2 - (COURT_HEIGHT * ZOOM) / 2);
  ctx.save();
  ctx.translate(offsetX, offsetY);
  ctx.scale(ZOOM, ZOOM);
  for (let p of particles) {
    ctx.globalAlpha = p.alpha;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.radius, 0, Math.PI*2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

function gameLoop() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawScoreboard();
  drawCourt();
  drawParticles();
  drawBall();
  drawTeammateBat();
  drawBat();
  drawPlayerArrow();
  drawAIBat();
  drawAI2Bat();
  if (debugMode) drawDebug();
  if (gameState === 'serve') drawServeOverlay();
  if (gameState === 'start') drawStartScreen();
  if (gameState === 'play') {
    updateBat();
    updateTeammateAI();
    updateAIBat();
    updateAI2Bat();
    updateBall();
    updateParticles();
  } else if (gameState === 'serve') {
    updateAIServe();
  }
  requestAnimationFrame(gameLoop);
}

// At the end of the file, just call drawStartScreen() once to show the start screen
drawStartScreen(); 