# CLAUDE.md

> Claude Code 工作规范 — 修改前必读

## 项目定位

微信小游戏塔防肉鸽 MVP。Cocos Creator 3.8 + TypeScript。**所有视觉元素为彩色矩形，无美术资源。** 目标是快速验证玩法，不是写"好代码"。

## 第一原则

1. **一键运行** — 场景中无需手动挂载任何脚本或预制体。`GameBootstrap.ts` 自动挂载到 Canvas，运行时创建一切
2. **不用 Prefab** — 所有节点通过 `box()` 函数程序化创建
3. **不许大重构** — 改功能就改功能，不要顺手"优化架构"。不要引入 ECS、状态管理库、事件总线等新框架
4. **MVP 优先** — 能跑就行，先验证玩法再考虑代码质量
5. **改之前先读文件** — 不要假设代码结构，先 Read 确认再动手

## 运行方式

没有 CLI 构建/测试命令。全部在 **Cocos Creator 3.8 编辑器** 中操作：

1. 编辑器打开项目
2. 打开 `assets/Battle.scene`（或任意空场景）
3. 按 Play — GameBootstrap 自动挂载，无需手动配置
4. 改完代码切回编辑器自动编译，再按 Play 测试

## 当前架构

### 文件清单

```
assets/scripts/
├── GameBootstrap.ts    ← 唯一入口，游戏循环 + 全部状态 + 创建所有节点
├── Tower.ts            ← 炮塔组件：自动索敌 + 通过回调发射子弹
├── Enemy.ts            ← 敌人组件：向下移动 + 受伤 + 死亡/逃脱回调
├── Bullet.ts           ← 子弹组件：追踪目标 + 命中造成伤害
└── ScreenConstants.ts  ← 屏幕常量：SCREEN_WIDTH=720, SCREEN_HEIGHT=1280, HALF_WIDTH=360, HALF_HEIGHT=640
```

**没有其他文件需要关注。** 不要创建新目录层级（core/、battle/、ui/ 等）。

### 核心模式

| 模式 | 做法 | 不要 |
|------|------|------|
| 节点创建 | `box(name, w, h, color)` + `addChild` | 不用 Prefab / instantiate / 预制场景节点 |
| 组件通信 | 回调注入（`tw.enemies = this.enemies`） | 不用 `getComponent()` / 场景层级查找 / Cocos 事件系统 |
| 状态管理 | 全部在 GameBootstrap 私有字段 | 不用全局 Store / Redux / 事件总线 |
| 暂停控制 | `GameBootstrap.gamePaused` 静态标志 | 不用 `director.pause()` |
| 触摸交互 | 节点级 `Node.EventType.TOUCH_END` + `UITransform` | 不用全局 `input.on` 手动算坐标 |
| 屏幕边界 | 引用 `ScreenConstants.ts` 的 `HALF_WIDTH` / `HALF_HEIGHT` | 不要写死 360 / 640 / 720 / 1280 |

### 数据流

```
GameBootstrap
  ├── 注入 → Tower.enemies, Tower.createBullet, Tower.getDamageBonus, Tower.getSpeedBonus
  ├── 注入 → Enemy.onDeath, Enemy.onEscape, Enemy.hpBar
  ├── 创建 → Bullet（通过 spawnBullet），注入 target + damage
  └── 敌人数组 this.enemies[] 被所有 Tower 共享引用
```

组件之间**不直接互相引用**，全部通过 GameBootstrap 中转。

## 当前游戏系统

### 双塔

| | 左塔（金色） | 右塔（绿色） |
|--|-------------|-------------|
| 伤害 | 50 | 15 |
| 攻速间隔 | 0.6s | 0.25s |
| 攻击区域 | 全屏矩形 | 全屏矩形 |
| 子弹 | 绿色 8×8 方块 | 绿色 8×8 方块 |
| 初始状态 | 默认可用 | 隐藏，升级三选一中"安装右塔"后激活 |

左塔开局即用。右塔需要在升级面板中选择"安装右塔"（花费 25 金币）才会出现。安装前右塔节点 `active=false`，不渲染、不攻击。安装后右塔专属升级选项才加入选项池。

