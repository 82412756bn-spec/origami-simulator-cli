#!/bin/bash
# origami-simulator-cli v2.47.0 发布前置检查 —— 复现命令
# 用途：Noul（大副）复核时的证据来源；本文件内容的 sha256 记入 inbox 摘录 frontmatter。
# 运行：bash release-check-commands.sh    （工作目录 = ~/文档/origami-simulator-cli）
set -u
cd ~/文档/origami-simulator-cli

echo "### 1. package.json 顶层字段（查 repository/homepage/bugs）"
python3 -c "import json;print(list(json.load(open('package.json')).keys()))"

echo
echo "### 2. 敏感信息扫描（命中文件）"
git ls-files src docs examples README.md LICENSE CHANGELOG.md CONTRIBUTING.md package.json \
  | xargs grep -lEi "api[_-]?key|secret|token|password|BEGIN [A-Z ]*PRIVATE KEY|sk-[A-Za-z0-9]{16}|ghp_[A-Za-z0-9]{20}" 2>/dev/null
echo "--- 命中处逐行 ---"
grep -nEi "api[_-]?key|secret|token|password|private key" src/utils/dieline-parser.js | head -5

echo
echo "### 3. 发布包内几何数据（svg/fold 计数）"
npm pack --dry-run 2>&1 | grep -cE "\.svg$" | xargs echo "svg:"
npm pack --dry-run 2>&1 | grep -E "\.svg$|\.fold$"

echo
echo "### 4. opencli 引用点（全仓库，排除 node_modules/package-lock/.opencli）"
grep -rn "opencli" . --include="*.js" --include="*.json" --include="*.md" --include="*.sh" 2>/dev/null \
  | grep -v node_modules | grep -v "^./package-lock.json" | grep -v "^./.opencli/"
echo "--- src/ 内命中数 ---"
grep -rn "opencli" src/ --include="*.js" | wc -l

echo
echo "### 5. 包名占用"
printf "origami-simulator-cli: "; curl -s -o /dev/null -w "%{http_code}\n" https://registry.npmjs.org/origami-simulator-cli
printf "origami:               "; curl -s -o /dev/null -w "%{http_code}\n" https://registry.npmjs.org/origami

echo
echo "### 6. 发布包最终状态"
npm pack --dry-run 2>&1 | grep -E "total files|package size|unpacked size"
echo "--- src 的 .js 是否全部进包 ---"
echo "包内 .js: $(npm pack --dry-run 2>&1 | grep -cE '\.js$')  仓库 src 的 .js: $(git ls-files src | grep -c '\.js$')"
