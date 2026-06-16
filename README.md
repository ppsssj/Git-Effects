# Git Effects

Git Effects is a VS Code extension that shows animated character effects for Git
push, pull, commit, and error results.

It opens a lightweight side webview, keeps your editor focused, and lets you
choose both the character model and the animation used for each Git action.

<p align="center">
  <img src="assets/icon.png" alt="Git Effects logo" width="160" />
</p>

## Links

- VS Code Marketplace: https://marketplace.visualstudio.com/items?itemName=ppsssj.git-effects
- GitHub: https://github.com/ppsssj/Git-Effects

## What's New in 0.0.8

- Added configurable action mappings for `push`, `pull`, `commit`, and `error`.
- Added an Action Preview section in the character picker.
- Added per-action Preview buttons so each animation can be tested immediately.
- Added `Git Effects: Preview Action` to preview animations from the Command Palette.
- Improved the character picker layout so action settings are easier to scan.

## Features

- Animated Git result panel for push, pull, commit, and error events.
- Character picker powered by models in `media/models`.
- Character filters for All, Male, and Female.
- Configurable animation per Git action:
  - Push
  - Pull
  - Commit
  - Error
- Built-in preview for each animation before using it.
- Auto-detect mode for successful push, pull, and commit state changes.
- Accurate command mode for push, pull, and commit, including failure details.

## Available Actions

The following animations can be assigned to Git events:

- Pop
- Jump + Spin
- Nod
- Shake No
- Slide

Default mappings:

| Git result | Default animation |
| --- | --- |
| Push | Jump + Spin |
| Pull | Pop |
| Commit | Nod |
| Error | Shake No |

## Commands

Open the Command Palette and run:

| Command | Description |
| --- | --- |
| `Git Effects: Manual Effect` | Show a manual test effect. |
| `Git Effects: Push (accurate mode)` | Run `git push` and show success or failure. |
| `Git Effects: Pull (accurate mode)` | Run `git pull` and show success or failure. |
| `Git Effects: Commit (accurate mode)` | Run `git commit -m` and show success or failure. |
| `Git Effects: Select Character` | Choose a character and configure action animations. |
| `Git Effects: Preview Action` | Preview one animation directly from the Command Palette. |

## Character and Action Setup

Run `Git Effects: Select Character`.

The screen contains:

- Action Preview: choose the animation for push, pull, commit, and error.
- Preview buttons: test each animation immediately.
- Character Library: search, filter, and select the character model.

Changes are saved automatically.

## Settings

| Setting | Default | Description |
| --- | --- | --- |
| `gitEffects.enabled` | `true` | Enable or disable Git Effects. |
| `gitEffects.cooldownMs` | `1200` | Minimum delay between effects. |
| `gitEffects.durationMs` | `2200` | Auto-close delay for the effect panel. |
| `gitEffects.autoPush` | `true` | Auto-detect push success. |
| `gitEffects.autoPull` | `true` | Auto-detect pull success. |
| `gitEffects.autoCommit` | `true` | Auto-detect commit completion. |
| `gitEffects.debounceMs` | `1200` | Debounce interval for auto-detect updates. |

## Model Folder Format

Character models are loaded from:

```text
media/models/<character-id>/
  model.obj
  model.mtl
  model.png
  Textures/
```

`model.png` is used as the character preview thumbnail.

## Development

```bash
npm install
npm run compile
```

Open the project in VS Code and press `F5` to launch the Extension Development
Host.

Useful commands:

```bash
npm run compile
npm run lint
npm run test
```

## Release Notes

### 0.0.8

- Added user-configurable Git action animations.
- Added action preview UI and preview command.
- Improved the character/action picker layout.

### 0.0.7

- Improved character picker activation and selected character refresh behavior.

### 0.0.5

- Added character filters and expanded character picker support.

### 0.0.4

- Added the `Git Effects: Select Character` command.
- Added model thumbnail previews.

### 0.0.3

- Improved auto-detect behavior with debounced repository state changes.

### 0.0.1

- First public release.
