# What's New

This directory contains release notes for Dispatcher versions.

## Purpose

The What's New documentation provides:
- **Version history** — Chronological record of all releases
- **Feature announcements** — New capabilities added in each version
- **Breaking changes** — Important changes that require user action
- **Bug fixes** — Issues resolved in each release
- **Migration guides** — Instructions for upgrading between versions

## File Naming Convention

Release notes follow the naming pattern: `vX.Y.Z.md`

- **Format:** `v` prefix + semantic version + `.md` extension
- **Examples:**
  - `v0.1.0.md` — Initial release (0.1.0)
  - `v0.2.0.md` — Minor version with new features (0.2.0)
  - `v0.2.1.md` — Patch version with bug fixes (0.2.1)
  - `v1.0.0.md` — Major version (1.0.0)

### Version Number Format

Dispatcher follows [Semantic Versioning](https://semver.org/):
- **MAJOR.MINOR.PATCH** (e.g., 1.2.3)
- **MAJOR:** Breaking changes or incompatible API changes
- **MINOR:** New features in a backwards-compatible manner
- **PATCH:** Backwards-compatible bug fixes

## Markdown Structure Template

Each release note file should follow this standard structure:

```markdown
# Version X.Y.Z

**Release Date:** [Month Year]

## Overview

[Brief description of the release - 1-2 sentences]

## Features

### [Feature Category 1]
- **[Feature name]** — Description of the feature
- **[Feature name]** — Description of the feature

### [Feature Category 2]
- **[Feature name]** — Description of the feature

## Improvements

- **[Area]:** Description of the improvement
- **[Area]:** Description of the improvement

## Bug Fixes

- **[Component]:** Description of the bug fix
- **[Component]:** Description of the bug fix

## Breaking Changes

⚠️ **Action Required**

- **[Change description]** — Migration instructions
- **[Change description]** — Migration instructions

## Deprecations

- **[Deprecated feature]** — Replacement or timeline for removal

## Security

- **[Security fix description]** — CVE numbers if applicable

## Technical Details

### [Subsection if needed]
- Technical implementation notes
- Performance improvements
- Dependency updates

## Known Issues

- Description of known issues and workarounds

## Migration Notes

Step-by-step instructions for upgrading from previous version.

## Documentation

Links to relevant documentation:
- [Documentation section](link)
- [Guide](link)

## Contributors

List of contributors for this release.

---

*Released under the Dispatcher project. All rights reserved.*
```

## Standard Sections

### Required Sections
- **Version header** (H1) — `# Version X.Y.Z`
- **Release Date** — Bold with month and year
- **Overview** — Brief release summary

### Optional Sections (use as needed)
- **Features** — New capabilities added
- **Improvements** — Enhancements to existing features
- **Bug Fixes** — Issues resolved
- **Breaking Changes** — Changes requiring user action
- **Deprecations** — Features being phased out
- **Security** — Security-related fixes or updates
- **Technical Details** — Implementation notes
- **Known Issues** — Documented limitations
- **Migration Notes** — Upgrade instructions
- **Documentation** — Links to relevant docs
- **Contributors** — People who contributed

## Writing Guidelines

### Clarity
- Use clear, concise language
- Write for both technical and non-technical audiences
- Explain the benefit, not just the change

### Formatting
- Use **bold** for emphasis on feature names and components
- Use bullet points for lists
- Use code blocks for technical examples
- Use emoji sparingly (⚠️ for breaking changes is acceptable)

### Links
- Link to relevant documentation
- Link to related issues or pull requests when applicable
- Use relative paths for internal documentation

### Categories
Group related changes together under meaningful headings:
- Features by functional area (e.g., "AI Integration", "API Improvements")
- Bug fixes by component
- Breaking changes prominently marked

## Version Source of Truth

The application version is always defined in `package.json` at the repository root:
```json
{
  "version": "0.2.0"
}
```

Release notes MUST match the version in `package.json`. See `docs/CONVENTIONS.md` for full versioning details.

## Available Versions

- [v0.3.0](v0.3.0.md) — Quality gates, compliance namespace, dependency graph, scaffold hints (March 2026)
- [v0.2.0](v0.2.0.md) — Reliability & Activity Dashboard update (February 2026)
- [v0.1.0](v0.1.0.md) — Initial release (February 2026)

---

*Last updated: March 2026 (v0.3.0)*
*Maintained by: Dispatcher Engineering Team*
