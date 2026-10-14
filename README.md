# Two-Chat Relay / AI 对话接力

> **Repository migration in progress:** Core extension scripts have not yet been uploaded. Please use the complete source package until the remaining files are synced. The installed extension will not work from this partial repository snapshot.

**A local Chrome extension that relays messages between two selected ChatGPT tabs. No API key required.**  
**一个免费的 Chrome 扩展，让两个已打开的 ChatGPT 聊天标签页自动轮流交流，无须模型 API Key。**



> **v1.0.0 — ChatGPT-only baseline / ChatGPT 基线版**  
> Multi-provider support (e.g. DeepSeek) is **research only**, not implemented in v1.0.0.  
> DeepSeek 等平台仍处于研究阶段，**此版本尚不支持**。

## Features / 功能

- Select two existing ChatGPT conversations (A ↔ B) / 指定两个已有对话
- Manual, autonomous, or topic- and language-neutral opening / 人工或 AI 自由开场
- 10 / 100 / 1000 / unlimited relays, plus custom counts / 自定义次数与不限次数
- Optional length strategies: unrestricted, gently concise, or pause-on-limit / 可选长度策略
- Stops on uncertain delivery rather than blindly retrying / 不确定发送结果时安全暂停
- No third-party server, API key, analytics, or automatic export / 无第三方中转服务器、模型 API 密钥或遥测
- Chrome Manifest V3; accessible local test pages / MV3 扩展及本地模拟页

**Limitations / 注意：** Browser tabs can freeze or discard in the background; the target website may change its DOM and break the extension. A working simulated test does not guarantee long-term reliability. It is not an OpenAI product. Automatic extraction of ChatGPT output can conflict with OpenAI's applicable terms of use: review those terms before using this experimental tool. 浏览器后台冻结、站点改版和服务条款均可能影响使用。

## Install / 安装

1. Download this repository as ZIP (Code → Download ZIP) and unzip it / 下载源码压缩包并解压。
2. Go to `chrome://extensions` / 打开 Chrome 扩展管理页。
3. Enable **Developer mode** and click **Load unpacked** / 启用开发者模式，点击“加载已解压的扩展程序”。
4. Select the directory containing `manifest.json` / 选择包含 `manifest.json` 的文件夹。
5. Open two `https://chatgpt.com/c/...` conversations and complete at least one exchange in each / 打开两个已建立的 ChatGPT 对话，各完成至少一轮问答。
6. Refresh both ChatGPT tabs and open the extension popup / 刷新两个网页，打开扩展图标。
7. Choose A/B, a start mode and count, then **Start** / 选择两个对话、启动模式和次数，开始聊天。

**Important:** Avoid running multiple versions of the extension at the same time. Do not use important or sensitive conversations for experiments. / 不要同时运行多个版本；初次测试请使用无敏感内容的对话。

## Design / 架构

```text
popup.js + popup.html + style.css    controls / UI
             |
background.js                       run state + A/B relay / 调度
             |
relay_core.js + content.js          DOM detection, send verification / 页面适配与校验
             |
chatgpt.com                         existing conversations / 已有对话
```

All communication currently stays between explicitly selected tabs. `manifest.json` grants access only to `https://chatgpt.com/*`. / 当前仅申请 ChatGPT 网站权限，消息只在所选标签页之间传递。

## Tests / 测试

With Node.js installed:

```bash
node --test tests/test-*.cjs
```

The release is based on v0.13 UI with **unchanged relay engine** (`background.js`, `content.js`, `relay_core.js`). v1.0.0 changes only the version labels and project packaging. Core logical regression tests: **63 passed** in the packaging environment; real-world compatibility remains dependent on the current ChatGPT page. / v1.0.0 冻结已验证的 v0.13 核心，只更改版本标识与仓库结构；逻辑回归测试 63 项通过。

## Roadmap / 下一步

- [ ] Modular provider adapters while preserving v1.0 as the baseline / 模块化平台适配层
- [ ] Read-only DeepSeek page probe / DeepSeek 只读结构诊断
- [ ] ChatGPT ↔ DeepSeek bidirectional relay tests / 双向中转
- [ ] DeepSeek long-form Markdown / math verification / 长文本与公式核验
- [ ] Minimized/background Chrome stability tests / 后台最小化稳定性测试

See [DeepSeek research](docs/research/deepseek-adapter.md), [development log](docs/DEVELOPMENT_LOG.md), and [contributing guide](CONTRIBUTING.md).

## License / 许可证

MIT License, © 2026 yunyizhang2202. See [LICENSE](LICENSE).