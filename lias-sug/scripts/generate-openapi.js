#!/usr/bin/env node
// ============================================================
// openapi.yaml 生成器
// 把 index.html 內的 OPENAPI_ENDPOINTS 倒出成可單獨發佈的 OpenAPI 3.1 規格
// 給後端工程師直接接入,前端與後端共用同一份 contract。
// ============================================================

const fs = require('node:fs');
const path = require('node:path');

// 直接從 index.html 抽出 OPENAPI_ENDPOINTS 內容(避免維護兩份)
// 技巧:用 Function() 把那段 array literal 取出來執行,得到 JS array
function extractEndpointsFromHtml(htmlPath) {
    const html = fs.readFileSync(htmlPath, 'utf-8');
    // 抓 const OPENAPI_ENDPOINTS = [ ... ];
    const match = html.match(/const\s+OPENAPI_ENDPOINTS\s*=\s*(\[[\s\S]*?\n\];)/);
    if (!match) throw new Error('OPENAPI_ENDPOINTS not found in ' + htmlPath);
    // 將 array literal 取出,用 Function 包成 array
    // 注意:這段含 template literal,需在 Node 環境執行(沒有 DOM)
    const code = match[1].replace(/;$/, '');
    const factory = new Function('return (' + code + ');');
    return factory();
}

// 把 HTML 內的彩色 span 標籤剝掉(純文字版)
function stripHtml(html) {
    return html
        .replace(/<span class="c">/g, '')
        .replace(/<\/span>/g, '')
        .replace(/<span class="k">/g, '')
        .replace(/<span class="s">/g, '')
        .replace(/<span class="n">/g, '');
}

// 把 inline JSON 範例轉成多行 YAML block scalar
function jsonBlock(s) {
    return '|\n      ' + stripHtml(s).split('\n').join('\n      ');
}

const endpoints = extractEndpointsFromHtml(path.join(__dirname, '..', 'index.html'));

// ===== 構造 OpenAPI 3.1 YAML =====
const out = [];
const push = (line) => out.push(line);

push('# ============================================================');
push('# TAA Institutional API v2 - OpenAPI 3.1.0 Specification');
push('# Generated: ' + new Date().toISOString());
push('# Source: OPENAPI_ENDPOINTS in index.html');
push('# Maintainers: 把 OPENAPI_ENDPOINTS 改動後,執行 npm run gen:openapi 同步本檔');
push('# ============================================================');
push('');
push('openapi: 3.1.0');
push('');
push('info:');
push('  title: TAA Institutional API');
push('  version: 2.0.0');
push('  summary: 機構級戰術資產配置 (TAA) 決策 API');
push('  description: |');
push('    機構級 TAA API v2 規格,涵蓋 8 大 domain:market-data / fund-registry /');
push('    portfolio / risk / policy / decision-gate / execution / audit。');
push('    ');
push('    **核心原則**');
push('    - 統一 URI 版本 (`/api/v2/`)');
push('    - 結構化錯誤碼(見 `ErrorResponse` schema 與 `x-error-codes`)');
push('    - 全 API 強制 `traceId` + `Idempotency-Key` (mutation 路徑)');
push('    - Webhook 強制 HMAC-SHA256 簽章 + nonce 重放保護');
push('    - Audit records 採 WORM (append-only),保留 3 年');
push('');
push('  contact:');
push('    name: TAA Platform Team');
push('    email: taa-platform@your-institution.com');
push('  license:');
push('    name: Proprietary');
push('    identifier: LicenseRef-internal-use-only');
push('');
push('servers:');
push('  - url: https://api.your-institution.com/api/v2');
push('    description: Production');
push('  - url: https://api-staging.your-institution.com/api/v2');
push('    description: Staging');
push('');
push('tags:');
push('  - name: decision-gate');
push('    description: 決策閘門(模型一致性 / 風險 / 合規 / 交易可行性)');
push('  - name: risk');
push('    description: 風控(pre-trade / post-trade)');
push('  - name: policy');
push('    description: Policy-as-Code(YAML 規則驗證與發佈)');
push('  - name: execution');
push('    description: 交易執行(Playbook / 下單)');
push('  - name: audit');
push('    description: 審計紀錄(WORM)');
push('  - name: market-data');
push('    description: 行情與宏觀數據');
push('  - name: webhooks');
push('    description: Webhook 訂閱管理');
push('  - name: error-codes');
push('    description: 統一錯誤碼字典(展示用,見 components.x-error-codes)');
push('');

