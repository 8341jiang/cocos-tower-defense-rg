import {
    _decorator, Component, Node, Label, Color,
    director, Director, Graphics, UITransform
} from 'cc';
import { Enemy } from './Enemy';
import { Tower } from './Tower';
import { Bullet } from './Bullet';
import { SCREEN_WIDTH, SCREEN_HEIGHT, HALF_WIDTH, HALF_HEIGHT } from './ScreenConstants';
const { ccclass } = _decorator;

/** 升级选项 */
interface UpgradeOption {
    label: string;
    cost: number;
    apply: () => void;
}

/**
 * 自动挂载：场景加载完成后，如果场景中没有手动挂载 GameBootstrap，则自动找到 Canvas 并添加
 */
director.on(Director.EVENT_AFTER_SCENE_LAUNCH, () => {
    const scene = director.getScene();
    if (!scene) return;

    // 递归查找已有 GameBootstrap，避免重复挂载
    const findGB = (n: Node): boolean => {
        if (n.getComponent(GameBootstrap)) return true;
        for (const c of n.children) { if (findGB(c)) return true; }
        return false;
    };
    if (findGB(scene)) return;

    // 查找 Canvas 节点
    const findCanvas = (n: Node): Node | null => {
        if (n.getComponent('cc.Canvas') as any) return n;
        for (const c of n.children) {
            const r = findCanvas(c);
            if (r) return r;
        }
        return null;
    };
    const canvas = findCanvas(scene);
    if (!canvas) {
        console.warn('[GameBootstrap] Canvas not found, cannot auto-attach');
        return;
    }

    const gameNode = new Node('Game');
    canvas.addChild(gameNode);
    gameNode.addComponent(GameBootstrap);
    console.log('[GameBootstrap] Auto-attached to Canvas');
});

/**
 * GameBootstrap — 唯一入口脚本
 *
 * 使用方法：
 *   1. 新建空场景
 *   2. 创建一个空节点，命名随意（如 "Game"）
 *   3. 把 GameBootstrap.ts 挂上去
 *   4. 点击播放
 *   5. 完事。就这一步。
 */
@ccclass('GameBootstrap')
export class GameBootstrap extends Component {

    // ===== 战斗状态 =====
    private gold = 50;
    private exp = 0;
    private level = 1;
    private expToLevelUp = 50;
    private wave = 0;
    private lives = 5;

    /** 全局暂停标志 — 所有组件在 update 开头检查 */
    static gamePaused = false;

    /** 游戏结束标志 */
    private gameOver = false;

    // ===== 双塔引用 =====
    private leftTower: Tower | null = null;
    private rightTower: Tower | null = null;
    private leftRangeIndicator: Graphics | null = null;
    private rightRangeIndicator: Graphics | null = null;
    private rightTowerInstalled: boolean = false;

    // ===== 敌人列表 =====
    private enemies: Enemy[] = [];

    // ===== 波次控制 =====
    private waveTimer = 0;
    private waveInterval = 3;
    private spawning = false;
    private spawnTimer = 0;
    private spawnCount = 0;
    private spawnTotal = 0;
    private spawnInterval = 1;
    private waveHp = 100;
    private waveSpeed = 80;

    /** 当前波可用敌人类型及权重 */
    private waveEnemyPool: { type: string, weight: number }[] = [];

    // ===== 节点引用 =====
    private labelGold: Label = null!;
    private labelExp: Label = null!;
    private labelWave: Label = null!;
    private labelLevel: Label = null!;
    private labelLives: Label = null!;

    // ===== 飘字系统 =====
    private _floatingTexts: { node: Node, label: Label, vy: number, timer: number, duration: number }[] = [];

    // ===== 升级面板 =====
    private upgradePanel: Node | null = null;

    // ===== 常量 =====（竖屏 720x1280，适配微信小游戏）
    private readonly SPAWN_Y = 580;
    private readonly SPAWN_X_MIN = -250;
    private readonly SPAWN_X_MAX = 250;
    private readonly TOWER_X = 0;
    private readonly TOWER_Y = -500;

