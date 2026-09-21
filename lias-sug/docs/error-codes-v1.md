# LIAS-SUG Error Codes v1.0

Version: `v1.0`  
Status: `Draft`  
Last Updated: `2026-09-21`

---

## 1. Purpose

本文件定義 LIAS-SUG API 在 MVP 階段統一錯誤碼（Error Code）格式、語意與對應 HTTP 狀態碼，確保：

- 前後端對錯誤行為有一致理解
- 易於監控、告警與追蹤
- 後續版本可向後相容地擴展

---

## 2. Standard Error Response Schema

所有非 2xx 回應應盡量遵循以下格式：

```json
{
  "ok": false,
  "error": {
    "code": "RISK_LIMIT_EXCEEDED",
    "message": "Risk limit exceeded for account ACC-001",
    "details": {
      "limitType": "max_notional",
      "limit": 1000000,
      "actual": 1250000
    }
  },
  "traceId": "0d9a0f6d-2f5a-4d4a-83d5-9dbf9f6f58f4",
  "timestamp": "2026-09-21T15:08:00Z"
}
```

### Field Definitions

- `ok`：固定為 `false`
- `error.code`：穩定機器可讀錯誤碼（本文件定義）
- `error.message`：可讀訊息（可給使用者或記錄）
- `error.details`：選填，提供除錯上下文
- `traceId`：選填，請求追蹤 ID（建議必填）
- `timestamp`：選填，ISO-8601 UTC 時間

---

## 3. Error Code Naming Rules

- 格式：`UPPER_SNAKE_CASE`
- 結構建議：`<DOMAIN>_<REASON>`
- 示例：
  - `VALIDATION_FAILED`
  - `AUTH_UNAUTHORIZED`
  - `RISK_LIMIT_EXCEEDED`
  - `EXECUTION_REJECTED`

---

## 4. HTTP Status Mapping (Guideline)

- `400 Bad Request`：參數格式錯誤、欄位缺失、業務驗證不通過
- `401 Unauthorized`：未授權 / token 無效
- `403 Forbidden`：有身份但無權限
- `404 Not Found`：資源不存在
- `409 Conflict`：狀態衝突（如冪等鍵重複且內容衝突）
- `422 Unprocessable Entity`：語意有效但業務規則拒絕
- `429 Too Many Requests`：流量限制
- `500 Internal Server Error`：未知伺服器錯誤
- `503 Service Unavailable`：依賴服務不可用

---

## 5. Error Code Catalog (MVP)

## 5.1 Common / Platform

| Code | HTTP | Description |
|---|---:|---|
| `INTERNAL_ERROR` | 500 | 未預期例外 |
| `SERVICE_UNAVAILABLE` | 503 | 下游服務不可用 |
| `RATE_LIMITED` | 429 | 超過速率限制 |
| `RESOURCE_NOT_FOUND` | 404 | 資源不存在 |
| `CONFLICT` | 409 | 請求與現況衝突 |

## 5.2 Request / Validation

| Code | HTTP | Description |
|---|---:|---|
| `VALIDATION_FAILED` | 400 | 欄位驗證失敗 |
| `INVALID_REQUEST` | 400 | 請求格式不正確 |
| `MISSING_REQUIRED_FIELD` | 400 | 缺少必要欄位 |
| `INVALID_ENUM_VALUE` | 400 | 列舉值不合法 |
| `INVALID_TIMESTAMP` | 400 | 時間格式不合法 |

## 5.3 Auth / Access

| Code | HTTP | Description |
|---|---:|---|
| `AUTH_UNAUTHORIZED` | 401 | 尚未登入或 token 失效 |
| `AUTH_FORBIDDEN` | 403 | 無操作權限 |
| `API_KEY_INVALID` | 401 | API Key 無效 |

## 5.4 Decision Gates (`/decision-gates/evaluate`)

| Code | HTTP | Description |
|---|---:|---|
| `DECISION_INPUT_INVALID` | 400 | decision gate 輸入非法 |
| `DECISION_RULE_NOT_FOUND` | 404 | 找不到指定規則版本 |
| `DECISION_DENIED` | 422 | 規則評估不通過 |

## 5.5 Risk (`/risk/pretrade-check`)

| Code | HTTP | Description |
|---|---:|---|
| `RISK_INPUT_INVALID` | 400 | 風控檢查輸入非法 |
| `RISK_LIMIT_EXCEEDED` | 422 | 超出風險限額 |
| `RISK_PRODUCT_BLOCKED` | 422 | 標的被限制交易 |
| `RISK_ACCOUNT_BLOCKED` | 403 | 帳戶被停用或限制 |

## 5.6 Triggers (`/triggers/simulate`)

| Code | HTTP | Description |
|---|---:|---|
| `TRIGGER_INPUT_INVALID` | 400 | 模擬參數非法 |
| `TRIGGER_RULE_NOT_FOUND` | 404 | 觸發規則不存在 |
| `TRIGGER_SIMULATION_FAILED` | 422 | 模擬無法完成 |

## 5.7 Execution (`/execution/orders`)

| Code | HTTP | Description |
|---|---:|---|
| `ORDER_INPUT_INVALID` | 400 | 下單參數非法 |
| `ORDER_DUPLICATE_CLIENT_ID` | 409 | 重複 `clientOrderId` |
| `ORDER_REJECTED` | 422 | 訂單被交易規則拒絕 |
| `ORDER_ALREADY_FINAL` | 409 | 訂單已終態，不可修改 |
| `EXECUTION_REJECTED` | 422 | 執行層拒絕 |

---

## 6. Idempotency & Conflict Rule

對 `POST /execution/orders` 建議支援 `Idempotency-Key`：

- 同 key + 同 payload：回傳同結果（200/201）
- 同 key + 不同 payload：回 `409 CONFLICT` + `CONFLICT`

---

## 7. Logging & Observability Recommendation

- 每次錯誤記錄 `traceId`、`error.code`、HTTP status、latency
- 不要在 `error.message/details` 泄露敏感資訊（token、密碼、PII）
- 監控面板以 `error.code` 聚合，避免純文字訊息造成噪音

---

## 8. Backward Compatibility Policy

- 已發布 `error.code` 不應任意移除或改名
- 可新增新 code，但需更新本文件並註明版本
- Deprecated code 應保留至少 1 個次版本週期

---

## 9. Changelog

- `v1.0` (2026-09-21): 初版，覆蓋 MVP 四大模組（decision/risk/triggers/execution）
