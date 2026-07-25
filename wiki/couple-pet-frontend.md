---
title: "Couple Pet Frontend / 前端设计"
type: concept
language: bilingual
created: 2026-07-25
modified: 2026-07-25
tags: [frontend, canvas, animation, ui, vanilla-js]
aliases: [pet-frontend, 泡泡前端, pet-canvas]
summary: "Single-page vanilla JS frontend with Canvas 2D pet animation, polling-based state sync, particle effects, and a pink-themed responsive UI."
confidence: high
related_concepts: [couple-pet-overview, couple-pet-architecture, couple-pet-api, couple-pet-pet-mechanics]
---

# Couple Pet Frontend / 前端设计

## Definition / 定义

前端是一个零构建步骤的原生 JavaScript 单页应用。两个页面（登录页、主面板）通过 CSS `display` 切换。宠物角色完全由 Canvas 2D API 绘制，包含表情系统、粒子特效和眨眼动画。UI 主题为粉色调，支持移动端响应式布局。

## Page Structure / 页面结构

```
index.html
├── #loginPage (.page)
│   └── .login-container
│       ├── #loginCanvas — 登录页宠物动画 (200×200)
│       ├── #loginForm — 登录表单
│       ├── #registerForm — 注册表单 (display:none)
│       └── #linkForm — 伴侣码连接界面 (display:none)
│
└── #dashboardPage (.page)
    ├── .top-bar — 宠物名 + 伴侣在线状态 + 退出按钮
    ├── .pet-stage — 宠物 Canvas + 消息浮层
    ├── .stats-bar — 三个状态条 (饱食度/心情/精力)
    ├── .action-buttons — 四个操作按钮
    └── .activity-feed — 互动记录时间线
```

**Page switching**: `showPage(id)` toggles `.active` class. When switching to dashboard, `initPetCanvas()` + `startDashboardLoop()` are called. When logging out, `stopDashboardLoop()` cleans up intervals.

## Canvas Pet Drawing / 宠物绘制

### Rendering Pipeline

```
animatePet() [requestAnimationFrame loop]
  → petTime++
  → drawPet(ctx, petTime)
    → determine expression (sleepy/hungry/happy/normal)
    → blink timer check
    → draw ground shadow
    → drawPetBody(ctx, cx, cy, size, time, expr)
      → ctx.translate + ctx.scale (squish animation)
      → radial gradient body fill
      → drawEye() × 2 (with pupil tracking + blink)
      → blush ellipses (alpha varies by expression)
      → mouth (5 variants: smile/frown/wide/open/dot)
      → Zzz text (when sleeping)
    → drawParticles(ctx, time)
      → update particle positions (x, y, vy, life)
      → render with globalAlpha fade
```

### Expression System / 表情系统

| Expression | Trigger | Visual Changes |
|-----------|---------|----------------|
| `normal` | Default state | Gentle smile, soft blush (α=0.3) |
| `happy` | After feed/play, expressionTimer > 0 | Wide smile, bounce animation, squish effect |
| `loved` | After pet action | Deep blush (α=0.6), big smile |
| `hungry` | hunger < 25 or happiness < 25 | Frown (arc upside-down), worried eyes |
| `sleepy` | `is_sleeping = true` | Open mouth (ellipse), Zzz floating text, slow animation |

Expression override priority: `expressionTimer > 0` takes precedence over stat-based expressions. Timer decrements each frame.

### Particle System / 粒子特效

```js
// Structure
particle = {
  x, y,                          // Position
  vx, vy,                        // Velocity
  life: 0.8-1.2,                 // Fade duration (decrements 0.02/frame)
  scale: 0.6-1.2,                // Emoji scale
  char: '💕' | '❤️' | '✨' | ... // Emoji character
}
```

| Action | Particle Characters | Count |
|--------|-------------------|-------|
| Pet | 💕, ❤️, ✨ | 8 |
| Feed | 🍰, ✨, 😋 | 6 |
| Play | 🎉, ✨, ⭐, 💫 | 10 |

### Blink Animation / 眨眼

- Periodic: every 180-300 frames (3-5 seconds at 60fps)
- Duration: 5 frames (~83ms) — eyes scale Y from 1.0 to 0.1 and back
- Implementation: `isBlinking` boolean toggled by `blinkTimer`

### High-DPI Support / 高清屏适配

```js
function resizePetCanvas() {
  const dpr = window.devicePixelRatio || 1;
  petCanvas.width = canvasW * dpr;   // Physical pixels
  petCanvas.height = canvasH * dpr;
  petCanvas.style.width = canvasW;    // CSS pixels
  ctx.scale(dpr, dpr);                // Scale drawing
}
```

## Polling System / 轮询系统

```
startDashboardLoop()
  ├── refreshPetState()     — immediate + every 3s
  ├── checkPartnerStatus()  — immediate + every 10s
  └── refreshInteractions() — immediate + every 15s
```

**Why polling instead of WebSocket**: Simpler architecture, no additional server dependencies. 3-second pet state delay is acceptable for this use case. Partner status check at 10s interval balances freshness with network load.

### State Refresh Logic

`refreshPetState()` updates:
- Three stat bars (width + text value)
- Sleep button icon/label (😴↔🌞, "睡觉"↔"叫醒")
- Triggers expression changes on state transitions (sleep↔wake)
- Shows low-stat warnings (hunger/happiness < 20)

## UI Design / 界面设计

### Color Palette / 色彩系统

```
--pink-50:  #FFF0F3   Background tint
--pink-100: #FFDEE5   Light pink
--pink-200: #FFB8C9   Mid pink
--pink-300: #FF8EAB   —
--pink-400: #FF6B8A   Primary action
--pink-500: #FF4777   Strong accent
--purple-100:#F0E6FF  Light purple (energy bar)
--purple-300:#C9B1FF  Mid purple
--bg:       #FFF5F7   Page background
--bg-card:  #FFFFFF   Card background
--text:     #2D1B2E   Main text
--text-secondary: #8A7580  Secondary text
```

### Responsive Breakpoints

- Default: mobile-first layout
- `@media (max-width: 400px)`: Smaller padding, tighter action button spacing, reduced stat bar gaps

### Interaction Feedback / 交互反馈

- All buttons: `transform: scale(0.97)` on `:active`
- Action buttons: `transform: scale(0.92)` on `:active` (stronger feedback)
- Action message: fades in/out (opacity transition 0.3s, auto-hide after 2s)
- Disabled states: reduced opacity (0.5-0.6), no cursor events
- Cooldown: 800ms between actions (`actionCooldown` flag)

## Keyboard Support / 键盘支持

Enter key on login/register forms triggers the respective action:
- Register form visible → calls `handleRegister()`
- Login form visible → calls `handleLogin()`

## Initialization Flow / 启动流程

```
DOMContentLoaded → init()
  → initLoginCanvas()  — Start login page pet animation
  → GET /api/me
    → Logged in: enterDashboard()
    → Not logged in: showLogin()
```

## Related Concepts / 相关概念

- [[couple-pet-overview]] — 项目概览
- [[couple-pet-architecture]] — 数据如何从前端流向 API
- [[couple-pet-api]] — 调用的 API 端点
- [[couple-pet-pet-mechanics]] — 状态条背后的数值计算

## References / 参考资料

- `public/index.html:1-137` — HTML structure
- `public/app.js:1-723` — All frontend logic
- `public/style.css:1-452` — Complete stylesheet