    // ============================================================
    //  启动 —— 自动创建所有游戏对象
    // ============================================================

    onLoad() {
        // 1) 创建背景
        this.makeBg();

        // 2) 创建炮塔（白色方块）
        this.makeTower();

        // 3) 创建 UI
        this.makeUI();
    }

    start() {
        // 4) 立即开始第一波
        this.waveTimer = this.waveInterval;
    }

    // ============================================================
    //  自动创建函数
    // ============================================================

    /** 纯色方块节点（用 Graphics 绘制，无需 spriteFrame） */
    private box(name: string, w: number, h: number, color: Color): Node {
        const n = new Node(name);
        const g = n.addComponent(Graphics);
        g.fillColor = color;
        g.rect(-w / 2, -h / 2, w, h);
        g.fill();
        return n;
    }

    /** Label 节点 */
    private text(name: string, str: string, x: number, y: number, size: number, color: Color): Label {
        const n = new Node(name);
        const lb = n.addComponent(Label);
        lb.string = str;
        lb.fontSize = size;
        lb.color = color;
        n.setPosition(x, y, 0);
        return lb as unknown as Label;
        // 注意：返回的是 Label，调用方 node.parent.addChild(lb.node)
    }

    // ---------- 背景 ----------
    private makeBg() {
        const bg = this.box('bg', SCREEN_WIDTH, SCREEN_HEIGHT, new Color(25, 30, 20));
        bg.setPosition(0, 0, 0);
        this.node.addChild(bg);
    }

    // ---------- 炮塔 ----------
    private makeTower() {
        // 左塔：高伤慢速（金色）
        const leftX = this.TOWER_X - 120;
        const leftNode = this.box('leftTower', 40, 40, new Color(200, 180, 50));
        leftNode.setPosition(leftX, this.TOWER_Y, 0);
        this.node.addChild(leftNode);

        const lt = leftNode.addComponent(Tower);
        lt.attackRect = { minX: -HALF_WIDTH, maxX: HALF_WIDTH, minY: -HALF_HEIGHT, maxY: HALF_HEIGHT };
        lt.damage = 50;
        lt.attackInterval = 0.6;
        lt.enemies = this.enemies;
        lt.createBullet = (fx, fy, target, dmg, penetrate, isCrit, dirX, dirY) => {
            this.spawnBullet(fx, fy, target, dmg, penetrate, isCrit, dirX, dirY);
        };
        this.leftTower = lt;

        // 左塔范围指示（金色矩形）
        this.leftRangeIndicator = this.drawRangeRect(leftNode, lt.attackRect, new Color(255, 215, 0, 80), new Color(255, 215, 0, 25));

        // 右塔：低伤快速（绿色），初始隐藏，升级选项中安装
        const rightX = this.TOWER_X + 120;
        const rightNode = this.box('rightTower', 40, 40, new Color(80, 200, 80));
        rightNode.setPosition(rightX, this.TOWER_Y, 0);
        rightNode.active = false;
        this.node.addChild(rightNode);

        const rt = rightNode.addComponent(Tower);
        rt.attackRect = { minX: -HALF_WIDTH, maxX: HALF_WIDTH, minY: -HALF_HEIGHT, maxY: HALF_HEIGHT };
        rt.damage = 15;
        rt.attackInterval = 0.25;
        rt.enemies = this.enemies;
        rt.createBullet = (fx, fy, target, dmg, penetrate, isCrit, dirX, dirY) => {
            this.spawnBullet(fx, fy, target, dmg, penetrate, isCrit, dirX, dirY);
        };
        this.rightTower = rt;

        // 右塔范围指示（绿色矩形，节点未激活时不会渲染）
        this.rightRangeIndicator = this.drawRangeRect(rightNode, rt.attackRect, new Color(80, 200, 80, 80), new Color(80, 200, 80, 25));
    }