// ===== Paths =====
push('paths:');
endpoints.forEach((ep, idx) => {
    const method = ep.tag.toLowerCase();
    // OpenAPI path 不能含 {traceId} 等 placeholder 直接寫成 path param;本來就對
    push('  ' + ep.path + ':');
    push('    ' + method + ':');
    push('      operationId: ' + (ep.operationId || ('op_' + idx)));
    push('      summary: ' + ep.summary);
    push('      description: |');
    push('        ' + ep.desc.split('\n').join('\n        '));
    if (ep.idempotent) {
        push('      parameters:');
        push('        - $ref: "#/components/parameters/IdempotencyKey"');
    }
    push('      tags:');
    push('        - ' + (ep.tag || 'default').toLowerCase());
    push('      security:');
    push('        - OAuth2: [' + (ep.scopes || ['taa.read']).join(', ') + ']');
    // requestBody
    if (ep.req && !ep.req.startsWith('// 僅路徑') && !ep.req.includes('GET /api/v2/')) {
        push('      requestBody:');
        push('        required: true');
        push('        content:');
        push('          application/json:');
        push('            schema:');
        push('              $ref: "#/components/schemas/' + (ep.requestSchema || 'GenericRequest') + '"');
        push('            example:');
        // 將 inline JSON 樣例轉成 YAML
        const exampleJson = stripHtml(ep.req).trim();
        try {
            // 把 JSON 字串轉成 JS object,再讓 JSON.stringify 重新格式化(給 YAML 區塊用)
            // 但這裡我們直接保留多行 JSON 作為 example
            const obj = JSON.parse(exampleJson);
            push('              ' + JSON.stringify(obj).replace(/\n/g, '\n              '));
        } catch {
            push('              # raw:' + JSON.stringify(exampleJson.slice(0, 200)));
        }
    }
    // responses
    push('      responses:');
    const declaredCodes = new Set();
    (ep.responses || [{ code: 200, desc: 'OK' }]).forEach(r => {
        declaredCodes.add(String(r.code));
        push('        "' + r.code + '":');
        push('          description: "' + r.desc + '"');
        push('          content:');
        push('            application/json:');
        push('              schema:');
        push('                $ref: "#/components/schemas/' + (r.schema || 'GenericResponse') + '"');
    });
    // 通用 error responses(若 endpoint 未自訂才加入,避免 duplicate key)
    [
        { code: '401', ref: 'Unauthorized' },
        { code: '403', ref: 'Forbidden' },
        { code: '429', ref: 'RateLimited' },
        { code: '500', ref: 'InternalError' }
    ].forEach(({ code, ref }) => {
        if (declaredCodes.has(code)) return;
        push('        "' + code + '":');
        push('          $ref: "#/components/responses/' + ref + '"');
    });
    push('');
});

// ===== Components =====
push('components:');
push('  securitySchemes:');
push('    OAuth2:');
push('      type: oauth2');
push('      description: |');
push('        OAuth2 Client Credentials flow。所有 mutation 路徑需 scope `taa.execute`;');
push('        審計查詢需 `taa.audit`;其餘唯讀路徑只需 `taa.read`。');
push('      flows:');
push('        clientCredentials:');
push('          tokenUrl: /oauth/token');
push('          refreshUrl: /oauth/refresh');
push('          scopes:');
push('            taa.read: 讀取 TAA 狀態/報表');
push('            taa.execute: 觸發決策閘門 / 執行 Playbook');
push('            taa.audit: 讀取審計紀錄(合規與稽核)');
push('            taa.admin: Policy 註冊 / 模型上線');
push('    HmacWebhook:');
push('      type: apiKey');
push('      in: header');
push('      name: X-Webhook-Signature');
push('      description: Webhook 接收端驗證用 HMAC-SHA256 簽章(值為 `sha256=<hex>`)');
push('');

