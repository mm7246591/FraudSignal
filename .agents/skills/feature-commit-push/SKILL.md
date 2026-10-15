---
name: feature-commit-push
description: 依照功能範圍整理 Git 工作樹變更、拆分 staging、建立語意清楚的 commit，並 push 到目前分支遠端。當使用者要求「依功能 commit push」、「幫我整理 commit 並推上去」、「把目前改動按功能拆 commit」、「檢查變更後 commit/push」或類似 Git 發布收尾工作時使用。
---

# 依功能 Commit Push

## 目標

在不改動業務程式碼的前提下，檢查目前 Git 工作樹，依功能或責任邊界拆分 commit，完成必要驗證後 push 到目前分支遠端。

## 工作原則

- 先確認目前分支、上游分支與工作樹狀態，再決定 commit 範圍。
- 只整理已存在的變更；除非使用者要求，不主動修改功能程式碼。
- 不要回復或覆蓋使用者既有變更；遇到不屬於本次任務的變更，要保持原樣。
- 每個 commit 只包含一個清楚功能、修正、重構或文件目的。
- 若檔案同時包含多個功能的變更，使用 patch staging 分批納入，必要時先向使用者說明風險。
- commit 前確認 staged diff；commit 後確認 log；push 前確認目標遠端與分支。
- push 前必須提供最後檢查資訊給使用者，包含即將推送的 commit、目標遠端與分支、驗證結果與未處理變更；取得使用者明確確認後才能執行 `git push`。

## 執行流程

### 1. 讀取狀態

執行並摘要結果：

```bash
git status --short --branch
git branch --show-current
git remote -v
git log --oneline --decorate -5
```

若目前分支沒有 upstream，先詢問使用者要推到哪個遠端分支；不要自行猜測新分支目的地。

### 2. 檢查變更內容

依序檢查：

```bash
git diff --name-status
git diff --stat
git diff --cached --name-status
```

必要時針對特定檔案讀取 diff：

```bash
git diff -- path/to/file
git diff --cached -- path/to/file
```

判斷每個變更屬於哪個功能範圍，並把相關程式碼、型別、文件、設定檔放進同一組。

### 3. 規劃 commit 分組

用簡短清單列出預計分組，例如：

- `feat(task): 新增任務提醒設定`：包含提醒設定 UI、store 欄位與文件更新。
- `fix(router): 修正登入後導向`：包含 router guard 與相關型別調整。
- `docs(agents): 更新專案規範`：只包含文件與 skill 規則。

分組規則：

- 使用者可理解的功能單位優先於檔案類型。
- 相關規格、TSDoc、型別更新要跟對應功能放在一起。
- 純格式化或套件鎖定若與功能無直接關係，獨立 commit。
- `.mission` 任務紀錄若是本次執行產生，通常獨立為 `docs` 或 `chore`，除非專案慣例要求不要提交。

### 4. 分批 staging 與 commit

每一組 commit 都要執行：

```bash
git add path/to/file
git diff --cached --name-status
git diff --cached --stat
git commit -m "type(scope): 摘要"
```

若只要納入檔案的一部分，使用：

```bash
git add -p path/to/file
```

commit 訊息必須使用以下格式：

```text
<type>(<scope>): <content>
```

欄位規則：

- `<type>`：必要欄位，代表 commit 類型。
- `<scope>`：可選欄位，代表 commit 影響範圍，例如資料庫、控制層、模板層、元件、路由、文件或 skill 名稱；若無明確範圍可省略括號，格式改為 `<type>: <content>`。
- `<content>`：必要欄位，簡短描述本次變動內容；使用繁體中文短句，描述使用者可理解的改動目的。

`<type>` 僅能使用以下類別：

- `feat`：新增、修改、刪除功能。
- `fix`：修復錯誤。
- `docs`：註解或文件。
- `style`：不影響程式碼運行的格式變動，例如空白、格式或缺少分號。
- `refactor`：重構，且不是新增功能或修補 bug 的程式碼變動。
- `perf`：改善效能。
- `test`：增加測試。
- `build`：影響建構系統或外部依賴的更改，例如 gulp、broccoli、npm。
- `chore`：雜務處理，其他不會修改 src 或測試文件的更改。
- `revert`：撤銷回覆先前的 commit。

範例：

- `feat(task): 新增任務提醒設定`
- `fix(router): 修正登入後導向`
- `docs(agents): 更新 commit push 規則`
- `chore(mission): 更新任務執行紀錄`

### 5. 驗證

依專案性質選擇必要驗證；若專案有明確規範，優先遵守專案規範。

常見驗證：

```bash
npm run build
npm run lint
```

若使用者明確要求不要測試或專案規範禁止新增測試，不要額外新增測試。驗證失敗時先停止 push，摘要失敗原因與已建立 commit 狀態，讓使用者決定是否修正或仍要推送。

### 6. Push

push 前確認：

```bash
git status --short --branch
git log --oneline --decorate -5
```

實際 push 前必須先停止並請使用者做最後檢查，提供以下資訊：

- 即將推送的遠端與分支。
- 即將推送的 commit 清單，包含短 hash 與完整 commit 訊息。
- 已執行的驗證命令與結果。
- 仍未處理或刻意保留的工作樹變更。
- 明確詢問使用者是否確認執行 push。

只有在使用者明確確認後，才能繼續執行 push。

若分支已有 upstream：

```bash
git push
```

若使用者已指定遠端與分支：

```bash
git push origin branch-name
```

push 完成後，再執行：

```bash
git status --short --branch
```

確認本地與遠端同步狀態。

## 回報格式

最終回覆要包含：

- 建立了哪些 commit：列出短 hash 與 commit 訊息。
- push 目標：列出遠端與分支。
- 驗證結果：列出執行過的命令與結果。
- 未處理項目：若仍有未 staged、未 commit 或使用者原有變更，明確列出。

範例：

```md
已依功能建立 2 筆 commit 並 push 到 `origin/master`。

- `abc1234 feat: 新增任務提醒設定`
- `def5678 docs: 更新任務表單規格`

驗證：`npm run build` 通過。
未處理項目：保留使用者原本的 `.env.local` 變更，未納入 commit。
```