    /** 在塔节点下绘制范围指示矩形 */
    private drawRangeRect(parentNode: Node, rect: { minX: number, maxX: number, minY: number, maxY: number }, strokeColor: Color, fillColor: Color): Graphics {
        const rangeNode = new Node('rangeIndicator');
        parentNode.addChild(rangeNode);
        const rg = rangeNode.addComponent(Graphics);
        rg.strokeColor = strokeColor;
        rg.fillColor = fillColor;
        rg.lineWidth = 2;
        rg.rect(rect.minX - parentNode.position.x, rect.minY - parentNode.position.y, rect.maxX - rect.minX, rect.maxY - rect.minY);
        rg.fill();
        rg.stroke();
        return rg;
    }

    // ---------- 子弹 ----------
    private spawnBullet(x: number, y: number, target: Enemy | null, dmg: number,
        penetrate?: number, isCrit?: boolean, dirX?: number, dirY?: number) {
        const color = isCrit ? new Color(255, 255, 80) : new Color(100, 255, 100);
        const node = this.box('bullet', 8, 8, color);
        node.setPosition(x, y, 0);
        this.node.addChild(node);

        const b = node.addComponent(Bullet);
        b.speed = 800;
        b.damage = dmg;
        b.target = target;
        b.penetrateCount = penetrate || 0;
        b.isCrit = isCrit || false;
        b.allEnemies = this.enemies;

        // 方向模式（散射子弹）
        if (dirX !== undefined && dirY !== undefined) {
            b.dirX = dirX;
            b.dirY = dirY;
            b.hasDir = true;
        }
    }

    // ---------- UI ----------
    private makeUI() {
        const uiRoot = new Node('ui');
        uiRoot.setPosition(0, 0, 0);
        this.node.addChild(uiRoot);

        const white = new Color(255, 255, 255);
        const gold = new Color(255, 215, 0);
        const green = new Color(100, 255, 100);

        // 左上角信息
        const lbWave = this.text('lbWave', '第 0 波', -260, 580, 26, white);
        uiRoot.addChild(lbWave.node);
        this.labelWave = lbWave;

        const lbGold = this.text('lbGold', '金币: 50', -260, 545, 22, gold);
        uiRoot.addChild(lbGold.node);
        this.labelGold = lbGold;

        const lbExp = this.text('lbExp', '经验: 0/50', -260, 510, 22, green);
        uiRoot.addChild(lbExp.node);
        this.labelExp = lbExp;

        const lbLevel = this.text('lbLevel', '等级: 1', -260, 475, 22, white);
        uiRoot.addChild(lbLevel.node);
        this.labelLevel = lbLevel;

        const lbLives = this.text('lbLives', '生命: ♥♥♥♥♥', -260, 440, 22, new Color(255, 80, 80));
        uiRoot.addChild(lbLives.node);
        this.labelLives = lbLives;

        // 底部提示
        const tip = this.text('tip', '敌人从上方出现 → 炮塔自动攻击', 0, -600, 16, new Color(150, 150, 150));
        uiRoot.addChild(tip.node);
    }

    // ============================================================
    //  每帧更新
    // ============================================================

