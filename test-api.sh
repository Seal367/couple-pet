#!/usr/bin/env bash
# ============================================================================
# 电子宠物 API 测试脚本
# 测试 couple-pet Express API 的所有端点
# 用法: ./test-api.sh [服务器地址]
#       默认服务器地址为 http://localhost:3000
# ============================================================================

set -euo pipefail

# ---------- 颜色 & 计数器 ----------
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

PASS=0
FAIL=0

BASE_URL="${1:-http://localhost:3000}"
COOKIE_FILE=$(mktemp /tmp/pet-test-cookies.XXXXXX)
trap 'rm -f "$COOKIE_FILE"' EXIT

# ---------- 辅助函数 ----------

pass() {
  local msg="$1"
  PASS=$((PASS + 1))
  echo -e "  ${GREEN}[PASS]${NC} $msg"
}

fail() {
  local msg="$1"
  local detail="${2:-}"
  FAIL=$((FAIL + 1))
  echo -e "  ${RED}[FAIL]${NC} $msg"
  if [ -n "$detail" ]; then
    echo -e "        $detail"
  fi
}

check() {
  local label="$1"
  local expected="$2"
  local actual="$3"
  # 尝试用 jq 做语义化 JSON 比较; 如果 jq 不可用就 fallback 到字符串
  if command -v jq &>/dev/null && echo "$actual" | jq -e . &>/dev/null 2>&1; then
    if echo "$actual" | jq -e "$expected" &>/dev/null 2>&1; then
      pass "$label"
    else
      fail "$label" "(jq filter: $expected) -> $(echo "$actual" | head -c 300)"
    fi
  else
    # 无 jq 或响应不是 JSON: 用 grep 简单匹配
    if echo "$actual" | grep -q "$expected"; then
      pass "$label"
    else
      fail "$label" "expected pattern: $expected, got: $(echo "$actual" | head -c 300)"
    fi
  fi
}

api_get() {
  local path="$1"
  curl -s -b "$COOKIE_FILE" -c "$COOKIE_FILE" "${BASE_URL}${path}"
}

api_post() {
  local path="$1"
  local data="$2"
  curl -s -b "$COOKIE_FILE" -c "$COOKIE_FILE" \
    -X POST -H "Content-Type: application/json" \
    -d "$data" \
    "${BASE_URL}${path}"
}

echo ""
echo -e "${CYAN}============================================${NC}"
echo -e "${CYAN}  电子宠物 API 测试套件${NC}"
echo -e "${CYAN}  目标: ${BASE_URL}${NC}"
echo -e "${CYAN}============================================${NC}"
echo ""

# ---------- 生成随机用户 ----------
SUFFIX=$(date +%s)$RANDOM
USERNAME="testuser_${SUFFIX}"
PASSWORD="pass_${SUFFIX}"
DISPLAY_NAME="Tester_${SUFFIX}"

echo -e "${YELLOW}[准备]${NC} 用户名: $USERNAME / 显示名: $DISPLAY_NAME"
echo ""

# ============================================================================
# 1. POST /api/register — 注册新用户
# ============================================================================
echo -e "${CYAN}[测试 1] POST /api/register${NC}"
REG_RESP=$(api_post "/api/register" "{\"username\":\"$USERNAME\",\"password\":\"$PASSWORD\",\"displayName\":\"$DISPLAY_NAME\"}")
check "注册返回 success" '.success == true' "$REG_RESP"

COUPLE_CODE=$(echo "$REG_RESP" | grep -o '"coupleCode":"[^"]*"' | cut -d'"' -f4 || true)
if [ -n "$COUPLE_CODE" ]; then
  echo -e "      伴侣码: $COUPLE_CODE"
fi

# 保存用户信息供后续测试
REG_USER_ID=$(echo "$REG_RESP" | grep -o '"id":[0-9]*' | head -1 | cut -d: -f2 || echo "")
echo ""

# ============================================================================
# 2. POST /api/login — 登录
# ============================================================================
echo -e "${CYAN}[测试 2] POST /api/login${NC}"
# 先清 cookie 模拟全新登录
rm -f "$COOKIE_FILE"
LOGIN_RESP=$(api_post "/api/login" "{\"username\":\"$USERNAME\",\"password\":\"$PASSWORD\"}")
check "登录返回 success" '.success == true' "$LOGIN_RESP"
echo ""

# ============================================================================
# 3. GET /api/me — 获取当前用户信息
# ============================================================================
echo -e "${CYAN}[测试 3] GET /api/me${NC}"
ME_RESP=$(api_get "/api/me")
check "me 返回用户对象" '.user != null' "$ME_RESP"
check "用户名正确" '.user.name == "'"$DISPLAY_NAME"'"' "$ME_RESP"
MEMBER_COUNT=$(echo "$ME_RESP" | grep -o '"member_count":[0-9]*' | cut -d: -f2 || echo "0")
echo -e "      成员数: $MEMBER_COUNT"
echo ""

# ============================================================================
# 4. GET /api/pet — 获取宠物状态
# ============================================================================
echo -e "${CYAN}[测试 4] GET /api/pet${NC}"
PET_RESP=$(api_get "/api/pet")
check "pet 返回宠物对象" '.name != null' "$PET_RESP"

