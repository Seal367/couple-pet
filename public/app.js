// ========== 配置 ==========
const API = {
  me: '/api/me',
  login: '/api/login',
  register: '/api/register',
  link: '/api/link',
  logout: '/api/logout',
  pet: '/api/pet',
  feed: '/api/pet/feed',
  petAction: '/api/pet/pet',
  play: '/api/pet/play',
  sleep: '/api/pet/sleep',
  interactions: '/api/interactions',
  partner: '/api/partner',
};

let petState = null;
let myName = '';
let isSleeping = false;
let actionCooldown = false;

// ========== 页面切换 ==========
function showPage(id) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById(id).classList.add('active');

  if (id === 'dashboardPage') {
    initPetCanvas();
    startDashboardLoop();
  }
}

function showRegister() {
  document.getElementById('loginForm').style.display = 'none';
  document.getElementById('registerForm').style.display = 'block';
  document.getElementById('linkForm').style.display = 'none';
}

function showLogin() {
  document.getElementById('loginForm').style.display = 'block';
  document.getElementById('registerForm').style.display = 'none';
  document.getElementById('linkForm').style.display = 'none';
}

function showLink(code) {
  document.getElementById('loginForm').style.display = 'none';
  document.getElementById('registerForm').style.display = 'none';
  document.getElementById('linkForm').style.display = 'block';
  document.getElementById('coupleCodeDisplay').textContent = code || '------';
  if (code) {
    document.getElementById('linkCode').placeholder = '输入伴侣码';
  }
}

function enterDashboard() {
  showPage('dashboardPage');
}

// ========== API 请求 ==========
async function apiPost(url, data) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
    credentials: 'same-origin',
  });
  return res.json();
}

async function apiGet(url) {
  const res = await fetch(url, { credentials: 'same-origin' });
  return res.json();
}

// ========== 认证 ==========
async function handleLogin() {
  const username = document.getElementById('loginUsername').value.trim();
  const password = document.getElementById('loginPassword').value;
  if (!username || !password) {
    showMessage('请填写用户名和密码哦');
    return;
  }

  const btn = document.getElementById('loginBtn');
  btn.disabled = true;
  btn.textContent = '登录中...';

  const result = await apiPost(API.login, { username, password });
  btn.disabled = false;
  btn.textContent = '登 录';

  if (result.success) {
    myName = result.user.name;
    await loadDashboard();
  } else {
    showMessage(result.error || '登录失败');
  }
}

async function handleRegister() {
  const username = document.getElementById('regUsername').value.trim();
  const password = document.getElementById('regPassword').value;
  const displayName = document.getElementById('regDisplayName').value.trim() || username;

  if (!username || !password) {
    showMessage('请填写昵称和密码');
    return;
  }
  if (password.length < 4) {
    showMessage('密码至少 4 位哦');
    return;
  }

  const result = await apiPost(API.register, { username, password, displayName });
  if (result.success) {
    myName = result.user.name;
    showLink(result.coupleCode);
  } else {
    showMessage(result.error || '注册失败');
  }
}

async function handleLink() {
  const code = document.getElementById('linkCode').value.trim().toUpperCase();
  if (!code || code.length !== 6) {
    showMessage('请输入 6 位伴侣码');
    return;
  }

  const result = await apiPost(API.link, { code });
  if (result.success) {
    showMessage('💕 连接成功！');
    await loadDashboard();
  } else {
    showMessage(result.error || '连接失败');
  }
}

async function handleLogout() {
  await apiPost(API.logout, {});
  petState = null;
  stopDashboardLoop();

  // 重置表单
  document.getElementById('loginUsername').value = '';
  document.getElementById('loginPassword').value = '';
  showPage('loginPage');
  showLogin();
}

// ========== 加载面板 ==========
async function loadDashboard() {
  showPage('dashboardPage');
}

// ========== 宠物 Canvas 绘制 ==========
let petCanvas, petCtx;
let canvasW, canvasH;
let petAnimFrame;
let petTime = 0;
let particles = [];
let petExpression = 'normal'; // normal, happy, hungry, sleepy, loved
let expressionTimer = 0;
let blinkTimer = 0;
let isBlinking = false;

