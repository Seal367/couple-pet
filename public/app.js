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
  updateDisplayName: '/api/me/display-name',
  updatePassword: '/api/me/password',
  updatePetName: '/api/pet/name',
};

let petState = null;
let myName = '';
let isSleeping = false;
let actionCooldown = false;
let lastInteractionTimestamp = null;
let iJustInteracted = false;

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
  savedCoupleCode = code || savedCoupleCode || '';
  document.getElementById('coupleCodeDisplay').textContent = savedCoupleCode || '------';
  if (savedCoupleCode) {
    document.getElementById('linkCode').placeholder = '输入 TA 的 6 位伴侣码';
  }
}

async function apiPut(url, data) {
  const res = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
    credentials: 'same-origin',
  });
  return res.json();
}

// ========== 设置页 ==========
function showSettings() {
  stopDashboardLoop();
  if (petAnimFrame) { cancelAnimationFrame(petAnimFrame); petAnimFrame = null; }
  showPage('settingsPage');

  // 预填当前值
  apiGet(API.me).then(result => {
    if (result.user) {
      document.getElementById('settingsDisplayName').value = result.user.name || '';
    }
  });
  apiGet(API.pet).then(result => {
    if (result.name) {
      document.getElementById('settingsPetName').value = result.name;
    }
  }).catch(() => {});
}

function goToDashboard() {
  showPage('dashboardPage');
  initPetCanvas();
  startDashboardLoop();
}

async function handleSaveDisplayName() {
  const name = document.getElementById('settingsDisplayName').value.trim();
  if (!name) { showMessage('显示名称不能为空', 'error'); return; }

  const result = await apiPut(API.updateDisplayName, { displayName: name });
  if (result.success) {
    myName = name;
    showMessage('名称已更新 ✨', 'success');
  } else {
    showMessage(result.error || '保存失败', 'error');
  }
}

async function handleSavePassword() {
  const currentPw = document.getElementById('settingsCurrentPw').value;
  const newPw = document.getElementById('settingsNewPw').value;
  const confirmPw = document.getElementById('settingsConfirmPw').value;

  if (!currentPw || !newPw || !confirmPw) {
    showMessage('请填写所有密码字段', 'error'); return;
  }
  if (newPw.length < 4) {
    showMessage('新密码至少 4 位', 'error'); return;
  }
  if (newPw !== confirmPw) {
    showMessage('两次新密码不一致', 'error'); return;
  }

  const result = await apiPut(API.updatePassword, { currentPassword: currentPw, newPassword: newPw });
  if (result.success) {
    showMessage('密码已修改 🔒', 'success');
    document.getElementById('settingsCurrentPw').value = '';
    document.getElementById('settingsNewPw').value = '';
    document.getElementById('settingsConfirmPw').value = '';
  } else {
    showMessage(result.error || '修改失败', 'error');
  }
}

async function handleSavePetName() {
  const name = document.getElementById('settingsPetName').value.trim();
  if (!name) { showMessage('宠物名字不能为空', 'error'); return; }

  const result = await apiPut(API.updatePetName, { name });
  if (result.success) {
    petState.name = name;
    showMessage('宠物名字已更新 🐾', 'success');
  } else {
    showMessage(result.error || '保存失败', 'error');
  }
}

async function enterDashboard() {
  showPage('dashboardPage');
  // 检查是否需要显示连接按钮
  updateLinkButton();
}

async function updateLinkButton() {
  try {
    const result = await apiGet(API.me);
    const linkBtn = document.getElementById('linkBtn');
    if (result.user && result.user.member_count < 2) {
      if (linkBtn) linkBtn.style.display = 'flex';
    } else {
      if (linkBtn) linkBtn.style.display = 'none';
    }
    return result.user;
  } catch (e) {
    return null;
  }
}

