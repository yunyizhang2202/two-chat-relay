# Security and privacy

This extension is experimental. It runs in the local browser and can read and submit messages in the selected chat tabs. As with any extension that has page access, install only code you trust.

- v1.0.0 requests `tabs`, `storage`, `alarms` and host access only to `https://chatgpt.com/*`.
- No embedded third-party API key, remote configuration, analytics, or external transfer endpoint.
- Local browser state may contain selected tab IDs, settings, and minimal relay state; do not publish your local Chrome profile.
- Never post unredacted chat transcripts, authentication cookies, debugging HAR files, or secrets in public Issues.
- When sending cannot be verified, the extension is designed to stop instead of blindly retrying.
- Site interfaces and privacy behavior may change. Users are responsible for checking the applicable website terms before any automated use.

Report suspected vulnerabilities privately to the repository maintainer through GitHub's available reporting method rather than filing an Issue containing secrets.