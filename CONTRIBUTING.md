# Contributing / 贡献指南

Thanks for helping! / 欢迎贡献。

1. Discuss bug reports and new providers in GitHub Issues first. / 优先在 Issue 里讨论问题。
2. Keep v1.0.0 as the stable ChatGPT-only baseline. Implement new providers on feature branches. / 跨平台新功能放独立分支。
3. Never include account cookies, access tokens, exported conversations, screenshots with personal information, or real chat contents in issues/commits. / 不上传 Cookie、密钥、私人聊天记录或带个人信息的截图。
4. Prefer site-specific DOM adapters over broad host permissions or direct interception of authenticated network traffic. / 优先最小权限的网页适配，不截获认证网络流量。
5. Verify that user content is not silently truncated or sent twice; unknown outcomes must pause. / 不允许静默截断、重复发送。
6. Run `node --test tests/test-*.cjs`, document tested versions and limitations, and add a small reproducible test for each fix.

**Note:** Each service may have different terms for web automation. The repository is a technical experiment, not an endorsement of any particular deployment.