// 从面板跳转到伴侣连接页
let savedCoupleCode = '';
async function goToLinkPage() {
  // 获取最新的伴侣码
  try {
    const result = await apiGet(API.me);
    savedCoupleCode = result.user?.couple_code || savedCoupleCode;
  } catch (e) { /* ignore */ }
  showLink(savedCoupleCode);
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
    if (result.memberCount < 2) {
      // 还没连接伴侣，显示连接页面
      showLink(result.coupleCode || '');
    } else {
      await loadDashboard();
    }
  } else {
    showMessage(result.error || '登录失败', 'error');
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
    showMessage(result.error || '注册失败', 'error');
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
    showMessage('💕 连接成功！', 'success');
    await loadDashboard();
  } else {
    showMessage(result.error || '连接失败', 'error');
  }
}

async function handleLogout() {
  await apiPost(API.logout, {});
  petState = null;
  if (petAnimFrame) { cancelAnimationFrame(petAnimFrame); petAnimFrame = null; }
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
  // 刷新连接按钮状态
  await updateLinkButton();
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

  // 启动动画循环
  if (petAnimFrame) cancelAnimationFrame(petAnimFrame);
  animatePet();
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

    drawPetBody(ctx, w / 2, h / 2 + floatY, 55, time, 'normal', 0);
    requestAnimationFrame(drawLoginPet);
  }
  drawLoginPet();
}