push('  parameters:');
push('    IdempotencyKey:');
push('      name: Idempotency-Key');
push('      in: header');
push('      required: true');
push('      description: |');
push('        防止重送攻擊 / 網路重試導致重複執行。');
push('        格式:`idem_<trace-or-uuid>`,系統快取 24h。');
push('        重送同 key 在快取有效期內會返回原始結果(`X-Idempotent-Replay: true`)。');
push('      schema:');
push('        type: string');
push('        pattern: "^idem_[a-zA-Z0-9_-]{6,64}$"');
push('        example: "idem_trc_20260921_0001"');
push('    TraceId:');
push('      name: X-Trace-Id');
push('      in: header');
push('      required: false');
push('      description: 用戶端提供的 trace ID(若無則由系統產生)');
push('      schema:');
push('        type: string');
push('        pattern: "^trc_[0-9]{8}_[0-9]{4,}$"');
push('');

push('  responses:');
push('    Unauthorized:');
push('      description: AUTH_UNAUTHORIZED · JWT 過期 / 缺失 / 簽章錯誤');
push('      content:');
push('        application/json:');
push('          schema:');
push('            $ref: "#/components/schemas/ErrorResponse"');
push('          example:');
push('            traceId: "trc_20260921_0001"');
push('            code: "AUTH_UNAUTHORIZED"');
push('            message: "JWT expired"');
push('            retryable: false');
push('    Forbidden:');
push('      description: AUTH_FORBIDDEN_ROLE · RBAC 拒絕');
push('      content:');
push('        application/json:');
push('          schema:');
push('            $ref: "#/components/schemas/ErrorResponse"');
push('    RateLimited:');
push('      description: 速率限制(429);遵守 Retry-After header');
push('      headers:');
push('        Retry-After:');
push('          schema: { type: integer }');
push('      content:');
push('        application/json:');
push('          schema:');
push('            $ref: "#/components/schemas/ErrorResponse"');
push('    InternalError:');
push('      description: 500 內部錯誤;所有 5xx 都帶 traceId,可由 `GET /api/v2/audit/records/{traceId}` 復盤');
push('      content:');
push('        application/json:');
push('          schema:');
push('            $ref: "#/components/schemas/ErrorResponse"');
push('');

push('  schemas:');
push('    ErrorResponse:');
push('      type: object');
push('      required: [traceId, code, message, retryable]');
push('      description: |');
push('        統一錯誤回應格式(RFC 7807 inspired)。');
push('        `code` 前綴分類見 `x-error-codes`。');
push('      properties:');
push('        traceId:');
push('          type: string');
push('          description: 對應決策閘門或 API 呼叫的 trace ID,用於審計復盤');
push('          example: "trc_20260921_0001"');
push('        code:');
push('          type: string');
push('          description: 結構化錯誤碼(見 components.x-error-codes)');
push('          example: "RISK_LIMIT_BREACH"');
push('        message:');
push('          type: string');
push('          description: 人類可讀錯誤描述');
push('        details:');
push('          type: object');
push('          description: 額外結構化資訊(指標值、上限、衝突路徑等)');
push('          additionalProperties: true');
push('        retryable:');
push('          type: boolean');
push('          description: 是否可安全重試(idempotent endpoint 已 replay 不算重試)');
push('        timestamp:');
push('          type: string');
push('          format: date-time');
push('      example:');
push('        traceId: "trc_20260921_0001"');
push('        code: "RISK_LIMIT_BREACH"');
push('        message: "CVaR 95 exceeded policy limit"');
push('        details:');
push('          metric: "CVaR95"');
push('          value: 0.134');
push('          limit: 0.12');
push('        retryable: false');
push('        timestamp: "2026-09-21T09:30:00Z"');
push('');