# 提取初始属性
PET_HUNGER=$(echo "$PET_RESP" | grep -o '"hunger":[0-9]*' | cut -d: -f2 || echo "0")
PET_HAPPY=$(echo "$PET_RESP" | grep -o '"happiness":[0-9]*' | cut -d: -f2 || echo "0")
PET_ENERGY=$(echo "$PET_RESP" | grep -o '"energy":[0-9]*' | cut -d: -f2 || echo "0")
PET_SLEEPING=$(echo "$PET_RESP" | grep -o '"is_sleeping":false' && echo "false" || echo "true")
echo -e "      饱食度: $PET_HUNGER  心情: $PET_HAPPY  精力: $PET_ENERGY  睡觉: $PET_SLEEPING"
echo ""

# ============================================================================
# 5. POST /api/pet/feed — 喂食
# ============================================================================
echo -e "${CYAN}[测试 5] POST /api/pet/feed${NC}"
FEED_RESP=$(api_post "/api/pet/feed" "{}")
check "喂食返回 success" '.success == true' "$FEED_RESP"
echo ""

# ============================================================================
# 6. POST /api/pet/pet — 摸摸
# ============================================================================
echo -e "${CYAN}[测试 6] POST /api/pet/pet${NC}"
PET_RESP2=$(api_post "/api/pet/pet" "{}")
check "摸摸返回 success" '.success == true' "$PET_RESP2"
echo ""

# ============================================================================
# 7. POST /api/pet/play — 玩耍
# ============================================================================
echo -e "${CYAN}[测试 7] POST /api/pet/play${NC}"
PLAY_RESP=$(api_post "/api/pet/play" "{}")
check "玩耍返回 success" '.success == true' "$PLAY_RESP"
echo ""

# ============================================================================
# 8. POST /api/pet/sleep — 切换睡眠
# ============================================================================
echo -e "${CYAN}[测试 8] POST /api/pet/sleep (哄睡)${NC}"
SLEEP_RESP=$(api_post "/api/pet/sleep" "{}")
check "睡眠返回 is_sleeping=true" '.is_sleeping == true' "$SLEEP_RESP"
check "睡眠返回 success" '.success == true' "$SLEEP_RESP"
echo ""

# 叫醒
echo -e "${CYAN}[测试 8b] POST /api/pet/sleep (叫醒)${NC}"
WAKE_RESP=$(api_post "/api/pet/sleep" "{}")
check "叫醒返回 is_sleeping=false" '.is_sleeping == false' "$WAKE_RESP"
check "叫醒返回 success" '.success == true' "$WAKE_RESP"
echo ""

# ============================================================================
# 9. GET /api/interactions — 获取互动记录
# ============================================================================
echo -e "${CYAN}[测试 9] GET /api/interactions${NC}"
INTER_RESP=$(api_get "/api/interactions")
# 检查返回的是数组（即使是空数组 []）
check "互动记录是数组" 'type == "array"' "$INTER_RESP"

# 验证有互动记录（至少上面执行了几个操作）
INTER_COUNT=$(echo "$INTER_RESP" | grep -o '"user_name"' | wc -l || echo "0")
if [ "$INTER_COUNT" -ge 3 ]; then
  pass "互动记录包含足够条目 (>=3)"
else
  fail "互动记录条目不足 (got $INTER_COUNT, expected >=3)" "$INTER_RESP"
fi
echo ""

# ============================================================================
# 10. GET /api/partner — 检查伴侣状态
# ============================================================================
echo -e "${CYAN}[测试 10] GET /api/partner${NC}"
PARTNER_RESP=$(api_get "/api/partner")
# 无伴侣连接时, api 返回 { online: false, name: null }
check "伴侣接口正常返回" '. != null' "$PARTNER_RESP"
echo ""

# ============================================================================
# 11. POST /api/logout — 退出登录
# ============================================================================
echo -e "${CYAN}[测试 11] POST /api/logout${NC}"
LOGOUT_RESP=$(api_post "/api/logout" "{}")
check "登出返回 success" '.success == true' "$LOGOUT_RESP"
echo ""

# ============================================================================
# 12. 验证登出后 /api/me 返回 null
# ============================================================================
echo -e "${CYAN}[测试 12] GET /api/me (登出后)${NC}"
ME_AFTER_RESP=$(api_get "/api/me")
check "登出后 user 为 null" '.user == null' "$ME_AFTER_RESP"
echo ""

# ============================================================================
# 附加: 注册验证 (空用户名应返回 400)
# ============================================================================
echo -e "${CYAN}[附加] POST /api/register (空用户名应拒绝)${NC}"
BAD_REG_RESP=$(api_post "/api/register" "{\"username\":\"\",\"password\":\"test\"}")
check "空用户名返回错误" '.error != null' "$BAD_REG_RESP"
echo ""

# ============================================================================
# 附加: 登录失败 (错误密码应返回 401)
# ============================================================================
echo -e "${CYAN}[附加] POST /api/login (错误密码)${NC}"
BAD_LOGIN_RESP=$(api_post "/api/login" "{\"username\":\"$USERNAME\",\"password\":\"wrong_password\"}")
check "错误密码返回 error" '.error != null' "$BAD_LOGIN_RESP"
echo ""

# ============================================================================
# 统计
# ============================================================================
echo -e "${CYAN}============================================${NC}"
echo -e "${CYAN}  测试完成${NC}"
echo -e "${CYAN}  总计: $((PASS + FAIL))  通过: ${GREEN}$PASS${NC}  失败: ${RED}$FAIL${NC}"
echo -e "${CYAN}============================================${NC}"

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
exit 0
