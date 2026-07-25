# Wiki Index
<!-- AUTO-GENERATED — DO NOT EDIT BY HAND -->
**Generated:** 2026-07-25T15:00:00Z
**Total pages:** 7

## All Pages

| Slug | Title | Type | Lang | Tags | Summary | Modified |
|------|-------|------|------|------|---------|----------|
| couple-pet-overview | 泡泡 (Couple Pet) — 异地恋电子宠物 | concept | bilingual | nodejs, express, postgresql, canvas, virtual-pet, couple-app | A virtual pet web app for long-distance couples — two people co-raise a pet named 泡泡 with real-time interaction syncing. | 2026-07-25 |
| couple-pet-architecture | Couple Pet Architecture / 架构设计 | concept | bilingual | architecture, nodejs, express, serverless | Client-server architecture with polling sync: vanilla JS frontend ↔ Express REST API ↔ PostgreSQL, deployable as both long-running server and serverless function. | 2026-07-25 |
| couple-pet-database | Couple Pet Database / 数据库设计 | concept | bilingual | database, postgresql, schema, supabase | PostgreSQL schema: 5 tables (couples, users, pets, interactions, user_sessions) with cascade relationships and time-based stat decay. | 2026-07-25 |
| couple-pet-api | Couple Pet API / 接口设计 | concept | bilingual | api, rest, express, endpoints | RESTful JSON API with 10 endpoints: 4 auth routes + 6 pet/interaction routes. Session-based auth via express-session with PostgreSQL store. | 2026-07-25 |
| couple-pet-frontend | Couple Pet Frontend / 前端设计 | concept | bilingual | frontend, canvas, animation, ui, vanilla-js | Single-page vanilla JS frontend with Canvas 2D pet animation, polling-based state sync, particle effects, and a pink-themed responsive UI. | 2026-07-25 |
| couple-pet-pet-mechanics | Couple Pet Mechanics / 宠物机制 | concept | bilingual | game-mechanics, stats, decay, interaction | Pet stat system: 3 attributes (happiness, hunger, energy) with time-based decay, 4 interaction types with stat changes, and sleep recovery mechanics. | 2026-07-25 |
| couple-pet-deployment | Couple Pet Deployment / 部署配置 | concept | bilingual | deployment, render, vercel, serverless, hosting | Dual-platform deployment: Render (primary, long-running Express server) and Vercel (alternative, serverless function). PostgreSQL via Supabase with IPv4 DNS workaround. | 2026-07-25 |

## By Tag

### api (1 page)
- [[couple-pet-api]] — RESTful JSON API with 10 endpoints

### architecture (1 page)
- [[couple-pet-architecture]] — Client-server architecture with polling sync

### animation (1 page)
- [[couple-pet-frontend]] — Single-page vanilla JS frontend with Canvas 2D

### canvas (2 pages)
- [[couple-pet-overview]] — Project overview
- [[couple-pet-frontend]] — Frontend Canvas animation details

### couple-app (1 page)
- [[couple-pet-overview]] — Project overview

### database (1 page)
- [[couple-pet-database]] — PostgreSQL schema with 5 tables

### decay (1 page)
- [[couple-pet-pet-mechanics]] — Stat decay formulas and mechanics

### deployment (1 page)
- [[couple-pet-deployment]] — Render + Vercel dual-platform deployment

### endpoints (1 page)
- [[couple-pet-api]] — 10 API endpoints documentation

### express (3 pages)
- [[couple-pet-overview]] — Project overview
- [[couple-pet-architecture]] — Architecture with Express middleware pipeline
- [[couple-pet-api]] — Express route handlers

### frontend (2 pages)
- [[couple-pet-frontend]] — Frontend design details
- [[couple-pet-overview]] — Project overview (includes frontend stack)

### game-mechanics (1 page)
- [[couple-pet-pet-mechanics]] — Pet attribute system and interaction effects

### hosting (1 page)
- [[couple-pet-deployment]] — Deployment platforms and configuration

### interaction (1 page)
- [[couple-pet-pet-mechanics]] — Interaction types and stat changes

### nodejs (2 pages)
- [[couple-pet-overview]] — Project overview
- [[couple-pet-architecture]] — Node.js + Express architecture

### postgresql (2 pages)
- [[couple-pet-overview]] — Project overview
- [[couple-pet-database]] — PostgreSQL schema details

### render (1 page)
- [[couple-pet-deployment]] — Render Web Service deployment

### rest (1 page)
- [[couple-pet-api]] — REST API endpoints

### schema (1 page)
- [[couple-pet-database]] — Database table definitions

### serverless (2 pages)
- [[couple-pet-architecture]] — Dual-mode architecture (server + serverless)
- [[couple-pet-deployment]] — Vercel serverless deployment

### stats (1 page)
- [[couple-pet-pet-mechanics]] — Stat system design

### supabase (1 page)
- [[couple-pet-database]] — Supabase-hosted PostgreSQL

### ui (1 page)
- [[couple-pet-frontend]] — UI design and responsive layout

### vanilla-js (1 page)
- [[couple-pet-frontend]] — Vanilla JavaScript frontend implementation

### vercel (1 page)
- [[couple-pet-deployment]] — Vercel serverless function deployment

### virtual-pet (1 page)
- [[couple-pet-overview]] — Virtual pet concept and overview

## Orphan Pages / 孤立页面
*No orphan pages — all pages have incoming links from at least 2 other pages.*

## Review Queue / 审核队列
*No pending reviews.*