push('    EvidenceChain:');
push('      type: object');
push('      description: 審計證據鏈(所有決策路徑必填)');
push('      required: [traceId, modelVersion, policyDigest, decisionHash]');
push('      properties:');
push('        traceId: { type: string, example: "trc_20260921_0001" }');
push('        modelVersion: { type: string, example: "hmm-v3.2.1" }');
push('        policyDigest:');
push('          type: string');
push('          description: 當下生效 policy 的 SHA-256 digest');
push('          example: "sha256:9f4a3b2c..."');
push('        decisionHash:');
push('          type: string');
push('          description: 此次決策的不可變 hash');
push('          example: "0x7c3e9a4b..."');
push('        featureSnapshotId:');
push('          type: string');
push('          description: 輸入特徵快照 ID');
push('          example: "fs_20260921_a1b2c3"');
push('');

push('    GateResult:');
push('      type: object');
push('      required: [step, name, status]');
push('      properties:');
push('        step: { type: integer, example: 1 }');
push('        name: { type: string, enum: [consistency, risk, compliance, feasibility] }');
push('        status: { type: string, enum: [pass, warn, fail] }');
push('        metric:');
push('          type: object');
push('          description: 量化指標(僅 step 2 / 3 / 4 填寫)');
push('          additionalProperties: true');
push('');

push('    DecisionGateEvaluateRequest:');
push('      type: object');
push('      required: [proposalId, portfolioId, weights, marketSnapshotId, policyVersion]');
push('      properties:');
push('        proposalId: { type: string }');
push('        portfolioId: { type: string }');
push('        weights:');
push('          type: object');
push('          additionalProperties: { type: number, minimum: 0, maximum: 1 }');
push('        marketSnapshotId: { type: string }');
push('        policyVersion: { type: string }');
push('');

push('    DecisionGateEvaluateResponse:');
push('      type: object');
push('      required: [traceId, gates, allPassed]');
push('      properties:');
push('        traceId: { type: string }');
push('        gates:');
push('          type: array');
push('          items: { $ref: "#/components/schemas/GateResult" }');
push('        allPassed: { type: boolean }');
push('        decisionHash: { type: string }');
push('');

push('    AuditRecord:');
push('      type: object');
push('      description: WORM 不可變審計紀錄');
push('      required: [traceId, requestHash, responseHash, modelVersion, policyDigest, signedAt]');
push('      properties:');
push('        traceId: { type: string }');
push('        requestHash: { type: string }');
push('        responseHash: { type: string }');
push('        modelVersion: { type: string }');
push('        policyDigest: { type: string }');
push('        featureSnapshotId: { type: string }');
push('        actor:');
push('          type: string');
push('          description: 觸發者(來自 JWT `sub` claim)');
push('        approvedBy:');
push('          type: string');
push('          description: 人工覆核者(若經 4 步閘門後需覆核)');
push('        signedAt: { type: string, format: date-time }');
push('');

push('    GenericRequest:');
push('      type: object');
push('      additionalProperties: true');
push('');

push('    GenericResponse:');
push('      type: object');
push('      additionalProperties: true');
push('');

push('    MarketDataSnapshot:');
push('      type: object');
push('      required: [snapshotId, asOf, data]');
push('      properties:');
push('        snapshotId: { type: string }');
push('        asOf: { type: string, format: date-time }');
push('        data:');
push('          type: object');
push('          description: 指標值 map');
push('          additionalProperties: { type: number }');
push('          example:');
push('            VIX: 19.12');
push('            DXY: 103.45');
push('            US10Y: 4.234');
push('            GOLD: 2654.30');
push('');

