# 修复 IAFS 分支 Editor Manifest 单测 - 日志

## 2026-05-09

- 失败来源: https://github.com/Hikaru518/stellar-frontier/actions/runs/25598261101/job/75147827021
- PR: #36 `feature/iafs-crash-site-bootstrap`
- 初步定位: editor tests 对旧 manifest 顺序 / fixture 文件集合有硬编码假设。
- 修复: `contentStore.test.mjs` 按 `iafs-inspection` domain id 断言；`generate-event-content-manifest.test.mjs` 使用当前 branch 的真实 manifest/content fixture，不再覆盖旧多 domain manifest。
- 验证: editor test、root test、lint、validate-content、build、diff check 均 PASS。