function initPetCanvas() {
  petCanvas = document.getElementById('petCanvas');
  petCtx = petCanvas.getContext('2d');
  resizePetCanvas();
  window.addEventListener('resize', resizePetCanvas);

  // 点击 canvas 触发摸摸
  petCanvas.addEventListener('click', () => {
    if (!actionCooldown) doAction('pet');
  });
}

function resizePetCanvas() {
  const container = petCanvas.parentElement;
  const rect = container.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;

  canvasW = rect.width;
  canvasH = rect.height;

  petCanvas.width = canvasW * dpr;
  petCanvas.height = canvasH * dpr;
  petCanvas.style.width = canvasW + 'px';
  petCanvas.style.height = canvasH + 'px';

  petCtx.setTransform(1, 0, 0, 1, 0, 0);
  petCtx.scale(dpr, dpr);
}

let loginCanvasCtx = null;

function initLoginCanvas() {
  const canvas = document.getElementById('loginCanvas');
  if (!canvas) return;
  loginCanvasCtx = canvas.getContext('2d');

  function drawLoginPet() {
    const ctx = loginCanvasCtx;
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const time = Date.now() * 0.001;
    const floatY = Math.sin(time * 2) * 3;

    drawPetBody(ctx, w / 2, h / 2 + floatY, 55, time);
    requestAnimationFrame(drawLoginPet);
  }
  drawLoginPet();
}