// ===== x-error-codes(擴充欄位,記錄所有標準錯誤碼)=====
push('  # ---------- x-error-codes: 標準錯誤碼字典(v9.1)----------');
push('  x-error-codes:');
push('    description: 統一錯誤碼字典,前端 / 監控 / CI 應依此分流。');
push('    categories:');
push('      - prefix: AUTH_');
push('        meaning: 身份 / 權限');
push('        retryable: false');
push('        codes:');
push('          - { code: AUTH_UNAUTHORIZED, http: 401, desc: "JWT 過期 / 缺失 / 簽章錯誤" }');
push('          - { code: AUTH_FORBIDDEN_ROLE, http: 403, desc: "RBAC 拒絕(投顧 ≠ 風控 ≠ 審計)" }');
push('      - prefix: DATA_');
push('        meaning: 資料');
push('        retryable: true');
push('        codes:');
push('          - { code: DATA_STALE_SNAPSHOT, http: 503, desc: "資料新鮮度 > 5 分鐘" }');
push('          - { code: DATA_SOURCE_MISMATCH, http: 503, desc: "兩個來源數據不一致" }');
push('      - prefix: MODEL_');
push('        meaning: 模型');
push('        retryable: false');
push('        codes:');
push('          - { code: MODEL_DRIFT_DETECTED, http: 409, desc: "模型漂移超閾值,自動降權" }');
push('          - { code: MODEL_VERSION_INCOMPAT, http: 409, desc: "模型版本與 policy 不匹配" }');
push('      - prefix: RISK_');
push('        meaning: 風控');
push('        retryable: false');
push('        codes:');
push('          - { code: RISK_LIMIT_BREACH, http: 422, desc: "CVaR / VaR / 集中度超限" }');
push('          - { code: RISK_LIMIT_NEAR, http: 200, desc: "接近上限 85%(降權提示)" }');
push('      - prefix: POLICY_');
push('        meaning: 政策');
push('        retryable: false');
push('        codes:');
push('          - { code: POLICY_CONFLICT, http: 409, desc: "規則衝突(同 priority 多條命中)" }');
push('          - { code: POLICY_PARTIAL_BLOCK, http: 207, desc: "4 步閘門部分通過,需人工覆核" }');
push('      - prefix: EXEC_');
push('        meaning: 執行');
push('        retryable: varies');
push('        codes:');
push('          - { code: EXEC_ORDER_REJECTED, http: 422, desc: "券商 / 交易所拒單" }');
push('          - { code: EXEC_SLIPPAGE_EXCEEDED, http: 422, desc: "滑點超 TCA 上限" }');
push('          - { code: EXEC_IDEMPOTENT_REPLAY, http: 200, desc: "同 idempotency-key 重送(無副作用)" }');
push('');

push('  # ---------- x-slo-targets(服務水準目標)----------');
push('  x-slo-targets:');
push('    description: 全域 SLO 與錯誤預算');
push('    targets:');
push('      - { metric: availability_30d, target: "99.95%", error_budget_monthly: "~22min" }');
push('      - { metric: p95_latency_ms, target: "< 350ms", scope: "non-streaming" }');
push('      - { metric: data_freshness_s, target: "< 300s" }');
push('      - { metric: retry_rate_24h, target: "< 2%", note: "主要由 idempotent replay 構成" }');
push('');

push('  # ---------- x-webhook-spec(Webhook 簽章與重放保護)----------');
push('  x-webhook-spec:');
push('    description: |');
push('      所有 webhook 接收端必須驗證以下 headers,缺一視為無效。');
push('    signing:');
push('      algorithm: HMAC-SHA256');
push('      header: X-Webhook-Signature');
push('      format: "sha256=<64-char hex>"');
push('      signing_string: "${timestamp}.${nonce}.${raw_payload}"');
push('    required_headers:');
push('      - X-Webhook-Id');
push('      - X-Webhook-Timestamp');
push('      - X-Webhook-Nonce');
push('      - X-Webhook-Signature');
push('      - X-Webhook-Event');
push('    replay_protection:');
push('      nonce_cache_ttl_seconds: 600');
push('      timestamp_skew_tolerance_seconds: 300');
push('');

// ===== 寫檔 =====
const outPath = path.join(__dirname, '..', 'openapi.yaml');
fs.writeFileSync(outPath, out.join('\n'), 'utf-8');
console.log('✓ 生成 ' + outPath);
console.log('  共 ' + endpoints.length + ' 個 endpoint');
console.log('  共 ' + out.length + ' 行');
