# 蛇蛇碰头 · 独立部署版

包含单机和2–4人联机。页面、游戏引擎和联机后端都由本服务提供，不请求 chatgpt.site，也不使用它作为代理。运行依赖只有 ws；Playwright Core 仅用于开发测试，不需要下载浏览器。

## 启动

安装 Node.js 24 或更高版本，执行 `npm install`，然后执行 `npm start`，打开 http://127.0.0.1:8788 。

`src/` 是源文件。修改后运行 `npm run build`，同时更新网页服务 `game-worker.js` 和完全独立的 `solo.html`。

## 流畅度优化

逻辑步进与显示刷新解耦，蛇身在格点间按真实时间插值，适应高刷新屏幕，游戏速度不随帧率改变。单机全程本地计算；联机优先使用 /realtime WebSocket 实时状态推送（每50ms检查，位置变化时推送）、本机移动预测和服务器校正，对手通过状态缓冲平滑显示。网络断开时自动重连并回退 HTTP，同步中断时依据往返延迟仅短暂预测600–2000ms，避免蛇无限前进。WebSocket 压缩和状态去重降低流量，HTML与脚本启用gzip。网格和星星缓存为画布图层，计时器和排行榜只在内容改变时更新。

反向代理需要支持 WebSocket Upgrade，保持原来的 Origin 同源校验。`npm test` 验证玩法、输入、插值和2／3／4人长连接；`node tests/browser-qa.mjs` 使用本机已安装的Chrome进行手机视口测试，浏览器路径见脚本。

也可执行 `docker build -t snake-party .`，然后运行 `docker run -p 8788:8788 -v snake-data:/app/data snake-party`。

## 正式部署

将此目录部署到可访问的 Node.js 或 Docker 主机，配置 HTTPS 和你能管理的域名。Node 直接运行时将 HOST 设置为 0.0.0.0；通过可信反向代理时将 TRUST_PROXY 设置为 1。PORT 默认8788，可由部署平台覆盖。DATA_DIR 用于 SQLite 房间数据，默认 ./data；只运行一个实例。GET /health 是健康检查。

PUBLIC_ORIGIN 可设为正式公开 HTTPS 地址，用于代理改写 Host 或协议时保持同源校验；不包含结尾斜杠。微信访问必须通过该正式 HTTPS 地址实测，其他地区或浏览器返回200不能替代微信网络测试。临时隧道不是正式部署；它依赖本机、游戏进程和隧道保持运行，电脑休眠或进程退出会失效。

## 单机文件

solo.html 是独立单机文件，不需要网络。下载后可在支持 HTML 的浏览器打开；微信的文件预览可能不执行 HTML，不能把此文件当作已完成的微信入口。

## 诊断记录

原 chatgpt.site 地址在用户微信中返回 Cloudflare 拦截页；当前 Sites 工具无法管理该父域名的安全策略。本站公开访问配置已经核实，前端代码修改无法修复发生在页面加载之前的该拦截。独立版保留原玩法，用于迁移至用户能管理的托管环境。
