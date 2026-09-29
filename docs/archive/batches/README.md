# FK Batches

Batch 是一次可獨立執行、驗收與交接的最小工作單位。只有實際要開始工作時才建立一份 Batch；不要預建空檔案或狀態機。

執行前先讀專案 `AGENTS.md`。同一時間原則上只維持一個 Active Batch，並在 `progress.md` 記錄它；完成後把必要結果留在該 Batch 的 Result / Handoff。

需要修改 repository 的 Batch，原則上一個 Batch 對應一條 Branch；Batch 完成並合併後，該 Branch 即結束任務。純研究、討論或分析型 Batch 不強制建立 Branch。

**一個 Batch，一條 Branch。**

## 最小格式

```md
# Batch：<名稱>

## Goal
這次要交付的單一結果。

## Why
為什麼現在需要做。

## Scope
- 會讀取／修改的範圍
- 明確不在本 Batch 內的內容

## Must Not Break
- 必須保持的 production 行為與資料邊界
- 需要保護的 scope、資料與相容性

## Done When
- 可直接驗收的完成條件
- 最小必要檢查

## Suggested Executor
大腦＋工作環境，以及適合原因。

## Result / Handoff
- 實際完成內容與驗證結果
- 未完成事項、風險與下一步
- 下一位執行者只需讀取的相關檔案
```

若工作中發現必須跨越原定資料邊界，先停止擴張，在 Batch 補上影響範圍並取得確認；不要把新範圍默默塞進同一批。
