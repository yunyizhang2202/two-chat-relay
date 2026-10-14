# Collaboration policy / 协作授权

Updated: 2026-10-14

**Project owner:** [yunyizhang2202](https://github.com/yunyizhang2202)

**Authorized co-developer:** [LegendRain1130](https://github.com/LegendRain1130) (C)

The project owner has expressly delegated **full engineering discretion** over Two-Chat Relay to C, effective when C accepts the repository collaborator invitation and GitHub grants write access.

C may independently:
- Make changes anywhere in the source tree, including core relay logic, the UI, tests, documents, architecture, and build pipeline.
- Work on any existing branch, create new branches, open or merge pull requests, and push directly to `main` where GitHub permits.
- Prioritize, edit, manage, and close project Issues; change technical direction and implement other providers beyond DeepSeek.
- Refactor or replace the existing architecture as appropriate.

**This supersedes earlier project notes or Issue comments that limited C to a specific feature branch or required prior owner review for every change.** Pull requests and reviews remain encouraged for traceability but are not a condition set by the owner.

This document records the owner's working arrangement. **It does not change GitHub access controls by itself.** For a personal GitHub repository, a collaborator invitation normally grants write access after acceptance but does not make the person repository owner or give all administrative rights. If both people later need administrative control of repository settings, ownership changes, organization access roles, or other supported GitHub permissions must be configured separately by the owner.

Recommended practice (not an access restriction): keep v1.0.0 under `release/v1.0.0` for recovery, record significant changes via Git commits/Issues, and avoid publishing secrets or private conversations.
