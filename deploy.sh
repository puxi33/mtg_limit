#!/bin/bash
set -e

# ========== 配置 ==========
REGISTRY="crpi-ssduymero5xcldyl.cn-hangzhou.personal.cr.aliyuncs.com"
NAMESPACE="mtg_123"
REPO="mtg"
SAE_APP_ID="a9f586c3-f4b9-4438-b335-eaf934bb5582"
SAE_ENDPOINT="sae.cn-hangzhou.aliyuncs.com"
FALLBACK_VERSION="v27.31"
DEPLOY_TIMEOUT=600

# ========== 前置检查 ==========
for cmd in docker aliyun; do
  if ! command -v "$cmd" &>/dev/null; then
    echo "错误: 未找到 $cmd，请先安装"
    exit 1
  fi
done

# ========== 获取当前最新版本号并递增 ==========
echo ">>> 查询镜像仓库当前最新版本..."

LATEST_TAG=""

# 方式1: 从 SAE 当前部署镜像中提取版本
if APP_JSON=$(aliyun sae DescribeApplicationConfig \
  --endpoint "$SAE_ENDPOINT" \
  --AppId "$SAE_APP_ID" 2>/dev/null); then
  LATEST_TAG=$(echo "$APP_JSON" \
    | grep -oE '"ImageUrl"\s*:\s*"[^"]*"' \
    | head -1 \
    | sed 's/.*"ImageUrl"[[:space:]]*:[[:space:]]*"//;s/"//' \
    | grep -oE 'v[0-9]+\.[0-9]+$' || true)
fi

# 方式2: 回退 - 从容器镜像服务查询已有 tag
if [ -z "$LATEST_TAG" ]; then
  echo "    SAE 查询失败，尝试从 ACR 获取..."
  if TAGS_JSON=$(aliyun cr GetRepoTagList \
    --endpoint "cr.cn-hangzhou.aliyuncs.com" \
    --RepoNamespace "$NAMESPACE" \
    --RepoName "$REPO" \
    --PageSize 50 2>/dev/null); then
    LATEST_TAG=$(echo "$TAGS_JSON" \
      | grep -oE '"tag"\s*:\s*"v[0-9]+\.[0-9]+"' \
      | sed 's/.*"v\([0-9]*\)\.\([0-9]*\)".*/\1 \2/' \
      | sort -k1,1n -k2,2n \
      | tail -1 \
      | awk '{print "v" $1 "." $2}' || true)
  fi
fi

# 方式3: 回退 - 使用本地缓存文件
if [ -z "$LATEST_TAG" ] && [ -f ".deploy-version" ]; then
  echo "    使用本地版本缓存..."
  LATEST_TAG=$(cat .deploy-version)
fi

# 最终回退
if [ -z "$LATEST_TAG" ]; then
  echo "    未找到现有版本，从 ${FALLBACK_VERSION} 开始递增"
  LATEST_TAG="$FALLBACK_VERSION"
fi

echo "    当前版本: $LATEST_TAG"

# 解析并递增版本号 v27.31 -> v27.32
MAJOR=$(echo "$LATEST_TAG" | sed 's/v\([0-9]*\)\.\([0-9]*\)/\1/')
MINOR=$(echo "$LATEST_TAG" | sed 's/v\([0-9]*\)\.\([0-9]*\)/\2/')
NEW_TAG="v${MAJOR}.$((MINOR + 1))"

echo "    新版本: $NEW_TAG"

IMAGE_URL="${REGISTRY}/${NAMESPACE}/${REPO}:${NEW_TAG}"

# ========== 构建镜像 ==========
echo ""
echo ">>> 构建镜像 ${IMAGE_URL} (linux/amd64)..."
docker buildx build --platform linux/amd64 -t "${IMAGE_URL}" --load .

# ========== 推送镜像 ==========
echo ""
echo ">>> 推送镜像到阿里云..."
docker push "${IMAGE_URL}"

# ========== 触发 SAE 部署 ==========
echo ""
echo ">>> 触发 SAE 部署..."
DEPLOY_RESULT=$(aliyun sae DeployApplication \
  --endpoint "$SAE_ENDPOINT" \
  --AppId "$SAE_APP_ID" \
  --ImageUrl "$IMAGE_URL" \
  --MinReadyInstances 1 \
  --BatchWaitTime 0 2>&1)

echo "    $DEPLOY_RESULT"

CHANGE_ORDER_ID=$(echo "$DEPLOY_RESULT" \
  | grep -oE '"ChangeOrderId"\s*:\s*"[^"]*"' \
  | head -1 \
  | sed 's/.*"ChangeOrderId"[[:space:]]*:[[:space:]]*"//;s/"//')