    update(dt: number) {
        if (GameBootstrap.gamePaused || this.gameOver) return;

        // 飘字动画
        for (let i = this._floatingTexts.length - 1; i >= 0; i--) {
            const ft = this._floatingTexts[i];
            ft.timer += dt;
            const p = ft.node.position;
            ft.node.setPosition(p.x, p.y + ft.vy * dt, 0);
            const alpha = Math.max(0, 1 - ft.timer / ft.duration);
            ft.label.color = new Color(ft.label.color.r, ft.label.color.g, ft.label.color.b, Math.floor(alpha * 255));
            if (ft.timer >= ft.duration) {
                ft.node.destroy();
                this._floatingTexts.splice(i, 1);
            }
        }

        // 清理已销毁的敌人（原地修改，保持 Tower 的引用不变）
        for (let i = this.enemies.length - 1; i >= 0; i--) {
            const e = this.enemies[i];
            if (!e || !e.alive || !e.node || !e.node.isValid) {
                this.enemies.splice(i, 1);
            }
        }

        if (this.spawning) {
            // 正在出怪
            this.spawnTimer += dt;
            if (this.spawnTimer >= this.spawnInterval && this.spawnCount < this.spawnTotal) {
                this.spawnTimer -= this.spawnInterval;
                this.spawnEnemy();
            }
            if (this.spawnCount >= this.spawnTotal) {
                this.spawning = false;
            }
        } else {
            // 当前波出完 & 全部击杀 → 等下一波
            if (this.enemies.length === 0 && this.wave > 0) {
                this.waveTimer += dt;
                if (this.waveTimer >= this.waveInterval) {
                    this.waveTimer = 0;
                    this.nextWave();
                }
            }
        }

        // 第一波直接开始
        if (this.wave === 0 && !this.spawning) {
            this.nextWave();
        }
    }

    // ============================================================
    //  波次
    // ============================================================

    private nextWave() {
        this.wave++;
        this.spawnTotal = 8 + this.wave * 1;
        this.spawnCount = 0;
        this.spawnInterval = Math.max(0.4, 1.0 - this.wave * 0.05);
        this.spawnTimer = 0;
        this.waveHp = 60 + this.wave * 22;
        this.waveSpeed = 55 + this.wave * 5;

        // 构建敌人池：随波次解锁新类型
        this.waveEnemyPool = [{ type: 'normal', weight: 10 }];
        if (this.wave >= 2) this.waveEnemyPool.push({ type: 'fast', weight: 3 });
        if (this.wave >= 4) this.waveEnemyPool.push({ type: 'tank', weight: 2 });
        if (this.wave >= 8) this.waveEnemyPool.push({ type: 'split', weight: 2 });

        this.spawning = true;
        this.updateUI();
        console.log(`===== 第 ${this.wave} 波开始 (${this.spawnTotal} 个敌人) =====`);
    }

    // ============================================================
    //  敌人生成
    // ============================================================

    /** 从当前波敌人池中随机选一个类型 */
    private pickEnemyType(): string {
        const totalWeight = this.waveEnemyPool.reduce((s, e) => s + e.weight, 0);
        let roll = Math.random() * totalWeight;
        for (const entry of this.waveEnemyPool) {
            roll -= entry.weight;
            if (roll <= 0) return entry.type;
        }
        return 'normal';
    }

    /** 根据类型返回敌人属性 */
    private getEnemyStats(type: string, isSplitChild: boolean = false) {
        const base: {
            hp: number, speed: number, size: number,
            color: Color, reward: number, exp: number,
            splitOnDeath: boolean
        } = {
            hp: this.waveHp,
            speed: this.waveSpeed,
            size: 24,
            color: new Color(220, 50, 50),
            reward: 6,
            exp: 15,
            splitOnDeath: false,
        };

        switch (type) {
            case 'fast':
                base.hp = Math.floor(this.waveHp * 0.5);
                base.speed = this.waveSpeed * 1.8;
                base.size = 18;
                base.color = new Color(255, 100, 60);
                base.reward = 5;
                base.exp = 12;
                break;
            case 'tank':
                base.hp = Math.floor(this.waveHp * 2.5);
                base.speed = this.waveSpeed * 0.5;
                base.size = 32;
                base.color = new Color(140, 20, 20);
                base.reward = 12;
                base.exp = 25;
                break;
            case 'split':
                base.hp = Math.floor(this.waveHp * 0.8);
                base.speed = this.waveSpeed * 0.7;
                base.size = 28;
                base.color = new Color(180, 100, 50);
                base.reward = 7;
                base.exp = 18;
                base.splitOnDeath = true;
                break;
        }

        // 分裂出的小怪：血量减半，速度提升，体积缩小
        if (isSplitChild) {
            base.hp = Math.floor(base.hp * 0.5);
            base.speed = base.speed * 1.3;
            base.size = Math.max(14, Math.floor(base.size * 0.7));
            base.reward = Math.floor(base.reward * 0.4);
            base.exp = Math.floor(base.exp * 0.4);
            base.splitOnDeath = false;
        }

        return base;
    }

