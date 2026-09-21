// ============================================================
// TAA api-utils 單元測試
// 使用 Node 內建 node:test + node:assert(零依賴)
// 執行: node --test tests/api-utils.test.js
// ============================================================

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

// 直接 require 模組(雙模式 export 的 CommonJS 端)
const apiUtils = require(path.join(__dirname, '..', 'lib', 'api-utils.js'));

describe('Evidence Chain (genEvidence)', () => {
    beforeEach(() => {
        // 每個 test 隔離計數器(避免測試互相污染)
        apiUtils.resetEvidenceCounter();
    });

    test('產出全部 5 個必要欄位', () => {
        const ev = apiUtils.genEvidence('gate', 'step1');
        assert.ok(ev.traceId, '應有 traceId');
        assert.ok(ev.modelVersion, '應有 modelVersion');
        assert.ok(ev.policyDigest, '應有 policyDigest');
        assert.ok(ev.decisionHash, '應有 decisionHash');
        assert.ok(ev.featureSnapshotId, '應有 featureSnapshotId');
    });

    test('traceId 格式正確:trc_YYYYMMDD_NNNN', () => {
        const ev = apiUtils.genEvidence('gate');
        assert.match(ev.traceId, /^trc_\d{8}_\d{4}$/, `應符合 trc_YYYYMMDD_NNNN,實際:${ev.traceId}`);
    });

    test('policyDigest 格式正確:sha256:<hex>...<hex>', () => {
        const ev = apiUtils.genEvidence('gate');
        assert.match(ev.policyDigest, /^sha256:[0-9a-f]{8}\.\.\.[0-9a-f]{8}$/);
    });

    test('decisionHash 格式正確:0x + 12-char hex', () => {
        const ev = apiUtils.genEvidence('gate');
        assert.match(ev.decisionHash, /^0x[0-9a-f]{12}$/);
    });

    test('featureSnapshotId 格式正確:fs_YYYYMMDD_<6-char>', () => {
        const ev = apiUtils.genEvidence('gate');
        assert.match(ev.featureSnapshotId, /^fs_\d{8}_[0-9a-f]{6}$/);
    });

    test('同 input 產生相同 hash(決定性,審計可追溯)', () => {
        apiUtils.resetEvidenceCounter();
        const a = apiUtils.genEvidence('gate', 'step1');
        apiUtils.resetEvidenceCounter();
        const b = apiUtils.genEvidence('gate', 'step1');
        assert.equal(a.traceId, b.traceId, 'traceId 應一致');
        assert.equal(a.policyDigest, b.policyDigest, 'policyDigest 應一致');
        assert.equal(a.decisionHash, b.decisionHash, 'decisionHash 應一致');
        assert.equal(a.featureSnapshotId, b.featureSnapshotId, 'featureSnapshotId 應一致');
    });

    test('不同 step 產生不同 modelVersion', () => {
        const gateEv = apiUtils.genEvidence('gate');
        const playbookEv = apiUtils.genEvidence('playbook');
        assert.notEqual(gateEv.modelVersion, playbookEv.modelVersion);
        assert.match(gateEv.modelVersion, /hmm-v3\.2\.1/);
        assert.match(playbookEv.modelVersion, /policy-engine-v1\.8\.3/);
    });

    test('不同 step/extra 組合 → 不同 decisionHash', () => {
        apiUtils.resetEvidenceCounter();
        const a = apiUtils.genEvidence('gate', 'step1');
        const b = apiUtils.genEvidence('gate', 'step2');
        const c = apiUtils.genEvidence('playbook', 'step1');
        assert.notEqual(a.decisionHash, b.decisionHash, '不同 extra 應有不同 hash');
        assert.notEqual(a.decisionHash, c.decisionHash, '不同 step 應有不同 hash');
    });

    test('traceId 計數器單調遞增', () => {
        const a = apiUtils.genEvidence('test', '1');
        const b = apiUtils.genEvidence('test', '2');
        const c = apiUtils.genEvidence('test', '3');
        const seq = [a, b, c].map(e => parseInt(e.traceId.split('_').pop(), 10));
        assert.deepEqual(seq, [1, 2, 3], 'traceId 序號應連續遞增');
    });

    test('edge case: extra 為 undefined 不應 crash', () => {
        const ev = apiUtils.genEvidence('gate');
        assert.ok(ev.decisionHash);
        assert.ok(ev.policyDigest);
    });

    test('edge case: extra 為空字串', () => {
        const a = apiUtils.genEvidence('gate', '');
        assert.ok(a.decisionHash);
    });
});

