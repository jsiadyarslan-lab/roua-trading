---
Task ID: 1
Agent: Main Agent
Task: Fix candles disappearing when switching trading pairs (Bug #2)

Work Log:
- Reverted broken commit 191444e5 ("FIX: Candles disappearing when switching trading pairs — sustainable fix")
- Deep analysis of data flow when symbol changes in useChart.ts and RouaChart.tsx
- Used Explore subagent for comprehensive code trace
- Identified root cause: savedVisibleRangeRef.current was being set by restoreChartState() with a saved zoom range from a previous session, which caused resetView() to apply a narrow visible range instead of fitContent()
- Applied ONE minimal fix: removed the line that sets savedVisibleRangeRef.current = saved.visibleRange in restoreChartState()
- This ensures resetView() always uses fitContent() to show all candles, which is the expected default behavior
- Build succeeded, commit pushed to origin/main

Stage Summary:
- Root cause: savedVisibleRangeRef applied narrow zoom from previous session on pair switch
- Fix: Removed savedVisibleRangeRef restoration in restoreChartState (one-line change)
- Result: resetView() always calls fitContent() which shows all candles correctly
- Commit: 24a01c07 "FIX: Remove savedVisibleRangeRef restoration — root cause of candles disappearing on pair switch"
