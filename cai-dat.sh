#!/bin/bash
# ============================================================
#  Cài BotForge bằng MỘT lệnh:   bash cai-dat.sh
#  Script tự kiểm tra máy, tải thư viện rồi mở trình hướng dẫn.
# ============================================================
set -e
cd "$(dirname "$0")"

say()  { printf "\033[1m%s\033[0m\n" "$1"; }
ok()   { printf "\033[32m✓ %s\033[0m\n" "$1"; }
warn() { printf "\033[33m! %s\033[0m\n" "$1"; }
die()  { printf "\033[31m✗ %s\033[0m\n" "$1"; exit 1; }

say "🤖 Cài BotForge"
echo

# 1. Node.js
if ! command -v node >/dev/null 2>&1; then
  warn "Máy bạn chưa có Node.js — đây là thứ để chạy dự án này."
  echo
  echo "  Cách cài:"
  if [ "$(uname)" = "Darwin" ]; then
    echo "    • Dễ nhất: mở https://nodejs.org rồi tải bản LTS về cài như một app bình thường."
    echo "    • Hoặc nếu bạn có Homebrew:  brew install node"
  else
    echo "    • Mở https://nodejs.org rồi tải bản LTS, hoặc dùng trình quản lý gói của máy."
  fi
  echo
  die "Cài Node.js xong thì chạy lại: bash cai-dat.sh"
fi

NODE_MAJOR=$(node -p "process.versions.node.split('.')[0]")
if [ "$NODE_MAJOR" -lt 20 ]; then
  die "Node.js của bạn là phiên bản $NODE_MAJOR, dự án cần từ 20 trở lên. Tải bản mới ở https://nodejs.org"
fi
ok "Node.js $(node -v)"

# 2. Thư viện
say "📦 Đang tải thư viện cần thiết (một lần duy nhất, hơi lâu một chút)..."
if [ -f package-lock.json ]; then
  npm ci --no-audit --no-fund >/dev/null 2>&1 || npm install --no-audit --no-fund >/dev/null
else
  npm install --no-audit --no-fund >/dev/null
fi
ok "Đã cài xong thư viện"

# 3. Tự kiểm tra
if npm run check >/dev/null 2>&1; then
  ok "Dự án nguyên vẹn"
else
  warn "Có cảnh báo khi tự kiểm tra — vẫn chạy tiếp được, xem chi tiết bằng: npm run check"
fi

echo
say "🚀 Giờ mình hỏi bạn vài câu để dựng bot nhé."
echo
exec npm run setup
