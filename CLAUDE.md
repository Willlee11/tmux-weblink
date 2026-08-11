# 发布流程（tmux-weblink）

**版本发布必须通过 GitHub Actions 自动完成，不要手动 `npm publish`。**

## 步骤

1. 更新版本号：`package.json` 与 `package-lock.json` 的 `version` 字段（例如 `2.0.3`）
2. 提交并推送 `main`
3. 打版本 tag 并推送：

   ```bash
   git tag v2.0.3
   git push origin v2.0.3
   ```

4. GitHub Actions 的 `Publish to npm`（`.github/workflows/publish.yml`）自动执行：
   - `npm ci`
   - `npm publish --provenance`（`prepublishOnly` 会自动运行 `npm run build`，无需本地构建）
   - 认证使用仓库 `secrets.NPM_TOKEN`

也可以直接在 GitHub Actions 页面手动 "Run workflow"（`workflow_dispatch`），发布当前 `main` 的版本。

## 注意

- tag 名必须是 `v<version>` 且与 package.json 版本一致；版本已存在时 `npm publish` 会失败（不允许覆盖）
- 发布前确认 `test.yml`（push main / PR 时自动跑测试与构建）通过
- 本地 `npm publish` 仅限紧急回退场景，正常发布一律走 GitHub Action
