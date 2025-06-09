#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="/mnt/d/github/github_tktomaru/PostProApiTester"
TASKS_FILE="$REPO_DIR/tasks.yml"       # ← YAML ファイルに変更
LOG_DIR="$REPO_DIR/logs"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/run-tasks-$(date '+%Y%m%d-%H%M%S').log"

# ログを画面表示＆ファイル出力
exec > >(tee -a "$LOG_FILE") 2>&1

echo "=== タスク実行開始: $(date) ==="
echo "ログファイル: $LOG_FILE"
echo

cd "$REPO_DIR"
git checkout main

# ── YAML を1件ずつ読み込む（Python版 yq 向け） ──
# tasks.yml の tasks 配列を compact JSON で展開
yq -c '.tasks[]' "$TASKS_FILE" | while read -r task; do
  id=$(echo "$task" | yq -r '.id' -)
  prompt=$(echo "$task" | yq -r '.prompt' -)

  echo "▶ [$id] 実行開始: $(date)"

  # Claude 実行（リアルタイムログ＆レート制限対応）
  while true; do
    start_line=$(wc -l < "$LOG_FILE")

    claude -p "$prompt" \
      --allowedTools "Write" "Bash(git diff:*)" \
      --dangerously-skip-permissions \
      2>&1 | tee -a "$LOG_FILE"
    exit_code=${PIPESTATUS[0]}

    # 新規ログ出力部分を抽出
    new_output=$(tail -n +$((start_line+1)) "$LOG_FILE")

    if [ "$exit_code" -eq 0 ]; then
      echo "✔ Claude 実行成功: $(date)"
      break
    fi

    if echo "$new_output" | grep -iq "rate limit"; then
      wait_sec=$(echo "$new_output" \
        | grep -oiP 'in \K[0-9]+(?= seconds)' || echo "60")
      echo "⚠️ レート制限検出 (${wait_sec}s)… ($(date))"
      sleep "$wait_sec"
      echo "⏱ 再試行: $(date)"
    else
      echo "❌ Claude 実行エラー。ログ参照: $LOG_FILE"
      exit 1
    fi
  done

  # コミット＆プッシュ（main 上で 1コミットずつ）
  git add .
  # prompt の最初の行だけを取り出してコミットメッセージに
  first_line=$(echo "$prompt" | head -n1)
  git commit -m "[${id}] ${first_line}"
  git push origin main

  echo "✔ [$id] コミット完了 & プッシュ: $(date)"
  echo
done

echo "=== 全タスク完了: $(date) ==="
echo "ログファイル: $LOG_FILE を参照してください。"