# 宣传片制作说明（tools/）

这套工具把插件界面渲染成可逐帧控制的画面，再编码成带字幕的产品视频。
**没有用录屏**：录屏会引入压缩噪点，而这块画面全是 1px 细线与 4px 微字。

## 流程

```
scene.html (真实组件)
   ↓ tools/capture.mjs      CDP 连浏览器，调用场景的 __hfStep(ms) 冻结 rAF 并手动推进
   ↓                        每推进 16.7ms 截一帧 PNG（1080p）
   ↓ PIL                    PNG → JPEG（顺带处理奇数高度）
   ↓ tools/build_promo*.py  PIL 生成字卡/特写帧 → ffmpeg 编码分段 → concat → drawtext 烧字幕
   ↓ footage/promo-vN.mp4
```

## 关键约束（都是踩出来的）

1. **`node --check client.js` 检查不到 `scene.html` 里的内联脚本**——改场景必须把 `<script>` 抽出来单独 `node --check`。
2. **ffmpeg 要求宽高为偶数**，1568×757 会直接失败；统一 `scale=trunc(iw/2)*2:trunc(ih/2)*2` 或铺满 1920×1080。
3. **PowerShell 里 `$args` 是自动变量**，赋值被忽略；函数参数变量必须换名（`$ffArgs`）。
4. **Python `subprocess` 不接受 int 参数**：`"-r", 30` 必须写成 `"-r", "30"`。
5. **`ctx.webServer.register` 的路由不会随插件重载释放**，所以路由名带版本（`usage-v2`）。
6. **捕获要一次启动浏览器连续截多帧**：每次重启约 4.6 秒/帧且首帧常是空白，不可用。

## 脚本一览

| 文件 | 作用 |
|---|---|
| `capture.mjs` | CDP 逐帧捕获（一次启动，连续采样） |
| `build_promo.py` | v1：字卡 + 特写 + 五段拼接 + 字幕 |
| `build_promo2.py` | v2：加扫描线开场、架构三卡 |
| `build_v4.py` / `build_v6.py` | 追加交互/安装卡、替换真实抽屉画面 |
| `build_v5.py` | 修 mock 矩阵数据（时间衰减）并重捕矩阵段 |
| `build_v7.py` | 加 6 秒全景巡视，最终 39 秒 |
| `resub.py` | 只重烧字幕（不重编码分段） |

## 产物

`footage/`（已 gitignore，653 MB）：`promo-v5.mp4` 为当前成片（39s / 1080p / 13 条字幕 / 无配音）。
`footage/cap-run|cap-tool|cap-idle|cap-drawer|cap-mx` 为各状态原始帧。

## 尚未完成

- **真实 GUI 画面**：插件运行在 DSH 桌面窗口里，走 `dsh-app://` 私有协议，HTTP 端 token 为进程级且日志中被打码，脚本无法访问。片中所有画面是**同一份组件代码 + 脚本化数据**在本地工装里渲染的，不是用户屏幕的录像。
- **Remotion 工程**：用 ffmpeg + PIL 达到同等确定性，未搭 Remotion（若要可视化调参台可另行补）。
- 无 BGM：留给后期统一配音配乐。