    /** 创建一个敌人节点（通用） */
    private createEnemyNode(type: string, x: number, y: number, isSplitChild: boolean = false): Enemy {
        const stats = this.getEnemyStats(type, isSplitChild);
        const halfSize = stats.size / 2;

        const node = this.box('enemy', stats.size, stats.size, stats.color);
        node.setPosition(x, y, 0);
        this.node.addChild(node);

        // 血条
        const hpBg = this.box('hpBg', stats.size + 2, 4, new Color(80, 80, 80));
        hpBg.setPosition(0, halfSize + 4, 0);
        node.addChild(hpBg);

        const hpBar = this.box('hpBar', stats.size, 3, new Color(50, 220, 50));
        hpBar.setPosition(0, halfSize + 4, 0);
        node.addChild(hpBar);

        const enemy = node.addComponent(Enemy);
        enemy.hp = stats.hp;
        enemy.maxHp = stats.hp;
        enemy.speed = stats.speed;
        enemy.reward = stats.reward;
        enemy.exp = stats.exp;
        enemy.alive = true;
        enemy.hpBar = hpBar;
        enemy.splitOnDeath = stats.splitOnDeath;
        enemy.isSplitChild = isSplitChild;
        enemy.initGraphics(stats.color, stats.size);

        enemy.onDeath = (e) => {
            // 金币飘字
            this.spawnFloatingText(e.node.position.x, e.node.position.y,
                `+${e.reward}`, new Color(255, 215, 0), 20, 0.6);
            // 分裂
            if (e.splitOnDeath && !e.isSplitChild) {
                const pos = e.node.position;
                this.spawnSplitChildren(pos.x, pos.y);
            }
            this.gold += e.reward;
            this.exp += e.exp;
            this.checkLevelUp();
            this.updateUI();
        };

        enemy.onDamage = (dmg, isCrit, x, y) => {
            if (isCrit) {
                this.spawnFloatingText(x, y + 20, 'CRIT!', new Color(255, 80, 80), 28, 0.6);
            }
        };

        enemy.onEscape = (e) => {
            this.lives--;
            console.log(`[漏怪] 剩余生命: ${this.lives}`);
            this.updateUI();
            if (this.lives <= 0) {
                this.triggerGameOver();
            }
        };

        this.enemies.push(enemy);
        return enemy;
    }

    /** 波次正常出怪 */
    private spawnEnemy() {
        const type = this.pickEnemyType();
        const x = this.SPAWN_X_MIN + Math.random() * (this.SPAWN_X_MAX - this.SPAWN_X_MIN);
        this.createEnemyNode(type, x, this.SPAWN_Y);
        this.spawnCount++;
    }

    /** 分裂产生两个小怪 */
    private spawnSplitChildren(x: number, y: number) {
        this.createEnemyNode('split', x - 20, y, true);
        this.createEnemyNode('split', x + 20, y, true);
    }

    // ---------- 飘字 ----------
    private spawnFloatingText(x: number, y: number, text: string, color: Color, fontSize: number, duration: number) {
        const n = new Node('floatText');
        n.setPosition(x, y, 0);
        this.node.addChild(n);
        const lb = n.addComponent(Label);
        lb.string = text;
        lb.fontSize = fontSize;
        lb.color = color;
        this._floatingTexts.push({ node: n, label: lb, vy: 80, timer: 0, duration });
    }

    // ============================================================
    //  升级系统
    // ============================================================

