---
title: "Couple Pet Mechanics / 宠物机制"
type: concept
language: bilingual
created: 2026-07-25
modified: 2026-07-25
tags: [game-mechanics, stats, decay, interaction]
aliases: [pet-mechanics, 泡泡机制, stat-decay]
summary: "Pet stat system: 3 attributes (happiness, hunger, energy) with time-based decay, 4 interaction types with stat changes, and sleep recovery mechanics."
confidence: high
related_concepts: [couple-pet-overview, couple-pet-database, couple-pet-api, couple-pet-frontend]
---

# Couple Pet Mechanics / 宠物机制

## Definition / 定义

泡泡的属性系统由三个 0–100 的数值组成，随时间自然衰减。伴侣双方通过互动操作提升属性值。睡眠状态改变属性的衰减/恢复方向。系统旨在创造"两个人需要持续共同照顾"的轻量责任感。

## Stat System / 属性系统

### Three Core Attributes

| Attribute | Initial | Range | Meaning |
|-----------|---------|-------|---------|
| `hunger` (饱食度) | 70 | 0–100 | Pet's satiety. Low = hungry, needs feeding. |
| `happiness` (心情) | 70 | 0–100 | Pet's mood. Low = sad, needs petting/playing. |
| `energy` (精力) | 70 | 0–100 | Pet's stamina. Low = tired, needs rest. Playing costs energy. |

### Stat Decay Formula / 衰减公式

Decay is calculated in `updatePetStats()` and applied **per elapsed minute**:

```
hunger_decay    = minutes_passed × 0.25   (per minute)
happiness_decay = minutes_passed × 0.18   (per minute)
energy_change   = if sleeping: -minutes_passed × 0.4  (RECOVERY — negative = gain)
                  if awake:    minutes_passed × 0.22   (DECAY)
```

**Decay rate table**:

| Attribute | Decay per minute | Time to drain 100→0 |
|-----------|-----------------|---------------------|
| Hunger | 0.25 | ~6.7 hours |
| Happiness | 0.18 | ~9.3 hours |
| Energy (awake) | 0.22 | ~7.6 hours |
| Energy (sleeping) | +0.40/min (recovery) | ~4.2 hours to full |

**Decay is applied**:
- On every `GET /api/pet` call
- Only if ≥ 1 minute has passed since `last_stats_update`
- Caps: `GREATEST(0, ...)` for hunger/happiness/energy, `LEAST(100, ...)` for energy recovery

### Offline Decay / 离线衰减

When both users are offline, decay accumulates. On the next API call, `updatePetStats()` calculates decay for the entire elapsed period. This means:
- The pet may be at 0 stats when a user returns after several hours
- Both users see the same decayed state (calculated once, stored in DB)

## Interaction Effects / 互动效果

### Action Stat Changes

| Action | Endpoint | hunger | happiness | energy | Wakes pet? |
|--------|----------|--------|-----------|--------|-------------|
| 🍼 Feed (喂食) | `/api/pet/feed` | **+18** | +3 | — | ✅ Yes |
| 🤚 Pet (摸摸) | `/api/pet/pet` | — | **+12** | — | ✅ Yes |
| 🎾 Play (玩耍) | `/api/pet/play` | — | +10 | **-12** | ✅ Yes |
| 😴 Sleep (睡觉) | `/api/pet/sleep` | — | — | toggle | Toggle |

All positive changes are capped at 100 (`LEAST(100, ...)`). Energy cost from playing is floored at 0 (`GREATEST(0, ...)`).

### Interaction Efficiency / 效率对比

| Goal | Best Action | Efficiency |
|------|------------|------------|
| Restore hunger | Feed | +18 per action |
| Restore happiness | Pet | +12 per action |
| Restore energy | Sleep | +0.40/min recovery |
| Overall maintenance | Feed + Pet rotation | Covers hunger + happiness |

### Cooldown / 冷却

Frontend enforces an **800ms cooldown** between actions (`actionCooldown` flag). There is no server-side rate limiting — cooldown is purely a UX measure to prevent accidental double-taps.

## Sleep Mechanics / 睡眠机制

### Toggle Behavior

`POST /api/pet/sleep` is a toggle:
- If awake → goes to sleep (`is_sleeping = true`)
- If sleeping → wakes up (`is_sleeping = false`)

**Energy dynamics while sleeping**:
- Energy **recovers** at 0.40 per minute (faster than awake decay at 0.22)
- Hunger and happiness still decay (pet can get hungry while sleeping)
- All other actions (feed, pet, play) wake the pet

### Visual Indicators

- Sleeping: 😴 button becomes 🌞 "叫醒" (wake up)
- Canvas: `sleepy` expression with open mouth, Zzz floating text
- Frontend: `setExpression('sleepy', 180)` when state changes

## Frontend Stat Warnings / 前端状态警告

When `hunger < 20` or `happiness < 20` and the pet is awake:
- Expression forced to `hungry` for 60 frames (~1 second)
- Visual cue to the user that action is needed

## Design Rationale / 设计理念

| Decision | Reasoning |
|----------|-----------|
| Stats start at 70, not 100 | Creates immediate incentive to interact |
| Decay in hours, not minutes | Appropriate for couples checking in a few times a day |
| Energy recovers while sleeping | Encourages sleep pattern; prevents permanent drain |
| All actions wake the pet | Simplifies state machine; prevents "stuck sleeping" |
| No pet can "die" | Stats cap at 0, no negative consequences — keeps it lighthearted |
| No single-player advantage | Both partners see the same pet state; no "my stats" vs "their stats" |

## Related Concepts / 相关概念

- [[couple-pet-overview]] — 项目概览
- [[couple-pet-database]] — pets 表结构
- [[couple-pet-api]] — 宠物相关 API 端点
- [[couple-pet-frontend]] — 前端如何展示状态变化

## References / 参考资料

- `server.js:127-153` — `updatePetStats()` decay function
- `server.js:155-166` — `recordInteraction()` logging function
- `server.js:378-458` — `/api/pet/feed`, `/pet`, `/play`, `/sleep` handlers
- `public/app.js:497-543` — Frontend `refreshPetState()` and warnings
- `public/app.js:608-658` — `doAction()` with particle effects
