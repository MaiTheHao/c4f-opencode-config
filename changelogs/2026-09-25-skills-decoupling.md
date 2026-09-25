# Changelog: Skills Decoupling & External Repository Migration

**Date:** 2026-09-25  
**Version:** 2.1.0  
**Scope:** Architecture / Skills Separation

---

## Summary

Migrated general agent workflow skills out of this repository (`c4f-opencode-config`) into a standalone repository: [c4f-agent-skills](https://github.com/MaiTheHao/c4f-agent-skills.git).

Users and developers running OpenCode configurations must now pull skills into `~/.agents/skills` separately.

---

## Breaking Changes

1. **Separation of Skills Directory:**
   - General workflow skills (`brainstorming`, `clean-code`, `writing-plans`, `executing-plans`, `git-commit`, `mermaid`) are no longer bundled in `~/.config/opencode/skills/`.
   - OpenCode agents look for these skills in global/user skill paths (`~/.agents/skills/`).

2. **Required Setup Step:**
   - Any clean installation or update requires cloning the external skills repository:
     - Linux / macOS: `~/.agents/skills`
     - Windows: `%USERPROFILE%\.agents\skills`
     ```bash
     # Linux / macOS
     mkdir -p ~/.agents
     git clone https://github.com/MaiTheHao/c4f-agent-skills.git ~/.agents/skills
     ```

---

## What Was Changed

- **Skills Structure**:
  - Removed duplicate workflow skills from local config to avoid divergence across environments.
  - Retained `skills/opencode-model-routing` locally to handle provider-specific model resolution rules and subagent session reuse logic.
- **Documentation**:
  - Updated [README.md](../README.md) to outline external skills setup, clean up directory structure, and document agent roles.
