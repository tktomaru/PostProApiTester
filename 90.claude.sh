#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="/mnt/d/github/github_tktomaru/PostProApiTester"
TASKS_FILE="$REPO_DIR/tasks.json"
LOG_DIR="$REPO_DIR/logs"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/run-tasks-$(date '+%Y%m%d-%H%M%S').log"

# ログをファイルと標準出力に同時出力
exec > >(tee -a "$LOG_FILE") 2>&1

echo "=== タスク実行開始: $(date) ==="
echo "ログファイル: $LOG_FILE"
echo

cd "$REPO_DIR"

# JSON 配列を1件ずつ読み込む
jq -c '.[]' "$TASKS_FILE" | while read -r task; do
  id=$(echo "$task" | jq -r '.id')
  prompt=$(echo "$task" | jq -r '.prompt')
  timestamp=$(date +%Y%m%d%H%M%S)
  branch="task/${id}-${timestamp}"

  echo "▶ 処理中: $id ($(date))"

  # ブランチ作成
#   git checkout -b "$branch"

  # Claude 実行（レート制限対応）
  while true; do
    output=$(claude -p "$prompt" \
      --allowedTools "Write" "Bash(git diff:*)" \
      --dangerously-skip-permissions 2>&1) || exit_code=$?

    if [ "${exit_code:-0}" -eq 0 ]; then
      echo "$output"
      break
    fi

    if echo "$output" | grep -iq "rate limit"; then
      wait_sec=$(echo "$output" \
        | grep -oiP 'in \K[0-9]+(?= seconds)' || echo "60")
      echo "⚠️ レート制限: ${wait_sec}s 待機します… ($(date))"
      sleep "$wait_sec"
      echo "⏱ 待機完了。再試行します。 ($(date))"
    else
      echo "❌ Claude 実行エラー ($(date)):"
      echo "$output"
      exit 1
    fi

    # 変更をコミット＆プッシュ
    git add .
    git commit -m "[${id}] ${prompt}"
    # git push -u origin "$branch"

    # プルリクエスト作成
    # gh pr create \
    #     --title "[${id}] ${prompt}" \
    #     --body "自動生成された PR です。\n\n**タスク**: $prompt" \
    #     --base main \
    #     --head "$branch" \
    #     --label "autogen"

    # main ブランチに戻る
    # git checkout main
  done

  echo "✔ 完了: $id ($(date))"
  echo
done

echo "=== 全タスク完了: $(date) ==="
echo "ログは $LOG_FILE を参照してください。"