    private checkLevelUp() {
        while (this.exp >= this.expToLevelUp) {
            this.exp -= this.expToLevelUp;
            this.level++;
            this.expToLevelUp = Math.floor(this.expToLevelUp * 1.3);
            this.autoLevelUp();
        }
    }

    /** 升级时暂停游戏，弹出三选一面板 */
    private autoLevelUp() {
        GameBootstrap.gamePaused = true;
        console.log(`★ 升级 Lv.${this.level} → 选择强化`);

        const options = this.rollUpgradeOptions();
        this.showUpgradePanel(options);
    }

    private _makeOpt(label: string, cost: number, apply: () => void): UpgradeOption {
        return { label, cost, apply };
    }

    /** Fisher-Yates 洗牌，取3个选项；保证至少一个可购买 */
    private rollUpgradeOptions(): UpgradeOption[] {
        const lt = this.leftTower!;
        const rt = this.rightTower;
        const pool: UpgradeOption[] = [
            this._makeOpt('左塔伤害+20', 150, () => { lt.damage += 20; }),
            this._makeOpt('左塔攻速+0.1', 120, () => { lt.attackInterval = Math.max(0.05, lt.attackInterval - 0.1); }),
            this._makeOpt('左塔伤害+8', 70, () => { lt.damage += 8; }),
            this._makeOpt('左塔暴击+5%', 140, () => { lt.critChance = Math.min(1, lt.critChance + 0.05); }),
            this._makeOpt('左塔穿透+1', 160, () => { lt.penetrateLevel++; }),
        ];
        if (!this.rightTowerInstalled) {
            pool.push(this._makeOpt('安装右塔', 80, () => {
                if (rt && rt.node) {
                    rt.node.active = true;
                    this.rightTowerInstalled = true;
                    console.log('[右塔] 已部署');
                }
            }));
        } else if (rt) {
            pool.push(
                this._makeOpt('右塔伤害+10', 90, () => { rt.damage += 10; }),
                this._makeOpt('右塔攻速+0.15', 110, () => { rt.attackInterval = Math.max(0.05, rt.attackInterval - 0.15); }),
                this._makeOpt('右塔攻速+0.08', 60, () => { rt.attackInterval = Math.max(0.05, rt.attackInterval - 0.08); }),
                this._makeOpt('右塔双发+5%', 180, () => { rt.doubleShotChance = Math.min(1, rt.doubleShotChance + 0.05); }),
                this._makeOpt('右塔散射', 220, () => { rt.scatterEnabled = true; }),
            );
        }
        for (let i = pool.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [pool[i], pool[j]] = [pool[j], pool[i]];
        }
        const picked = pool.slice(0, 3);

        // 保证至少一个可购买：全部买不起时，用最便宜的替换第一个
        if (picked.every(o => this.gold < o.cost)) {
            const sorted = [...pool].sort((a, b) => a.cost - b.cost);
            const cheapest = sorted[0];
            if (this.gold >= cheapest.cost) {
                picked[0] = cheapest;
            }
        }
        return picked;
    }

    /** 应用升级选项 */
    private applyUpgrade(option: UpgradeOption) {
        this.gold -= option.cost;
        option.apply();
        this.updateUI();
    }

    /** 重绘指定塔的范围指示器 */
    private redrawRangeIndicator(towerIndex: number) {
        const tw = towerIndex === 0 ? this.leftTower : this.rightTower;
        const indicator = towerIndex === 0 ? this.leftRangeIndicator : this.rightRangeIndicator;
        if (!tw || !indicator) return;
        const r = tw.attackRect;
        const parentNode = towerIndex === 0 ? this.leftTower!.node : this.rightTower!.node;
        indicator.clear();
        indicator.rect(r.minX - parentNode.position.x, r.minY - parentNode.position.y, r.maxX - r.minX, r.maxY - r.minY);
        indicator.fill();
        indicator.stroke();
    }