describe('Hash 函式 (fnv1a / fnv1aXor)', () => {
    test('fnv1a 輸出固定 8-char hex', () => {
        const h = apiUtils.fnv1a('test');
        assert.match(h, /^[0-9a-f]{8}$/);
    });

    test('fnv1a 對相同輸入產生相同輸出', () => {
        assert.equal(apiUtils.fnv1a('hello'), apiUtils.fnv1a('hello'));
    });

    test('fnv1a 對不同輸入產生不同輸出(高機率)', () => {
        const hashSet = new Set();
        for (let i = 0; i < 1000; i++) hashSet.add(apiUtils.fnv1a('msg-' + i));
        assert.equal(hashSet.size, 1000, '1000 個不同輸入應有 1000 個不同 hash');
    });

    test('fnv1aXor 輸出固定 12-char hex', () => {
        const h = apiUtils.fnv1aXor('test');
        assert.match(h, /^[0-9a-f]{12}$/);
    });

    test('fnv1aXor 與 FNV-1a 衝突測試', () => {
        const h1 = apiUtils.fnv1aXor('a');
        const h2 = apiUtils.fnv1aXor('b');
        assert.notEqual(h1, h2);
    });
});

describe('Webhook HMAC 簽章', () => {
    test('buildSigningString 構造正確格式', () => {
        const ts = '2026-09-21T09:30:00Z';
        const nonce = 'abc1234567890123';
        const payload = '{"hello":"world"}';
        const sig = apiUtils.buildSigningString(ts, nonce, payload);
        assert.equal(sig, '2026-09-21T09:30:00Z.abc1234567890123.{"hello":"world"}');
    });

    test('generateNonce 回傳 16-char hex', () => {
        const nonce = apiUtils.generateNonce();
        assert.match(nonce, /^[0-9a-f]{16}$/);
    });

    test('generateNonce 兩次呼叫結果不同(高機率)', () => {
        const n1 = apiUtils.generateNonce();
        const n2 = apiUtils.generateNonce();
        assert.notEqual(n1, n2);
    });

    test('hmacSha256 產出 sha256= 前綴 + 64-char hex', async () => {
        const sig = await apiUtils.hmacSha256('secret', 'message');
        assert.match(sig, /^sha256=[0-9a-f]{64}$/);
    });

    test('hmacSha256 對相同輸入產生相同輸出(決定性)', async () => {
        const s1 = await apiUtils.hmacSha256('secret', 'message');
        const s2 = await apiUtils.hmacSha256('secret', 'message');
        assert.equal(s1, s2);
    });

    test('hmacSha256 對不同 secret 產生不同簽章', async () => {
        const s1 = await apiUtils.hmacSha256('secret-a', 'message');
        const s2 = await apiUtils.hmacSha256('secret-b', 'message');
        assert.notEqual(s1, s2);
    });

    test('hmacSha256 對不同 message 產生不同簽章', async () => {
        const s1 = await apiUtils.hmacSha256('secret', 'message-a');
        const s2 = await apiUtils.hmacSha256('secret', 'message-b');
        assert.notEqual(s1, s2);
    });

    test('hmacSha256 與 OpenSSL/Python 結果一致(標準向量)', async () => {
        // RFC 4231 Test Case 1: key = 0x0b * 20, data = "Hi There"
        // 我們用短 key 版本(若 key < blocksize 會自動 pad,但 Web Crypto 不支援,需 ≥ 32 bytes)
        // 改用實際常見 secret:"key" + data:"The quick brown fox jumps over the lazy dog"
        const sig = await apiUtils.hmacSha256('key', 'The quick brown fox jumps over the lazy dog');
        // 預期值(用 openssl 計算):f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8
        assert.equal(sig, 'sha256=f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8');
    });

    test('buildWebhookHeaders 包含全部必要 headers', () => {
        const h = apiUtils.buildWebhookHeaders({
            url: 'https://ops.example.com/hook',
            timestamp: '2026-09-21T09:30:00Z',
            nonce: 'abc123',
            signature: 'sha256=deadbeef',
            event: 'decision.gate.evaluated',
            payloadLength: 256
        });
        assert.equal(h['X-Webhook-Signature'], 'sha256=deadbeef');
        assert.equal(h['X-Webhook-Timestamp'], '2026-09-21T09:30:00Z');
        assert.equal(h['X-Webhook-Nonce'], 'abc123');
        assert.equal(h['X-Webhook-Event'], 'decision.gate.evaluated');
        assert.equal(h['Content-Length'], '256');
        assert.equal(h.Host, 'ops.example.com');
    });
});