function drawPetBody(ctx, cx, cy, size, time, expression, healthLevel) {
  healthLevel = healthLevel || 0;
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

  // 身体 — 根据健康状态调整颜色
  const gradient = ctx.createRadialGradient(-size * 0.25, -size * 0.3, size * 0.1, 0, 0, size);
  if (healthLevel >= 2) {
    // 危险：灰紫色调
    gradient.addColorStop(0, '#F0E6F0');
    gradient.addColorStop(0.4, '#D8C8D8');
    gradient.addColorStop(0.8, '#B8A0B8');
    gradient.addColorStop(1, '#988098');
  } else if (healthLevel >= 1) {
    // 警告：淡黄粉色
    gradient.addColorStop(0, '#FFF8F0');
    gradient.addColorStop(0.4, '#FFE8D0');
    gradient.addColorStop(0.8, '#FFC8A8');
    gradient.addColorStop(1, '#FFA880');
  } else {
    // 正常：粉色
    gradient.addColorStop(0, '#FFF5F7');
    gradient.addColorStop(0.4, '#FFDEE5');
    gradient.addColorStop(0.8, '#FFB8C9');
    gradient.addColorStop(1, '#FF8EAB');
  }

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
  const healthLevel = getPetHealthLevel();

  // 危险状态：画面微微抖动
  let shakeX = 0, shakeY = 0;
  if (healthLevel >= 2) {
    shakeX = Math.sin(time * 15) * 3;
    shakeY = Math.cos(time * 13) * 2;
  }

  ctx.save();
  ctx.translate(shakeX, shakeY);
  drawPetBody(ctx, w / 2, h * 0.52, size, time, expr, healthLevel);
  ctx.restore();

  // 危险警告图标
  if (healthLevel >= 2) {
    ctx.save();
    ctx.font = '22px sans-serif';
    ctx.textAlign = 'center';
    const warnY = h * 0.1 + Math.sin(time * 3) * 3;
    ctx.fillText('⚠️ 泡泡生病了', w / 2, warnY);
    ctx.restore();
  } else if (healthLevel >= 1) {
    ctx.save();
    ctx.font = '15px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(245, 158, 11, 0.7)';
    ctx.fillText('🩹 泡泡不太舒服', w / 2, h * 0.12);
    ctx.restore();
  }

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
  // 每 5 秒检查伴侣在线状态
  partnerCheckInterval = setInterval(checkPartnerStatus, 5000);
  // 每 5 秒刷新互动记录
  setInterval(refreshInteractions, 5000);
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
    updateStatBarColor('hungerFill', result.hunger);
    document.getElementById('happyFill').style.width = result.happiness + '%';
    document.getElementById('happinessValue').textContent = result.happiness;
    updateStatBarColor('happyFill', result.happiness);
    document.getElementById('energyFill').style.width = result.energy + '%';
    document.getElementById('energyValue').textContent = result.energy;
    updateStatBarColor('energyFill', result.energy);

    // 睡觉按钮状态
    const sleepBtn = document.getElementById('sleepBtn');
    if (result.is_sleeping) {
      sleepBtn.querySelector('.action-icon').textContent = '🌞';
      sleepBtn.querySelector('.action-label').textContent = '叫醒';
    } else {
      sleepBtn.querySelector('.action-icon').textContent = '😴';
      sleepBtn.querySelector('.action-label').textContent = '睡觉';
    }

    // 检测伴侣互动（lastInteractionAt 变化且不是自己操作的）
    if (result.lastInteractionAt && lastInteractionTimestamp &&
        result.lastInteractionAt !== lastInteractionTimestamp && !iJustInteracted) {
      // 伴侣刚刚互动了！
      setExpression('happy', 120);
      // 获取最新的互动来显示谁做了什么
      try {
        const interactions = await apiGet(API.interactions);
        if (Array.isArray(interactions) && interactions.length > 0) {
          const latest = interactions[0];
          if (latest.user_name !== myName) {
            const actionLabels = { feed: '喂了', pet: '摸了摸', play: '和', sleep: '让', wake: '叫醒了' };
            const actionEmoji = { feed: '🍼', pet: '🤚💕', play: '🎾', sleep: '😴', wake: '🌞' };
            showMessage(`${actionEmoji[latest.action] || '💕'} ${latest.user_name} ${actionLabels[latest.action] || ''}泡泡`, 'success');
            spawnParticles(canvasW / 2, canvasH * 0.35, 6, ['💕', '✨', '💖']);
          }
        }
      } catch (e) { /* ignore */ }
    }
    lastInteractionTimestamp = result.lastInteractionAt || lastInteractionTimestamp;
    iJustInteracted = false;

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

let partnerWasOnline = null;

async function checkPartnerStatus() {
  try {
    const result = await apiGet(API.partner);
    const dot = document.querySelector('.status-dot');
    const nameEl = document.getElementById('partnerNameText');

    if (result.name) {
      if (result.online) {
        dot.className = 'status-dot online';
        nameEl.textContent = `${result.name} 在线 💕`;
        if (partnerWasOnline === false) {
          showMessage(`${result.name} 上线了 💕`, 'success');
          spawnParticles(canvasW / 2, canvasH * 0.3, 5, ['💕', '✨']);
        }
      } else {
        dot.className = 'status-dot offline';
        nameEl.textContent = result.name;
      }
      partnerWasOnline = result.online;
    } else {
      dot.className = 'status-dot offline';
      nameEl.textContent = '等待连接';
      partnerWasOnline = null;
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
      // 标记自己刚才互动了，避免误判为伴侣互动
      iJustInteracted = true;
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
function showMessage(text, type) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = text;
  el.className = 'toast ' + (type || '');
  // 强制回流后添加 show
  void el.offsetWidth;
  el.classList.add('show');
  clearTimeout(el._hideTimer);
  el._hideTimer = setTimeout(() => el.classList.remove('show'), 2500);
}

function updateStatBarColor(fillId, value) {
  const el = document.getElementById(fillId);
  if (!el) return;
  el.classList.remove('stat-critical', 'stat-warning');
  if (value < 25) {
    el.classList.add('stat-critical');
  } else if (value < 50) {
    el.classList.add('stat-warning');
  }
}

// 获取宠物健康状态等级：0=正常, 1=警告, 2=危险
function getPetHealthLevel() {
  if (!petState) return 0;
  const min = Math.min(petState.hunger, petState.happiness, petState.energy);
  if (min < 15) return 2;
  if (min < 30) return 1;
  return 0;
}

// 面板内的浮动消息（宠物互动等）
function showActionMessage(text) {
  const el = document.getElementById('actionMessage');
  if (!el) return;
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(el._hideTimer);
  el._hideTimer = setTimeout(() => el.classList.remove('show'), 2000);
}

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
        // 未连接伴侣，显示连接页面（带伴侣码）
        showPage('loginPage');
        showLink(result.user.couple_code || '');
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