    /** 绘制升级面板 */
    private showUpgradePanel(options: UpgradeOption[]) {
        const btnY = [60, -20, -100];
        const btnW = 400, btnH = 70;

        const panel = new Node('upgradePanel');
        this.node.addChild(panel);
        this.upgradePanel = panel;

        // 全屏遮挡层
        const mask = new Node('mask');
        const maskUIT = mask.addComponent(UITransform);
        maskUIT.setContentSize(SCREEN_WIDTH, SCREEN_HEIGHT);
        const mg = mask.addComponent(Graphics);
        mg.fillColor = new Color(0, 0, 0, 150);
        mg.rect(-HALF_WIDTH, -HALF_HEIGHT, SCREEN_WIDTH, SCREEN_HEIGHT);
        mg.fill();
        panel.addChild(mask);

        // 面板背景（加高以容纳跳过按钮）
        const bg = new Node('panelBg');
        const bgUIT = bg.addComponent(UITransform);
        bgUIT.setContentSize(500, 450);
        const bgg = bg.addComponent(Graphics);
        bgg.fillColor = new Color(30, 35, 45, 240);
        bgg.strokeColor = new Color(255, 215, 0, 200);
        bgg.lineWidth = 3;
        bgg.roundRect(-250, -225, 500, 450, 16);
        bgg.fill();
        bgg.stroke();
        panel.addChild(bg);

        const title = new Node('title');
        const tl = title.addComponent(Label);
        tl.string = `Lv.${this.level} 选择强化`;
        tl.fontSize = 30;
        tl.color = new Color(255, 215, 0);
        title.setPosition(0, 170, 0);
        panel.addChild(title);

        // 金币提示
        const goldInfo = new Node('goldInfo');
        const gl = goldInfo.addComponent(Label);
        gl.string = `持有 ${this.gold} 金币`;
        gl.fontSize = 18;
        gl.color = new Color(255, 215, 0);
        goldInfo.setPosition(0, 130, 0);
        panel.addChild(goldInfo);

        const closeUpgradePanel = () => {
            GameBootstrap.gamePaused = false;
            if (this.upgradePanel && this.upgradePanel.isValid) {
                this.upgradePanel.destroy();
            }
            this.upgradePanel = null;
        };

        // 三个升级按钮
        for (let i = 0; i < 3; i++) {
            const opt = options[i];
            const canAfford = this.gold >= opt.cost;
            const btn = this.createUpgradeButton(`${opt.label}  (${opt.cost}金)`, btnY[i], !canAfford);
            if (canAfford) {
                btn.on(Node.EventType.TOUCH_END, () => {
                    console.log(`[升级面板] 选中: ${opt.label}`);
                    this.applyUpgrade(opt);
                    closeUpgradePanel();
                }, this);
            }
            panel.addChild(btn);
        }

        // 跳过按钮
        const skipBtn = this.createUpgradeButton('跳过（免费）', -180, false);
        skipBtn.on(Node.EventType.TOUCH_END, () => {
            console.log('[升级面板] 跳过');
            closeUpgradePanel();
        }, this);
        panel.addChild(skipBtn);
    }

    /** 创建单个升级按钮（带 UITransform 支持触摸） */
    private createUpgradeButton(label: string, y: number, grayedOut: boolean = false): Node {
        const btnW = 400, btnH = 70;
        const btn = new Node('btn_' + label);
        btn.setPosition(0, y, 0);

        const uit = btn.addComponent(UITransform);
        uit.setContentSize(btnW, btnH);

        const bg = btn.addComponent(Graphics);
        bg.fillColor = grayedOut ? new Color(40, 40, 40, 200) : new Color(50, 60, 80, 255);
        bg.strokeColor = grayedOut ? new Color(80, 80, 80, 120) : new Color(180, 180, 180, 180);
        bg.lineWidth = 2;
        bg.roundRect(-btnW / 2, -btnH / 2, btnW, btnH, 10);
        bg.fill();
        bg.stroke();

        const textNode = new Node('text');
        const lb = textNode.addComponent(Label);
        lb.string = label;
        lb.fontSize = 24;
        lb.color = grayedOut ? new Color(100, 100, 100) : new Color(255, 255, 255);
        btn.addChild(textNode);

        return btn;
    }