function drawPetBody(ctx, cx, cy, size, time, expression) {
  const floatY = Math.sin(time * 2) * 4;
  const bounce = expression === 'happy' ? Math.abs(Math.sin(time * 6)) * 8 : 0;
  const squish = expression === 'happy'
    ? 1 + Math.sin(time * 6) * 0.04
    : 1 + Math.sin(time * 1.5) * 0.02;

  const totalCy = cy + floatY - bounce;

  ctx.save();
  ctx.translate(cx, totalCy);
  ctx.scale(1 / squish, squish);

  // 阴影
  ctx.beginPath();
  ctx.ellipse(0, size * 1.05 + 8, size * 0.7, 6, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,0,0,0.06)';
  ctx.fill();

  // 身体
  const gradient = ctx.createRadialGradient(-size * 0.25, -size * 0.3, size * 0.1, 0, 0, size);
  gradient.addColorStop(0, '#FFF5F7');
  gradient.addColorStop(0.4, '#FFDEE5');
  gradient.addColorStop(0.8, '#FFB8C9');
  gradient.addColorStop(1, '#FF8EAB');

  ctx.beginPath();
  ctx.ellipse(0, 0, size, size * 1.08, 0, 0, Math.PI * 2);
  ctx.fillStyle = gradient;
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 107, 138, 0.2)';
  ctx.lineWidth = 2;
  ctx.stroke();

  const eyeY = -size * 0.2;
  const eyeSpacing = size * 0.38;
  const eyeSize = size * 0.22;

  // 眨眼
  const blink = isBlinking ? 0.1 : 1;
  const blinkPhase = isBlinking ? 0 : 1;

  // 左眼
  drawEye(ctx, -eyeSpacing, eyeY, eyeSize, blink, time);
  // 右眼
  drawEye(ctx, eyeSpacing, eyeY, eyeSize, blink, time);

  // 腮红
  const blushAlpha = expression === 'loved' ? 0.6 : expression === 'happy' ? 0.45 : 0.3;
  const blushSize = size * 0.16;
  ctx.beginPath();
  ctx.ellipse(-eyeSpacing - 4, eyeY + size * 0.35, blushSize, blushSize * 0.7, 0, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(255, 150, 150, ${blushAlpha})`;
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(eyeSpacing + 4, eyeY + size * 0.35, blushSize, blushSize * 0.7, 0, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(255, 150, 150, ${blushAlpha})`;
  ctx.fill();

  // 嘴巴
  const mouthY = eyeY + size * 0.5;
  if (expression === 'sleepy') {
    // 睡觉嘴（张开小口）
    ctx.beginPath();
    ctx.ellipse(0, mouthY + 2, 4, 6, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#FF8EAB';
    ctx.fill();
  } else if (expression === 'hungry') {
    // 委屈嘴
    ctx.beginPath();
    ctx.arc(0, mouthY + 6, 5, Math.PI + 0.3, -0.3);
    ctx.strokeStyle = '#FF8EAB';
    ctx.lineWidth = 2;
    ctx.stroke();
  } else if (expression === 'happy') {
    // 大笑
    ctx.beginPath();
    ctx.arc(0, mouthY, 7, 0.1, Math.PI - 0.1);
    ctx.strokeStyle = '#FF8EAB';
    ctx.lineWidth = 2.5;
    ctx.stroke();
  } else {
    // 微笑
    ctx.beginPath();
    ctx.arc(0, mouthY, 5, 0.2, Math.PI - 0.2);
    ctx.strokeStyle = '#FF8EAB';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // 睡觉 Zzz
  if (expression === 'sleepy' && petState?.is_sleeping) {
    ctx.save();
    ctx.font = '20px sans-serif';
    ctx.fillStyle = 'rgba(200, 180, 255, 0.8)';
    const zzzY = Math.sin(time * 3) * 3;
    ctx.fillText('💤', size * 0.5, -size * 0.5 + zzzY);
    ctx.restore();
  }

  ctx.restore();
}

function drawEye(ctx, x, y, size, open, time) {
  // 眼白
  ctx.beginPath();
  ctx.ellipse(x, y, size, size * (open * 1.2), 0, 0, Math.PI * 2);
  ctx.fillStyle = 'white';
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.1)';
  ctx.lineWidth = 1;
  ctx.stroke();

  if (open > 0.5) {
    // 瞳孔（稍微跟随时间左右摆动，可爱）
    const lookX = Math.sin(time * 0.5) * 2;
    const pupilSize = size * 0.45;

    ctx.beginPath();
    ctx.arc(x + lookX, y + 1, pupilSize, 0, Math.PI * 2);
    ctx.fillStyle = '#3D1F2E';
    ctx.fill();

    // 高光
    ctx.beginPath();
    ctx.arc(x + lookX + pupilSize * 0.4, y - pupilSize * 0.3, pupilSize * 0.3, 0, Math.PI * 2);
    ctx.fillStyle = 'white';
    ctx.fill();
  }
}

function drawPet(ctx, time) {
  const w = canvasW, h = canvasH;
  ctx.clearRect(0, 0, w, h);

  if (!petState) {
    // 加载中
    ctx.fillStyle = '#8A7580';
    ctx.font = '16px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('加载中...', w / 2, h / 2);
    return;
  }

  // 确定表情
  let expr = 'normal';
  if (petState.is_sleeping) {
    expr = 'sleepy';
  } else if (petState.hunger < 25) {
    expr = 'hungry';
  } else if (petState.happiness < 25) {
    expr = 'hungry';
  }

  // 如果刚互动过，用 happy/loved
  if (expressionTimer > 0) {
    expr = petExpression;
    expressionTimer--;
  }

  // 眨眼
  blinkTimer++;
  if (blinkTimer > 180 + Math.random() * 120) {
    isBlinking = true;
    if (blinkTimer > 185) {
      isBlinking = false;
      blinkTimer = 0;
    }
  }

  // 地面装饰
  ctx.fillStyle = 'rgba(255, 222, 229, 0.3)';
  ctx.beginPath();
  ctx.ellipse(w / 2, h - 20, 120, 12, 0, 0, Math.PI * 2);
  ctx.fill();

  // 画宠物
  const size = Math.min(w, h) * 0.22;
  drawPetBody(ctx, w / 2, h * 0.52, size, time, expr);

  // 画粒子（心、星星）
  drawParticles(ctx, time);

  // 名字标签
  if (petState.name) {
    ctx.fillStyle = 'rgba(45, 27, 46, 0.4)';
    ctx.font = '13px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`✨ ${petState.name} ✨`, w / 2, h * 0.88);
  }
}

function drawParticles(ctx, time) {
  particles = particles.filter(p => {
    p.x += p.vx;
    p.y += p.vy;
    p.vy -= 0.02;
    p.life -= 0.02;
    p.scale *= 0.99;

    if (p.life <= 0) return false;

    ctx.save();
    ctx.globalAlpha = p.life;
    ctx.translate(p.x, p.y);
    ctx.scale(p.scale, p.scale);
    ctx.font = '18px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(p.char, 0, 0);
    ctx.restore();

    return true;
  });
}

function spawnParticles(x, y, count, chars) {
  for (let i = 0; i < count; i++) {
    particles.push({
      x: x + (Math.random() - 0.5) * 20,
      y: y,
      vx: (Math.random() - 0.5) * 3,
      vy: -Math.random() * 3 - 1,
      life: 0.8 + Math.random() * 0.4,
      scale: 0.6 + Math.random() * 0.6,
      char: chars[Math.floor(Math.random() * chars.length)],
    });
  }
}

function animatePet() {
  petTime += 1;
  const ctx = petCtx;

  // 根据状态自动反应
  if (petState) {
    if (petState.is_sleeping) {
      // 睡觉时轻微呼吸动画
      drawPet(ctx, petTime * 0.8);
    } else {
      drawPet(ctx, petTime);
    }
  } else {
    drawPet(ctx, petTime);
  }

  petAnimFrame = requestAnimationFrame(animatePet);
}

// ========== 主循环 ==========
let dashboardInterval = null;
let partnerCheckInterval = null;

function startDashboardLoop() {
  stopDashboardLoop();

  // 立即拉取一次数据
  refreshPetState();
  refreshInteractions();
  checkPartnerStatus();

  // 每 3 秒刷新宠物状态
  dashboardInterval = setInterval(refreshPetState, 3000);
  // 每 10 秒检查伴侣在线状态
  partnerCheckInterval = setInterval(checkPartnerStatus, 10000);
  // 每 15 秒刷新互动记录
  setInterval(refreshInteractions, 15000);
}

function stopDashboardLoop() {
  if (dashboardInterval) {
    clearInterval(dashboardInterval);
    dashboardInterval = null;
  }
  if (partnerCheckInterval) {
    clearInterval(partnerCheckInterval);
    partnerCheckInterval = null;
  }
}

async function refreshPetState() {
  try {
    const result = await apiGet(API.pet);
    if (result.error) return;

    // 检查状态变化
    const wasSleeping = petState?.is_sleeping;
    petState = result;
    isSleeping = result.is_sleeping;
    myName = result.myName || myName;

    // 更新 UI
    document.getElementById('hungerFill').style.width = result.hunger + '%';
    document.getElementById('hungerValue').textContent = result.hunger;
    document.getElementById('happyFill').style.width = result.happiness + '%';
    document.getElementById('happinessValue').textContent = result.happiness;
    document.getElementById('energyFill').style.width = result.energy + '%';
    document.getElementById('energyValue').textContent = result.energy;

    // 睡觉按钮状态
    const sleepBtn = document.getElementById('sleepBtn');
    if (result.is_sleeping) {
      sleepBtn.querySelector('.action-icon').textContent = '🌞';
      sleepBtn.querySelector('.action-label').textContent = '叫醒';
    } else {
      sleepBtn.querySelector('.action-icon').textContent = '😴';
      sleepBtn.querySelector('.action-label').textContent = '睡觉';
    }

    // 如果睡眠状态变化，触发事件
    if (wasSleeping !== undefined && wasSleeping !== result.is_sleeping) {
      if (result.is_sleeping) {
        setExpression('sleepy', 180);
        showActionMessage('泡泡睡着了 💤');
      } else {
        setExpression('happy', 120);
        showActionMessage('泡泡醒了！🌞');
      }
    }

    // 低状态提醒
    if (result.hunger < 20 && !result.is_sleeping) setExpression('hungry', 60);
    if (result.happiness < 20 && !result.is_sleeping) setExpression('hungry', 60);

  } catch (e) {
    // 静默处理
  }
}

async function refreshInteractions() {
  try {
    const result = await apiGet(API.interactions);
    if (!Array.isArray(result)) return;

    const list = document.getElementById('feedList');
    if (result.length === 0) {
      list.innerHTML = '<div class="feed-empty">还没有互动，去摸摸泡泡吧~</div>';
      return;
    }

    const actionIcons = {
      feed: '🍼',
      pet: '🤚',
      play: '🎾',
      sleep: '😴',
      wake: '🌞',
    };

    const actionLabels = {
      feed: '喂了泡泡',
      pet: '摸了摸泡泡',
      play: '和泡泡玩耍',
      sleep: '哄泡泡睡觉',
      wake: '叫醒了泡泡',
    };

    list.innerHTML = result.map(item =>
      `<div class="feed-item">
        <span class="feed-action-icon">${actionIcons[item.action] || '💕'}</span>
        <span class="feed-text"><strong>${item.user_name}</strong> ${actionLabels[item.action] || '互动了'}</span>
        <span class="feed-time">${item.time}</span>
      </div>`
    ).join('');
  } catch (e) {
    // 静默处理
  }
}

async function checkPartnerStatus() {
  try {
    const result = await apiGet(API.partner);
    const dot = document.querySelector('.status-dot');
    const nameEl = document.getElementById('partnerNameText');

    if (result.name) {
      if (result.online) {
        dot.className = 'status-dot online';
        nameEl.textContent = `${result.name} 在线 💕`;
      } else {
        dot.className = 'status-dot offline';
        nameEl.textContent = result.name;
      }
    } else {
      dot.className = 'status-dot offline';
      nameEl.textContent = '等待连接';
    }
  } catch (e) {
    // 静默处理
  }
}

// ========== 互动操作 ==========
async function doAction(action) {
  if (actionCooldown) return;
  actionCooldown = true;

  const urlMap = {
    feed: API.feed,
    pet: API.petAction,
    play: API.play,
    sleep: API.sleep,
  };

  try {
    const result = await apiPost(urlMap[action], {});
    if (result.success) {
      // 立即刷新状态
      await refreshPetState();

      // 表情反应
      if (action === 'sleep') {
        if (result.is_sleeping !== undefined) {
          setExpression(result.is_sleeping ? 'sleepy' : 'happy', 180);
        }
      } else if (action === 'pet') {
        setExpression('loved', 150);
        // 心形粒子
        const cx = canvasW / 2;
        const cy = canvasH * 0.35;
        spawnParticles(cx, cy, 8, ['💕', '❤️', '✨']);
      } else if (action === 'feed') {
        setExpression('happy', 120);
        spawnParticles(canvasW / 2, canvasH * 0.35, 6, ['🍰', '✨', '😋']);
      } else if (action === 'play') {
        setExpression('happy', 150);
        spawnParticles(canvasW / 2, canvasH * 0.35, 10, ['🎉', '✨', '⭐', '💫']);
      }

      // 显示消息
      if (result.message) showActionMessage(result.message);

      // 刷新互动记录
      await refreshInteractions();
    } else {
      showActionMessage(result.error || '操作失败');
    }
  } catch (e) {
    showActionMessage('哎呀，出错了');
  }

  setTimeout(() => { actionCooldown = false; }, 800);
}

function setExpression(expr, duration) {
  petExpression = expr;
  expressionTimer = duration || 120;
}

// ========== 消息提示 ==========
function showMessage(text) {
  const el = document.getElementById('actionMessage');
  if (!el) return;
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(el._hideTimer);
  el._hideTimer = setTimeout(() => el.classList.remove('show'), 2000);
}
const showActionMessage = showMessage;

// ========== 键盘支持 ==========
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    const loginPage = document.getElementById('loginPage');
    if (loginPage.classList.contains('active')) {
      if (document.getElementById('registerForm').style.display !== 'none') {
        handleRegister();
      } else {
        handleLogin();
      }
    }
  }
});

// ========== 启动 ==========
async function init() {
  // 初始化登录页宠物动画
  initLoginCanvas();

  // 检查是否已登录
  try {
    const result = await apiGet(API.me);
    if (result.user) {
      myName = result.user.name;
      // 检查是否已连接伴侣
      if (result.user.member_count < 2) {
        // 未连接伴侣，显示连接页面
        showPage('loginPage');
        showLink('');
        // 重新获取伴侣码
        // 简单起见：直接进面板
        enterDashboard();
      } else {
        enterDashboard();
      }
    } else {
      showPage('loginPage');
      showLogin();
    }
  } catch (e) {
    showPage('loginPage');
    showLogin();
  }
}

// 页面加载完成后启动
document.addEventListener('DOMContentLoaded', init);
