// ============================================================
// OpenAPI YAML 規格測試
// 確保 openapi.yaml 結構合法 + 符合 v2 標準
// 執行: node --test tests/openapi-schema.test.js
// ============================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

let yamlLib;
try {
    yamlLib = require('js-yaml');
} catch (e) {
    // 嘗試從 node_modules 全域載入
    try {
        yamlLib = require(path.join('/tmp', 'node_modules', 'js-yaml'));
    } catch (e2) {
        console.warn('⚠ js-yaml 未安裝,改用內建輕量 parser。請 npm install js-yaml --save-dev');
        yamlLib = null;
    }
}

const SPEC_PATH = path.join(__dirname, '..', 'openapi.yaml');

function loadSpec() {
    const text = fs.readFileSync(SPEC_PATH, 'utf-8');
    if (yamlLib) return yamlLib.load(text);
    // Fallback:超簡單 parser(只處理這份已知格式)
    return minimalYamlParse(text);
}

function minimalYamlParse(text) {
    // 警告:僅供測試 fallback,功能有限
    const lines = text.split('\n');
    const root = {};
    const stack = [{ indent: -1, obj: root }];
    for (const raw of lines) {
        if (!raw.trim() || raw.trim().startsWith('#')) continue;
        const indent = raw.match(/^(\s*)/)[0].length;
        const line = raw.trim();
        while (stack.length > 1 && stack[stack.length - 1].indent >= indent) stack.pop();
        const top = stack[stack.length - 1].obj;
        if (line.startsWith('- ')) {
            const val = line.slice(2).trim().replace(/^["']|["']$/g, '');
            if (!Array.isArray(top)) {
                // 需上一層是 array
                if (!Array.isArray(stack[stack.length - 1].obj)) {
                    // 跳過
                }
            }
            if (Array.isArray(top)) top.push(val);
        } else {
            const m = line.match(/^([^:]+):\s*(.*)$/);
            if (!m) continue;
            const key = m[1].trim();
            const val = m[2].trim();
            if (val === '') {
                // 子物件或 array
                const isArrayItem = stack.length > 1 && Array.isArray(stack[stack.length - 1].obj) &&
                    stack[stack.length - 1].obj === top;
                const newObj = {};
                top[key] = newObj;
                stack.push({ indent, obj: newObj });
            } else {
                top[key] = val.replace(/^["']|["']$/g, '');
            }
        }
    }
    return root;
}

describe('OpenAPI YAML 基本結構', () => {
    let spec;
    test.before(() => { spec = loadSpec(); });

    test('YAML 解析不應失敗', () => {
        assert.ok(spec, 'spec 應為非空物件');
    });

    test('openapi 版本 = 3.1.0', () => {
        assert.equal(spec.openapi, '3.1.0');
    });

    test('info.title 與 version 必填', () => {
        assert.ok(spec.info?.title, '應有 info.title');
        assert.ok(spec.info?.version, '應有 info.version');
        assert.match(spec.info.title, /TAA/);
    });

    test('至少 1 個 server', () => {
        assert.ok(Array.isArray(spec.servers) && spec.servers.length > 0);
        assert.match(spec.servers[0].url, /\/api\/v2/);
    });
});

describe('OpenAPI paths', () => {
    let spec;
    test.before(() => { spec = loadSpec(); });

    test('所有 path 必須以 /api/v2/ 開頭', () => {
        Object.keys(spec.paths || {}).forEach(p => {
            assert.ok(p.startsWith('/api/v2/'), `path 不符合 v2 標準:${p}`);
        });
    });

    test('所有 operation 必須有 operationId + summary + description', () => {
        Object.entries(spec.paths || {}).forEach(([p, methods]) => {
            Object.entries(methods).filter(([k]) => !k.startsWith('x-')).forEach(([m, op]) => {
                assert.ok(op.operationId, `${m.toUpperCase()} ${p} 缺 operationId`);
                assert.ok(op.summary, `${m.toUpperCase()} ${p} 缺 summary`);
                assert.ok(op.description, `${m.toUpperCase()} ${p} 缺 description`);
            });
        });
    });

    test('每個 operation 至少要有 200 response', () => {
        Object.entries(spec.paths || {}).forEach(([p, methods]) => {
            Object.entries(methods).filter(([k]) => !k.startsWith('x-')).forEach(([m, op]) => {
                assert.ok(op.responses?.['200'], `${m.toUpperCase()} ${p} 缺 200 response`);
            });
        });
    });

    test('GET 路徑不應有 requestBody', () => {
        Object.entries(spec.paths || {}).forEach(([p, methods]) => {
            if (methods.get) {
                assert.ok(!methods.get.requestBody, `GET ${p} 不應有 requestBody`);
            }
        });
    });
});

describe('OpenAPI components', () => {
    let spec;
    test.before(() => { spec = loadSpec(); });

    test('components.schemas.ErrorResponse 必填且包含必要欄位', () => {
        const schema = spec.components?.schemas?.ErrorResponse;
        assert.ok(schema, '應有 ErrorResponse schema');
        const required = schema.required || [];
        ['traceId', 'code', 'message', 'retryable'].forEach(f => {
            assert.ok(required.includes(f), `ErrorResponse 缺必填欄位:${f}`);
        });
    });

    test('components.securitySchemes 至少包含 OAuth2', () => {
        assert.ok(spec.components?.securitySchemes?.OAuth2);
        assert.equal(spec.components.securitySchemes.OAuth2.type, 'oauth2');
    });

    test('所有 path 必須有 security 設定', () => {
        Object.entries(spec.paths || {}).forEach(([p, methods]) => {
            Object.entries(methods).filter(([k]) => !k.startsWith('x-')).forEach(([m, op]) => {
                assert.ok(op.security, `${m.toUpperCase()} ${p} 缺 security`);
            });
        });
    });
});

describe('x-error-codes 字典', () => {
    let spec;
    test.before(() => { spec = loadSpec(); });

    test('x-error-codes 存在', () => {
        const ec = spec.components?.['x-error-codes'];
        assert.ok(ec, '應有 x-error-codes');
        assert.ok(Array.isArray(ec.categories));
    });

    test('所有錯誤碼前綴格式正確(AUTH_/DATA_/MODEL_/RISK_/POLICY_/EXEC_)', () => {
        const validPrefixes = ['AUTH_', 'DATA_', 'MODEL_', 'RISK_', 'POLICY_', 'EXEC_'];
        const ec = spec.components?.['x-error-codes'];
        ec.categories.forEach(cat => {
            assert.ok(validPrefixes.includes(cat.prefix), `未知前綴:${cat.prefix}`);
            cat.codes.forEach(c => {
                assert.ok(c.code.startsWith(cat.prefix), `${c.code} 未匹配前綴 ${cat.prefix}`);
                assert.ok(c.http >= 200 && c.http < 600, `${c.code} HTTP 碼異常:${c.http}`);
            });
        });
    });

    test('錯誤碼總數 ≥ 10', () => {
        const ec = spec.components?.['x-error-codes'];
        const total = ec.categories.reduce((sum, c) => sum + c.codes.length, 0);
        assert.ok(total >= 10, `錯誤碼數量過少:${total}`);
    });
});

describe('x-slo-targets 與 x-webhook-spec', () => {
    let spec;
    test.before(() => { spec = loadSpec(); });

    test('x-slo-targets 至少 3 項', () => {
        const slo = spec.components?.['x-slo-targets'];
        assert.ok(slo?.targets?.length >= 3);
    });

    test('x-webhook-spec 含 HMAC-SHA256 + nonce 重放保護', () => {
        const wh = spec.components?.['x-webhook-spec'];
        assert.ok(wh);
        assert.equal(wh.signing?.algorithm, 'HMAC-SHA256');
        assert.ok(wh.replay_protection?.nonce_cache_ttl_seconds > 0);
    });
});

describe('OPENAPI_ENDPOINTS 與 openapi.yaml 同步', () => {
    let spec;
    test.before(() => { spec = loadSpec(); });

    test('paths 數量應與 HTML 內的 endpoints 一致(9 個)', () => {
        const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf-8');
        const match = html.match(/const\s+OPENAPI_ENDPOINTS\s*=\s*\[/);
        assert.ok(match, 'HTML 內應有 OPENAPI_ENDPOINTS');
        // 粗略計算 path 物件數量
        const pathCount = (html.match(/path:\s*'\/api\/v2\//g) || []).length;
        assert.equal(pathCount, 9, `HTML 應有 9 個 endpoint,實際:${pathCount}`);
        assert.equal(Object.keys(spec.paths).length, pathCount);
    });
});
