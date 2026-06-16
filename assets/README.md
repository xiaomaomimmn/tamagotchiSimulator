# 资源说明（V2）

V2 不再使用文件系统资源 —— 所有用户绘制的像素图（身体 / 染色蒙版 / 面部 / 面部位置）
存在**浏览器 IndexedDB**（`tamagotchi-art` 数据库，object store `art`）。

## 怎么备份 / 恢复

目前没有内置的导出/导入功能。如需手动备份，浏览器开发者工具 → Application → IndexedDB
→ `tamagotchi-art` → `art` → 复制所有 key/value 即可。

清空所有数据 → 同位置删除该数据库，刷新页面，所有图回到「未绘 + fallback」状态。

## 数据形状

| key 前缀 | 内容 |
|---|---|
| `face:fc_NN` | 32×32 颜色矩阵（JSON，每格 hex 字符串或 null） |
| `face:fc_NN:png` | PNG data URL（渲染用快照） |
| `body:sp_XNN` | 物种身体的 32×32 颜色矩阵 |
| `body:sp_XNN:png` | PNG data URL |
| `mask:sp_XNN` | 染色蒙版的 32×32 颜色矩阵（不透明像素 = 被体色覆盖） |
| `facepos:sp_XNN` | `{ x, y }` 像素偏移 |