describe('Webhook 端到端 (signWebhookPayload)', () => {
    test('完整流程:產生 timestamp / nonce / signingString / signature / headers', async () => {
        const result = await apiUtils.signWebhookPayload({
            url: 'https://ops.example.com/hook',
            secret: 'whsec_test',
            payload: '{"event":"test"}',
            event: 'decision.gate.evaluated',
            timestamp: '2026-09-21T09:30:00Z',
            nonce: 'fixed-nonce-1234'
        });
        assert.equal(result.timestamp, '2026-09-21T09:30:00Z');
        assert.equal(result.nonce, 'fixed-nonce-1234');
        assert.equal(result.signingString, '2026-09-21T09:30:00Z.fixed-nonce-1234.{"event":"test"}');
        assert.match(result.signature, /^sha256=[0-9a-f]{64}$/);
        assert.equal(result.headers['X-Webhook-Signature'], result.signature);
        assert.equal(result.headers['X-Webhook-Event'], 'decision.gate.evaluated');
    });

    test('timestamp 未指定時自動用當下時間(ISO 8601)', async () => {
        const result = await apiUtils.signWebhookPayload({
            url: 'https://x.com',
            secret: 's',
            payload: '{}',
            event: 'e'
        });
        assert.match(result.timestamp, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    test('nonce 未指定時自動隨機產生 16-char hex', async () => {
        const result = await apiUtils.signWebhookPayload({
            url: 'https://x.com',
            secret: 's',
            payload: '{}',
            event: 'e'
        });
        assert.match(result.nonce, /^[0-9a-f]{16}$/);
    });

    test('可獨立驗證:接收端用 secret + signingString 重算應得到相同 signature', async () => {
        const sent = await apiUtils.signWebhookPayload({
            url: 'https://x.com',
            secret: 'whsec_critical',
            payload: '{"k":"v"}',
            event: 'test.event',
            timestamp: '2026-09-21T09:30:00Z',
            nonce: 'receiver-test-nonce'
        });
        // 模擬接收端重算
        const verifySig = await apiUtils.hmacSha256('whsec_critical', sent.signingString);
        assert.equal(verifySig, sent.signature, '接收端重算應得到相同 signature');
    });

    test('不同 secret 驗證會失敗', async () => {
        const sent = await apiUtils.signWebhookPayload({
            url: 'https://x.com',
            secret: 'whsec_correct',
            payload: '{"k":"v"}',
            event: 'e',
            timestamp: '2026-09-21T09:30:00Z',
            nonce: 'n'
        });
        const wrongVerify = await apiUtils.hmacSha256('whsec_wrong', sent.signingString);
        assert.notEqual(wrongVerify, sent.signature, '錯誤 secret 應驗證失敗');
    });
});

describe('Browser <-> Node 雙模式 export', () => {
    test('CommonJS require 回傳完整 API', () => {
        assert.equal(typeof apiUtils.genEvidence, 'function');
        assert.equal(typeof apiUtils.signWebhookPayload, 'function');
        assert.equal(typeof apiUtils.hmacSha256, 'function');
        assert.equal(typeof apiUtils.buildSigningString, 'function');
        assert.equal(typeof apiUtils.buildWebhookHeaders, 'function');
        assert.equal(typeof apiUtils.generateNonce, 'function');
    });
});