### 敌人类型

| 类型 | 解锁波次 | 特征 | 颜色 |
|------|---------|------|------|
| 普通 | 第1波 | 基础属性 | 红色 24×24 |
| 快速 | 第2波 | 血量×0.5，速度×1.8 | 橙红 18×18 |
| 坦克 | 第4波 | 血量×2.5，速度×0.5 | 深红 32×32 |
| 分裂 | 第6波 | 死亡分裂为2个小怪 | 棕色 28×28 |

敌人血量 = 80 + 波次×30，速度 = 60 + 波次×8。出怪间隔随波次递减，最低 0.4s。

### 升级系统

- 击杀获得金币(+10) 和经验(+15)
- 经验达标自动升级，弹出三选一面板（暂停游戏）
- 6 个选项池，Fisher-Yates 洗牌取 3 个：
  - 左塔伤害+10、左塔攻速+0.1、左塔伤害+8
  - 右塔未安装时：出现"安装右塔"选项（25 金币）
  - 右塔已安装后：出现右塔伤害+5、右塔攻速+0.15、右塔攻速+0.08
- 花费 25 金币，金币不足时按钮灰化，点遮罩跳过

### 游戏结束

- 5 条命，漏怪扣 1 条
- 生命归零 → `gamePaused=true` + `gameOver=true`，弹出结算面板
- 点击"重新开始" → `director.loadScene('Battle')`

## 代码风格

- TypeScript，`@ccclass` 装饰器
- 私有字段用 `private`，需要外部注入的用公共字段
- 私有方法用 `private` + 前缀（如 `_atkTimer`）
- 不写注释除非逻辑不直观
- 不写 docstring / JSDoc
- 用 `const` 而非 `let`（除非需要重新赋值）
- 矩形用 `{ minX, maxX, minY, maxY }` 对象表示

## AI 修改规则

### 可以做的

- 修改现有文件中的逻辑
- 在现有文件中添加新方法/字段
- 在 `assets/scripts/` 下新建单个 `.ts` 文件（如新敌人组件）
- 修改 `ScreenConstants.ts` 中的数值

### 禁止做的

- 不要创建 `core/`、`battle/`、`ui/`、`data/` 等子目录
- 不要引入事件总线、ECS 框架、状态管理模式
- 不要把 GameBootstrap 拆分成多个管理器
- 不要用 `getComponent()` 查找组件
- 不要用 Cocos 事件系统（`node.emit` / `node.on` 用于自定义事件）
- 不要用 `director.pause()` 控制暂停
- 不要创建 Prefab 或修改 `.scene` 文件的节点树
- 不要在屏幕边界写死数字，用 `HALF_WIDTH` / `HALF_HEIGHT`
- 不要"顺手"重构已有代码

### 修改流程

1. 先 Read 目标文件，确认当前结构
2. 最小化改动 — 只改需要改的部分
3. 保持 `GameBootstrap.ts` 单文件入口结构
4. 确保改完能一键运行

## 后续开发优先级

按顺序推进，每个阶段完成后可运行测试：

| 优先级 | 内容 | 说明 |
|--------|------|------|
| P0 | 肉鸽随机事件 | 波次间 3 选 1 事件，初步 Roguelike 体验 |
| P0 | 第三种炮塔 | 增加塔的种类，丰富 Build 组合 |
| P1 | 英雄系统 | 底部主角 + 主动技能释放 |
| P1 | 死亡动画 / 金币飘字 | 提升打击感 |
| P1 | 遗物系统 | 被动装备，整局生效 |
| P2 | 多章节关卡 | 不同敌人主题 + Boss |
| P2 | 美术资源替换 | 将矩形替换为实际素材 |
| P2 | 微信小游戏适配 | 包体优化、登录、广告 |

## 平台备注

- 目标平台：微信小游戏
- 设计分辨率：720×1280 竖屏
- 引擎：Cocos Creator 3.8
- 语言：TypeScript
- 无后端服务（MVP 阶段纯前端）
