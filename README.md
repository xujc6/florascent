# florr.io 单机复刻版（增强）

一个 florr.io 风格的花瓣生存网页游戏，纯前端、无需后端、无需构建。

## 已做的增强

- **进度存档**：`localStorage` 自动保存（每 15s + 关页/切后台），刷新不丢；菜单右下角 `New Game` 清档重开。
- **全区域选择**：菜单按 `regions.js` 动态生成全部 10 个区域。
- **战斗反馈**：受击屏震 + 右上角击杀提示（kill feed）。
- **界面精修**：击杀提示卡片、区域按钮自适应网格等。

## 本地运行

```bash
cd game_repo
python3 -m http.server 8000
# 浏览器打开 http://localhost:8000
```

或直接双击 `index.html`（已内嵌素材，支持 file:// 打开）。

## 部署（自动上线）

推送到 Git 仓库后，在 Vercel / Netlify 导入该仓库即可，push 自动部署：

- Vercel：本仓库已含 `vercel.json`（静态，`outputDirectory: "."`）。
- Netlify：本仓库已含 `netlify.toml`（`publish = "."`）。

导入后每次 `git push` 都会自动重新上线，链接不变。

## 目录结构

```
game/
├─ index.html        # 主菜单 / HUD / 各面板
├─ game.js           # 主逻辑（渲染 + 玩法 + 存档）
├─ regions.js        # 区域定义（10 个）
├─ petals.js         # 花瓣定义
├─ talents.js        # 天赋
├─ zones.js          # 地图分区
├─ mobmask/mobtext/mobver/cardfiles  # 怪物和卡片文本/掩码
├─ assets/           # 花瓣/怪物素材图
├─ assets_inline.js  # 内嵌素材（支持 file:// 直接打开）
└─ tools/            # 构建/校验脚本（开发用）
```
