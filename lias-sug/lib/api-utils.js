// ============================================================
// TAA Institutional API v2 - Shared Utilities
// 雙模式模組:瀏覽器 <script> 載入(掛 globalThis) + Node.js require()
// ============================================================

(function (root, factory) {
    'use strict';
    const api = factory();
    // 瀏覽器全域
    if (typeof window !== 'undefined') {
        root.apiUtils = api;
        // 為向後相容,同時掛載到 window 直接
        root.genEvidence = api.genEvidence;
        root.signWebhookPayload = api.signWebhookPayload;
        root.buildWebhookHeaders = api.buildWebhookHeaders;
    }
    // Node.js / CommonJS
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    // ===== 計數器(模組層級 state,跨呼叫遞增)=====
    let evidenceCounter = 0;

    /**
     * 重置證據鏈計數器(測試用)。
     */
    function resetEvidenceCounter() { evidenceCounter = 0; }

    /**
     * 取得當前計數器值(測試用)。
     */
    function getEvidenceCounter() { return evidenceCounter; }

    /**
     * 32-bit FNV-1a 變種 hash(決定性、可重現,純 JS、不需 crypto 模組)。
     * 視覺上像 SHA256,但純前端、不依賴 Web Crypto。
     * @param {string} input
     * @returns {string} 8-char hex
     */
    function fnv1a(input) {
        let h = 0x811c9dc5;
        for (let i = 0; i < input.length; i++) {
            h ^= input.charCodeAt(i);
            h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
        }
        return ('00000000' + h.toString(16)).slice(-8);
    }

    /**
     * 雙 FNV hash(用於 decisionHash,產出 12-char hex)。
     * @param {string} input
     * @returns {string} 12-char hex
     */
    function fnv1aXor(input) {
        const h1 = parseInt(fnv1a('A:' + input), 16) >>> 0;
        const h2 = parseInt(fnv1a('B:' + input), 16) >>> 0;
        // >>> 0 把結果轉成無符號 32-bit,確保 .toString(16) 不會產生負號
        const xored = (h1 ^ h2) >>> 0;
        return ('000000000000' + xored.toString(16)).slice(-12);
    }

    /**
     * 取得今日日期字串 YYYYMMDD(UTC)。
     */
    function todayStr() {
        return new Date().toISOString().slice(0, 10).replace(/-/g, '');
    }

    /**
     * 產生一份擬真證據鏈。
     * 設計原則:
     *   - 決定性(同 input + counter 必產生同 hash,便於審計追溯)
     *   - 不洩漏敏感資料(只顯示版本/摘要/快照 ID)
     *   - 與實際 production schema 對齊(traceId/modelVersion/policyDigest/decisionHash/featureSnapshotId)
     *
     * @param {string} step - 'gate' | 'playbook' | 'batch' | 'summary' | 'replay' | 'test'
     * @param {string} [extra] - 額外種子(如 step 編號)
     * @returns {{traceId:string, modelVersion:string, policyDigest:string, decisionHash:string, featureSnapshotId:string}}
     */
    function genEvidence(step, extra) {
        evidenceCounter++;
        const dateStr = todayStr();
        const traceId = 'trc_' + dateStr + '_' + String(evidenceCounter).padStart(4, '0');
        const modelVersion = step === 'gate'
            ? 'hmm-v3.2.1 + bl-v2.4.0'
            : 'policy-engine-v1.8.3';
        const seed = step + ':' + evidenceCounter + ':' + (extra || '');
        const policyDigest = 'sha256:' + fnv1a('policy:' + seed) + '...' + fnv1a('end:' + seed);
        const decisionHash = '0x' + fnv1aXor('decision:' + seed);
        const featureSnapshotId = 'fs_' + dateStr + '_' + fnv1a('fs:' + seed).slice(0, 6);
        return { traceId, modelVersion, policyDigest, decisionHash, featureSnapshotId };
    }

    // ===== Webhook HMAC 簽章 =====

    /**
     * 產生 8-byte nonce,回傳 16-char hex。
     * 瀏覽器用 crypto.getRandomValues;Node.js 用 crypto.randomBytes。
     * @returns {string} hex nonce
     */
    function generateNonce() {
        let bytes;
        if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
            bytes = new Uint8Array(8);
            crypto.getRandomValues(bytes);
        } else if (typeof require !== 'undefined') {
            // Node.js fallback
            const nodeCrypto = require('node:crypto');
            bytes = nodeCrypto.randomBytes(8);
        } else {
            // 終極 fallback(不應走到)
            bytes = new Uint8Array(8);
            for (let i = 0; i < 8; i++) bytes[i] = Math.floor(Math.random() * 256);
        }
        return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
    }

    /**
     * 將 byte array 轉 hex string。
     */
    function bufToHex(buf) {
        return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
    }

    /**
     * 計算 HMAC-SHA256,跨環境可用。
     * 瀏覽器:crypto.subtle.sign('HMAC', ...)
     * Node.js:crypto.createHmac('sha256', ...)
     *
     * @param {string} key - shared secret
     * @param {string} message - signing string (ts + '.' + nonce + '.' + payload)
     * @returns {Promise<string>} 'sha256=<hex>'
     */
    async function hmacSha256(key, message) {
        // 優先用 Web Crypto(瀏覽器 + Node 16+ globalThis.crypto.webcrypto)
        if (typeof crypto !== 'undefined' && crypto.subtle) {
            const enc = new TextEncoder();
            const k = await crypto.subtle.importKey(
                'raw',
                enc.encode(key),
                { name: 'HMAC', hash: 'SHA-256' },
                false,
                ['sign']
            );
            const sig = await crypto.subtle.sign('HMAC', k, enc.encode(message));
            return 'sha256=' + bufToHex(sig);
        }
        // Node.js fallback
        const nodeCrypto = typeof require !== 'undefined' ? require('node:crypto') : null;
        if (nodeCrypto && nodeCrypto.createHmac) {
            const sig = nodeCrypto.createHmac('sha256', key).update(message).digest('hex');
            return 'sha256=' + sig;
        }
        throw new Error('No crypto backend available');
    }

    /**
     * 構造 webhook signing string(供 HMAC 簽)。
     * 格式: `${timestamp}.${nonce}.${payload}`
     *
     * @param {string} timestamp - ISO 8601 (e.g. "2026-09-21T09:30:00Z")
     * @param {string} nonce
     * @param {string} payload - JSON string
     * @returns {string}
     */
    function buildSigningString(timestamp, nonce, payload) {
        return timestamp + '.' + nonce + '.' + payload;
    }

    /**
     * 產生完整 webhook headers(同步版本,只構造 metadata,簽章用 placeholder)。
     * 真正簽章用 signWebhookPayload。
     *
     * @param {object} opts
     * @param {string} opts.url
     * @param {string} opts.timestamp
     * @param {string} opts.nonce
     * @param {string} opts.signature
     * @param {string} opts.event
     * @param {number} opts.payloadLength
     * @returns {object} headers
     */
    function buildWebhookHeaders(opts) {
        return {
            'Host': new URL(opts.url).host,
            'Content-Type': 'application/json',
            'User-Agent': 'TAA-Engine/2.0',
            'X-Webhook-Id': opts.nonce,
            'X-Webhook-Timestamp': opts.timestamp,
            'X-Webhook-Nonce': opts.nonce,
            'X-Webhook-Signature': opts.signature,
            'X-Webhook-Event': opts.event,
            'Content-Length': String(opts.payloadLength)
        };
    }

    /**
     * 一站式 webhook 簽章(完整流程)。
     *
     * @param {object} opts
     * @param {string} opts.url
     * @param {string} opts.secret
     * @param {string} opts.payload - JSON string
     * @param {string} opts.event
     * @param {string} [opts.timestamp] - 預設 now
     * @param {string} [opts.nonce] - 預設隨機
     * @returns {Promise<{timestamp:string, nonce:string, signingString:string, signature:string, headers:object}>}
     */
    async function signWebhookPayload(opts) {
        const timestamp = opts.timestamp || new Date().toISOString();
        const nonce = opts.nonce || generateNonce();
        const signingString = buildSigningString(timestamp, nonce, opts.payload);
        const signature = await hmacSha256(opts.secret, signingString);
        const headers = buildWebhookHeaders({
            url: opts.url,
            timestamp,
            nonce,
            signature,
            event: opts.event,
            payloadLength: opts.payload.length
        });
        return { timestamp, nonce, signingString, signature, headers };
    }

    return {
        // evidence chain
        genEvidence,
        resetEvidenceCounter,
        getEvidenceCounter,
        // hash helpers (exported for testing)
        fnv1a,
        fnv1aXor,
        // webhook
        generateNonce,
        hmacSha256,
        buildSigningString,
        buildWebhookHeaders,
        signWebhookPayload
    };
});
