# 工作序 · 個人工作排程

乾淨的工作排程管理工具。開啟時沒有預載工作、Sprint 或目標；可匯入原「工作序」工具匯出的 JSON 備份。

## 使用

網站：https://novea1113.github.io/workflow_manage_tool/

1. 在原工具中，按左下角 **匯出備份**，取得 JSON 檔案。這會包含該瀏覽器目前的工作、Sprint 與目標。
2. 在公司使用的瀏覽器開啟上方網站，按 **匯入現有備份** 或 **匯入備份**，選擇剛才的 JSON。
3. 確認匯入筆數後，開始使用。匯入會取代目前資料，請先匯出既有資料。

不需要登入 ChatGPT 或 GitHub。網頁首次開啟為空白；不同裝置及瀏覽器各自保存資料。請使用 JSON 備份移轉，CSV 僅供檢視與報表，不支援還原。原本的 Excel 不直接匯入，請先從原工具匯出 JSON。

## 功能

- 新增、修改、刪除工項與新增 Sprint。
- Sprint 點數與容量、工作狀態、日期、JIRA、文件及備註。
- 清單、狀態看板、月曆，搜尋與篩選。
- JSON 備份匯入／匯出、篩選結果 CSV 匯出。
- 顯示備份中的工作目標。

## 資料儲存

使用瀏覽器 localStorage，鍵名為 `work-rhythm-clean-v1`，每次變更即儲存。資料不會傳送至 GitHub，也不會寫入這個 repository。程式沒有外部套件、分析服務、API 或後端請求。

網站程式碼與網址公開，但匯入的工作內容只存在使用中的瀏覽器。清除網站資料、換裝置、換網址或使用無痕模式可能失去資料，請定期匯出 JSON 備份。請勿將工作備份上傳到此公開 repository。

## 部署與本機啟動

純靜態 HTML、CSS、JavaScript，不需安裝套件或建置。

GitHub Pages：Settings → Pages → Build and deployment → Deploy from a branch → `main` / `/ (root)` → Save。

本機開啟：

```sh
python -m http.server 8000
```

瀏覽 http://localhost:8000。也可下載原始碼後直接開啟 `index.html`（部分公司瀏覽器可能限制本機網頁儲存資料）。

## 備份格式

最外層為 `tasks`、`sprints`、`goals` 三個陣列。所有陣列均可為空。匯入會檢查工作狀態、日期與非負點數；支援原工具的同名 Sprint 分段紀錄，概覽會合計這些段落的容量。跨 Sprint 的工作以獨立紀錄保存，不以 JIRA 編號去重。

本 repository 僅含應用程式，沒有 Excel、工作紀錄、備份檔、帳號憑證或原 Sites 的部署識別資訊。