if [ -z "$CHANGE_ORDER_ID" ]; then
  echo ""
  echo "部署触发失败，请检查上方输出"
  exit 1
fi

echo "    变更单: $CHANGE_ORDER_ID"

# ========== 等待部署完成 ==========
echo ""
echo ">>> 等待部署完成 (每 10 秒检查，超时 ${DEPLOY_TIMEOUT}s)..."
ELAPSED=0

# 获取 PipelineId
PIPELINE_ID=$(echo "$DEPLOY_RESULT" \
  | grep -oE '"CurrentPipelineId"\s*:\s*"[^"]*"' \
  | head -1 \
  | sed 's/.*"CurrentPipelineId"[[:space:]]*:[[:space:]]*"//;s/"//')

# 如果 DeployApplication 没返回 PipelineId，从 ChangeOrder 获取
if [ -z "$PIPELINE_ID" ]; then
  sleep 3
  CO_JSON=$(aliyun sae DescribeChangeOrder \
    --endpoint "$SAE_ENDPOINT" \
    --ChangeOrderId "$CHANGE_ORDER_ID" 2>/dev/null || echo '{}')
  PIPELINE_ID=$(echo "$CO_JSON" \
    | grep -oE '"CurrentPipelineId"\s*:\s*"[^"]*"' \
    | head -1 \
    | sed 's/.*"CurrentPipelineId"[[:space:]]*:[[:space:]]*"//;s/"//')
fi

while [ $ELAPSED -lt $DEPLOY_TIMEOUT ]; do
  sleep 10
  ELAPSED=$((ELAPSED + 10))

  # 优先通过 DescribePipeline 的 CoStatus 判断
  if [ -n "$PIPELINE_ID" ]; then
    PIPELINE_JSON=$(aliyun sae DescribePipeline \
      --endpoint "$SAE_ENDPOINT" \
      --PipelineId "$PIPELINE_ID" 2>/dev/null || echo '{}')

    CO_STATUS=$(echo "$PIPELINE_JSON" \
      | grep -oE '"CoStatus"\s*:\s*"[^"]*"' \
      | head -1 \
      | sed 's/.*"CoStatus"[[:space:]]*:[[:space:]]*"//;s/"//')

    if [ "$CO_STATUS" = "Success" ]; then
      echo ""
      echo "========== 部署成功 =========="
      echo "应用: mtg-limited"
      echo "镜像: $IMAGE_URL"
      echo "变更单: $CHANGE_ORDER_ID"
      echo "耗时: ${ELAPSED}s"
      echo "$NEW_TAG" > .deploy-version
      exit 0
    fi

    # 检查是否有任务失败
    HAS_FAIL=$(echo "$PIPELINE_JSON" \
      | grep -oE '"Status"\s*:\s*3' | head -1)
    if [ -n "$HAS_FAIL" ]; then
      echo ""
      echo "========== 部署失败 =========="
      echo "变更单: $CHANGE_ORDER_ID"
      echo "请到 SAE 控制台查看详细日志"
      exit 1
    fi
  fi

  # 回退: 通过 DescribeChangeOrder 的 Status 判断
  STATUS_JSON=$(aliyun sae DescribeChangeOrder \
    --endpoint "$SAE_ENDPOINT" \
    --ChangeOrderId "$CHANGE_ORDER_ID" 2>/dev/null || echo '{}')

  STATUS=$(echo "$STATUS_JSON" \
    | grep -oE '"Status"\s*:\s*[0-9]+' \
    | head -1 \
    | grep -oE '[0-9]+')

  case "$STATUS" in
    0)
      echo ""
      echo "========== 部署成功 =========="
      echo "应用: mtg-limited"
      echo "镜像: $IMAGE_URL"
      echo "变更单: $CHANGE_ORDER_ID"
      echo "耗时: ${ELAPSED}s"
      echo "$NEW_TAG" > .deploy-version
      exit 0
      ;;
    1)
      echo ""
      echo "========== 部署失败 =========="
      echo "变更单: $CHANGE_ORDER_ID"
      echo "请到 SAE 控制台查看详细日志"
      exit 1
      ;;
    10)
      echo ""
      echo "========== 部署已终止 =========="
      echo "变更单: $CHANGE_ORDER_ID"
      exit 1
      ;;
    *)
      printf "\r    部署中... (%ds, status=%s, co=%s)   " "$ELAPSED" "${STATUS:-?}" "${CO_STATUS:-?}"
      ;;
  esac
done

echo ""
echo "部署超时 (${DEPLOY_TIMEOUT}s)，请到 SAE 控制台检查状态"
echo "变更单: $CHANGE_ORDER_ID"
exit 1
