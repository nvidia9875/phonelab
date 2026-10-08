#!/usr/bin/env bash
# Cloud Run の実行用 ID を最小権限にする（10/9 セキュリティの見直し）。何度流しても同じ結果になる。
#
#   既定の compute SA（roles/editor）をやめ、専用の SA に要る役割だけを付ける:
#     - roles/aiplatform.user         Gemini（Vertex AI）を呼ぶ
#     - roles/datastore.user          Firestore の学級・記録・回数・監査を読み書きする
#     - roles/modelarmor.user         生徒の文を Model Armor で検査する
#     - roles/telemetry.tracesWriter  Cloud Trace にスパンを送る（OTLP、Telemetry API）
#     - 秘密（デモの PIN）は、その秘密 1 つだけに secretAccessor
#
#   使い方: PROJECT=phonelab-2026 DEMO_PIN=xxxx ./infra/runtime-identity.sh（DEMO_PIN は秘密を作る初回だけ）
set -euo pipefail

PROJECT="${PROJECT:-phonelab-2026}"
REGION="${REGION:-asia-northeast1}"
SERVICE="${SERVICE:-phonelab}"
SA_NAME="phonelab-runtime"
SA="${SA_NAME}@${PROJECT}.iam.gserviceaccount.com"
SECRET="phonelab-demo-pin"
ROLES=(roles/aiplatform.user roles/datastore.user roles/modelarmor.user roles/telemetry.tracesWriter)

if ! gcloud iam service-accounts describe "$SA" --project "$PROJECT" >/dev/null 2>&1; then
  gcloud iam service-accounts create "$SA_NAME" --project "$PROJECT" \
    --display-name "PhoneLab runtime (least privilege)"
fi

for role in "${ROLES[@]}"; do
  gcloud projects add-iam-policy-binding "$PROJECT" --member "serviceAccount:$SA" \
    --role "$role" --condition None --quiet >/dev/null
done

# デモの PIN を環境変数の平文から Secret Manager へ（値は標準入力から渡し、引数やログに残さない）
gcloud services enable secretmanager.googleapis.com --project "$PROJECT" >/dev/null
if ! gcloud secrets describe "$SECRET" --project "$PROJECT" >/dev/null 2>&1; then
  if [ -z "${DEMO_PIN:-}" ]; then
    echo "DEMO_PIN を環境変数で渡してください（初回だけ）" >&2
    exit 1
  fi
  printf '%s' "$DEMO_PIN" | gcloud secrets create "$SECRET" --project "$PROJECT" \
    --replication-policy automatic --data-file=-
fi
gcloud secrets add-iam-policy-binding "$SECRET" --project "$PROJECT" \
  --member "serviceAccount:$SA" --role roles/secretmanager.secretAccessor --quiet >/dev/null

gcloud run services update "$SERVICE" --project "$PROJECT" --region "$REGION" \
  --service-account "$SA" \
  --remove-env-vars PHONELAB_DEMO_PIN \
  --set-secrets "PHONELAB_DEMO_PIN=${SECRET}:latest" --quiet

echo "実行用 ID: $SA"
gcloud projects get-iam-policy "$PROJECT" --flatten "bindings[].members" \
  --filter "bindings.members:serviceAccount:$SA" --format "value(bindings.role)"