    // ============================================================
    //  游戏结束
    // ============================================================

    private triggerGameOver() {
        this.gameOver = true;
        GameBootstrap.gamePaused = true;
        console.log('===== 游戏结束 =====');
        console.log(`波次: ${this.wave}  等级: ${this.level}  金币: ${this.gold}`);
        this.showGameOverPanel();
    }

    private showGameOverPanel() {
        const panel = new Node('gameOverPanel');
        this.node.addChild(panel);

        const mask = new Node('mask');
        const maskUIT = mask.addComponent(UITransform);
        maskUIT.setContentSize(SCREEN_WIDTH, SCREEN_HEIGHT);
        const mg = mask.addComponent(Graphics);
        mg.fillColor = new Color(0, 0, 0, 180);
        mg.rect(-HALF_WIDTH, -HALF_HEIGHT, SCREEN_WIDTH, SCREEN_HEIGHT);
        mg.fill();
        panel.addChild(mask);

        const bg = new Node('panelBg');
        const bgg = bg.addComponent(Graphics);
        bgg.fillColor = new Color(40, 10, 10, 240);
        bgg.strokeColor = new Color(255, 80, 80, 200);
        bgg.lineWidth = 3;
        bgg.roundRect(-250, -200, 500, 350, 16);
        bgg.fill();
        bgg.stroke();
        panel.addChild(bg);

        const makeLabel = (text: string, y: number, size: number, color: Color) => {
            const n = new Node(text);
            const lb = n.addComponent(Label);
            lb.string = text;
            lb.fontSize = size;
            lb.color = color;
            n.setPosition(0, y, 0);
            panel.addChild(n);
        };

        makeLabel('游戏结束', 120, 36, new Color(255, 80, 80));
        makeLabel(`坚持到第 ${this.wave} 波`, 60, 22, new Color(255, 255, 255));
        makeLabel(`等级: ${this.level}    金币: ${this.gold}`, 20, 20, new Color(200, 200, 200));

        // 重新开始按钮
        const restartBtn = new Node('restartBtn');
        restartBtn.setPosition(0, -80, 0);
        const rUIT = restartBtn.addComponent(UITransform);
        rUIT.setContentSize(240, 60);
        const rbg = restartBtn.addComponent(Graphics);
        rbg.fillColor = new Color(60, 80, 60, 255);
        rbg.strokeColor = new Color(100, 255, 100, 200);
        rbg.lineWidth = 2;
        rbg.roundRect(-120, -30, 240, 60, 10);
        rbg.fill();
        rbg.stroke();
        panel.addChild(restartBtn);

        const restartText = new Node('text');
        const rtl = restartText.addComponent(Label);
        rtl.string = '重新开始';
        rtl.fontSize = 26;
        rtl.color = new Color(100, 255, 100);
        restartBtn.addChild(restartText);

        restartBtn.on(Node.EventType.TOUCH_END, () => {
            director.loadScene('Battle');
        }, this);
    }

    // ============================================================
    //  UI 刷新
    // ============================================================

    private updateUI() {
        if (this.labelWave) this.labelWave.string = `第 ${this.wave} 波  (剩余 ${this.enemies.length})`;
        if (this.labelGold) this.labelGold.string = `金币: ${this.gold}`;
        if (this.labelExp) this.labelExp.string = `经验: ${this.exp}/${this.expToLevelUp}`;
        if (this.labelLevel) this.labelLevel.string = `等级: ${this.level}`;
        if (this.labelLives) {
            let hearts = '';
            for (let i = 0; i < this.lives; i++) hearts += '♥';
            this.labelLives.string = `生命: ${hearts}`;
        }
    }
}
