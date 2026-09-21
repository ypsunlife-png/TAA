# SSOT Freeze Policy v9.0

Policy ID: `SSOT-FREEZE-v9.0`  
Status: `Draft`  
Effective Date: `2026-09-21`  
Owner: `TAA / LIAS-SUG Maintainers`

---

## 1. Objective

建立 Single Source of Truth (SSOT) 冻結治理機制，確保：

- 規則、參數、風控閾值有唯一可信來源
- 發版前後配置可追溯、可審計、可回滾
- 減少「文件、程式、環境」不一致風險

---

## 2. Scope

本政策適用於 LIAS-SUG MVP 中以下資產：

- 決策規則（Decision Gates）
- 風控閾值（Risk Limits）
- 觸發器規則（Trigger Rules）
- 執行限制（Execution Constraints）
- OpenAPI 規格 (`openapi.yaml`)
- 錯誤碼字典 (`docs/error-codes-v1.md`)

---

## 3. Definitions

- **SSOT**：唯一權威來源，任何運行規則以其為準
- **Freeze Window**：凍結窗口，禁止未授權變更
- **Change Request (CR)**：配置或規則變更申請
- **Emergency Change**：緊急變更，需事後補審計

---

## 4. SSOT Artifacts (Authoritative Files)

建議以下路徑作為權威來源：

- `lias-sug/openapi.yaml`
- `lias-sug/docs/error-codes-v1.md`
- `lias-sug/policies/ssot-freeze-v9.0.md`
- （可擴展）`lias-sug/config/*.yaml`：規則與閾值配置

> 若程式碼行為與 SSOT 文件不一致，以已核准版本的 SSOT 為準，並立即建立修復任務。

---

## 5. Freeze Stages

## 5.1 Stage A — Pre-Freeze
- 功能可持續開發
- 所有規則變更必須透過 PR
- 必須通過 CI（lint/test/basic contract）

## 5.2 Stage B — Soft Freeze
- 僅允許 P0/P1 缺陷修復
- 禁止新增 API breaking changes
- 需至少 1 位 maintainer 核准

## 5.3 Stage C — Hard Freeze
- 僅允許 emergency change
- 需 2 位 approvers（含 Owner）
- 需附回滾方案與風險說明

---

## 6. Change Control

任何 SSOT 變更必須包含：

1. 變更目的與影響範圍
2. 受影響 API / 模組列表
3. 測試證據（單測/整合測試/模擬）
4. 回滾步驟
5. 版本增量（例如 `v1.0 -> v1.1`）

PR 標題建議格式：

- `policy(ssot): ...`
- `docs(error-codes): ...`
- `feat(risk-rules): ...`

---

## 7. Approval Matrix

| Change Type | Required Approver | Min Approvals |
|---|---|---:|
| 文件文字修正（無語意變更） | Maintainer | 1 |
| 錯誤碼新增 | Maintainer + API owner | 2 |
| 風控閾值調整 | Risk owner + Maintainer | 2 |
| API 契約變更 | API owner + Maintainer | 2 |
| 緊急變更 | Owner + 任一 Maintainer | 2 |

---

## 8. Versioning Rules

- 採語意化版本：`MAJOR.MINOR.PATCH`
- `MAJOR`：不相容變更（需公告）
- `MINOR`：向後相容新增
- `PATCH`：修正文字、拼寫、非行為變更

---

## 9. Audit & Traceability

每次變更需可追溯到：

- PR URL
- Commit SHA
- Reviewer 名單
- 上線時間
- 回滾紀錄（如有）

建議在 PR 模板加入 checklist：

- [ ] 已更新相關 SSOT 文件
- [ ] 已更新測試
- [ ] 已評估 backward compatibility
- [ ] 已提供 rollback plan

---

## 10. Environment Promotion Policy

推進環境建議順序：

1. `dev`
2. `staging`
3. `prod`

每次 promotion 前需確認：

- CI 全綠
- 版本標籤一致
- SSOT 文件與部署內容一致

---

## 11. Exception Handling (Emergency)

緊急變更可先行，但必須在 `24h` 內補齊：

- 事後 CR 文件
- 風險評估
- 回顧報告（RCA）
- 永久修復計畫（如適用）

---

## 12. Enforcement

違反本政策的變更可被拒絕合併或要求回滾。  
對 repeated violations，maintainers 可暫停其 direct merge 權限。

---

## 13. Review Cycle

- 固定每季檢視一次（Quarterly）
- 發生重大事故後需立即復審政策

---

## 14. Changelog

- `v9.0` (2026-09-21): 初版建立，對齊 LIAS-SUG MVP 治理流程
