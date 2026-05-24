# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Cocos Creator 3D tower defense game (MVP stage). Created with Cocos Creator 3.8.8. All visuals are colored rectangles — no art assets yet.

## How to Run

There are no CLI build/test commands. All development happens in the **Cocos Creator Editor**:

1. Open Cocos Creator 3.8 Editor
2. Open project at this directory
3. Open `assets/Battle.scene` (or create empty scene)
4. Create empty node → attach `GameBootstrap.ts` → press Play ▶

## Architecture

### Entry Point

`GameBootstrap.ts` is the **single entry point**. It programmatically creates all game objects (background, tower, UI, enemies, bullets) — nothing is pre-placed in the scene. This means:
- All game state (gold, exp, level, wave, lives) lives in GameBootstrap
- All game objects are created via `box()` helper (colored Sprite nodes)
- Tower, enemies, and bullets receive injected callbacks/references from GameBootstrap

### Component Responsibilities

- **GameBootstrap.ts** — Game loop, wave spawning, level-up logic, UI refresh, creates all nodes
- **Tower.ts** — Auto-targets nearest enemy within range, fires via injected `createBullet` callback. Receives stat bonuses as injected functions
- **Enemy.ts** — Moves left each frame. `onDeath`/`onEscape` callbacks injected by GameBootstrap handle rewards and life loss
- **Bullet.ts** — Homes toward target enemy, deals damage on contact (distance < 10px)

### Key Patterns

- **Dependency injection over scene references**: Components receive references via function injection (`tw.enemies = this.enemies`, `tw.createBullet = ...`) rather than using `this.getComponent()` or scene hierarchy lookups
- **Programmatic node creation**: `box(name, w, h, color)` creates a colored Sprite node. Scale is used as visual size (not actual node scale in the traditional sense)
- **Callback-based events**: Enemy death/escape are callback functions set by GameBootstrap, not Cocos event system

## File Structure

```
assets/
├── scripts/
│   ├── GameBootstrap.ts   ← sole entry point, game loop + state
│   ├── Enemy.ts           ← enemy movement + damage
│   ├── Tower.ts           ← auto-targeting + shooting
│   └── Bullet.ts          ← projectile homing + hit detection
├── Battle.scene
└── scene.scene
```

## Known Next Steps (from README_MVP.md)

- Upgrade selection UI (three-choice popup replacing auto-level)
- Multiple enemy types
- Second tower + build system
- Death animations / gold popups
- Roguelike random events
