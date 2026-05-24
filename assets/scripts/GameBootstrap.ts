import {
    _decorator, Component, Node, Label, Color,
    director, Director, Graphics, input, Input
} from 'cc';
import { Enemy } from './Enemy';
import { Tower } from './Tower';
import { Bullet } from './Bullet';
const { ccclass } = _decorator;

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

    // ===== 塔的全局加成（升级选择影响）=====
    private dmgBonus = 0;
    private speedBonus = 0;
    private rangeBonus = 0;

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

    // ===== 节点引用 =====
    private labelGold: Label = null!;
    private labelExp: Label = null!;
    private labelWave: Label = null!;
    private labelLevel: Label = null!;
    private labelLives: Label = null!;

    // ===== 范围指示器 =====
    private rangeIndicator: Graphics | null = null;
    private rangeBaseRadius = 0;
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
        const bg = this.box('bg', 720, 1280, new Color(25, 30, 20));
        bg.setPosition(0, 0, 0);
        this.node.addChild(bg);
    }

    // ---------- 炮塔 ----------
    private makeTower() {
        const node = this.box('tower', 40, 40, new Color(200, 180, 50));
        node.setPosition(this.TOWER_X, this.TOWER_Y, 0);
        this.node.addChild(node);

        const tw = node.addComponent(Tower);
        tw.range = 400;
        tw.damage = 50;
        tw.attackInterval = 0.4;
        tw.enemies = this.enemies;
        tw.getDamageBonus = () => this.dmgBonus;
        tw.getSpeedBonus = () => this.speedBonus;
        tw.getRangeBonus = () => this.rangeBonus;
        tw.createBullet = (fx, fy, target, dmg) => {
            this.spawnBullet(fx, fy, target, dmg);
        };

        // 攻击范围指示圈
        const rangeNode = new Node('rangeIndicator');
        node.addChild(rangeNode);
        const rg = rangeNode.addComponent(Graphics);
        rg.strokeColor = new Color(255, 215, 0, 80);
        rg.fillColor = new Color(255, 215, 0, 25);
        rg.lineWidth = 2;
        rg.circle(0, 0, tw.range);
        rg.fill();
        rg.stroke();

        // 范围圈跟随加成动态更新
        this.rangeIndicator = rg;
        this.rangeBaseRadius = tw.range;
    }

    // ---------- 子弹 ----------
    private spawnBullet(x: number, y: number, target: Enemy, dmg: number) {
        const node = this.box('bullet', 8, 8, new Color(100, 255, 100));
        node.setPosition(x, y, 0);
        this.node.addChild(node);

        const b = node.addComponent(Bullet);
        b.speed = 800;
        b.damage = dmg;
        b.target = target;
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
        const lbWave = this.text('lbWave', '第 0 波', -310, 580, 24, white);
        uiRoot.addChild(lbWave.node);
        this.labelWave = lbWave;

        const lbGold = this.text('lbGold', '金币: 50', -310, 545, 20, gold);
        uiRoot.addChild(lbGold.node);
        this.labelGold = lbGold;

        const lbExp = this.text('lbExp', '经验: 0/50', -310, 515, 20, green);
        uiRoot.addChild(lbExp.node);
        this.labelExp = lbExp;

        const lbLevel = this.text('lbLevel', '等级: 1', -310, 485, 20, white);
        uiRoot.addChild(lbLevel.node);
        this.labelLevel = lbLevel;

        const lbLives = this.text('lbLives', '生命: ♥♥♥♥♥', -310, 455, 20, new Color(255, 80, 80));
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
        if (GameBootstrap.gamePaused) return;

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
        this.spawnTotal = 8 + this.wave * 2;
        this.spawnCount = 0;
        this.spawnInterval = Math.max(0.4, 1.0 - this.wave * 0.05);
        this.spawnTimer = 0;
        this.waveHp = 80 + this.wave * 30;
        this.waveSpeed = 60 + this.wave * 8;
        this.spawning = true;
        this.updateUI();
        console.log(`===== 第 ${this.wave} 波开始 (${this.spawnTotal} 个敌人) =====`);
    }

    // ============================================================
    //  敌人生成
    // ============================================================

    private spawnEnemy() {
        const x = this.SPAWN_X_MIN + Math.random() * (this.SPAWN_X_MAX - this.SPAWN_X_MIN);
        const node = this.box('enemy', 24, 24, new Color(220, 50, 50));
        node.setPosition(x, this.SPAWN_Y, 0);
        this.node.addChild(node);

        // 血条背景（灰色小条，在敌人头顶）
        const hpBg = this.box('hpBg', 26, 4, new Color(80, 80, 80));
        hpBg.setPosition(0, 16, 0);
        node.addChild(hpBg);

        // 血条前景（绿色，后面会被 update 动态缩放）
        const hpBar = this.box('hpBar', 24, 3, new Color(50, 220, 50));
        hpBar.setPosition(0, 16, 0);
        node.addChild(hpBar);

        const enemy = node.addComponent(Enemy);
        enemy.hp = this.waveHp;
        enemy.maxHp = this.waveHp;
        enemy.speed = this.waveSpeed;
        enemy.reward = 10;
        enemy.exp = 15;
        enemy.alive = true;
        enemy.hpBar = hpBar;

        enemy.onDeath = (e) => {
            this.gold += e.reward;
            this.exp += e.exp;
            this.checkLevelUp();
            this.updateUI();
        };

        enemy.onEscape = (e) => {
            this.lives--;
            console.log(`[漏怪] 剩余生命: ${this.lives}`);
            this.updateUI();
            if (this.lives <= 0) {
                console.log('===== 游戏结束 =====');
                console.log(`波次: ${this.wave}  等级: ${this.level}  金币: ${this.gold}`);
            }
        };

        this.enemies.push(enemy);
        this.spawnCount++;
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

    /** Fisher-Yates 洗牌，保证三个选项各不相同 */
    private rollUpgradeOptions(): string[] {
        const pool = ['伤害+5', '攻速+0.1', '范围+15'];
        for (let i = pool.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [pool[i], pool[j]] = [pool[j], pool[i]];
        }
        return pool;
    }

    /** 将选项名映射到实际加成逻辑 */
    private applyUpgrade(label: string) {
        if (label === '伤害+5') {
            this.dmgBonus += 5;
        } else if (label === '攻速+0.1') {
            this.speedBonus += 0.1;
        } else if (label === '范围+15') {
            this.rangeBonus += 15;
            this.updateRangeIndicator();
        }
    }

    /** 绘制升级面板，全面诊断坐标系并自动适配 */
    private showUpgradePanel(options: string[]) {
        const btnY = [-40, -120, -200];
        const btnW = 400, btnH = 70;

        const panel = new Node('upgradePanel');
        this.node.addChild(panel);
        this.upgradePanel = panel;

        const mask = new Node('mask');
        const mg = mask.addComponent(Graphics);
        mg.fillColor = new Color(0, 0, 0, 150);
        mg.rect(-360, -640, 720, 1280);
        mg.fill();
        panel.addChild(mask);

        const bg = new Node('panelBg');
        const bgg = bg.addComponent(Graphics);
        bgg.fillColor = new Color(30, 35, 45, 240);
        bgg.strokeColor = new Color(255, 215, 0, 200);
        bgg.lineWidth = 3;
        bgg.roundRect(-250, -250, 500, 400, 16);
        bgg.fill();
        bgg.stroke();
        panel.addChild(bg);

        const title = new Node('title');
        const tl = title.addComponent(Label);
        tl.string = `Lv.${this.level} 选择强化`;
        tl.fontSize = 30;
        tl.color = new Color(255, 215, 0);
        title.setPosition(0, 120, 0);
        panel.addChild(title);

        for (let i = 0; i < 3; i++) {
            panel.addChild(this.createUpgradeButton(options[i], btnY[i]));
        }

        // 获取坐标参考信息
        const canvasNode = this.node.parent!;
        const canvasUIT = canvasNode.getComponent('cc.UITransform') as any;
        const uitW = canvasUIT ? canvasUIT.width : 720;
        const uitH = canvasUIT ? canvasUIT.height : 1280;

        const closeUpgradePanel = () => {
            input.off(Input.EventType.TOUCH_END, onTouchEnd, this);
            GameBootstrap.gamePaused = false;
            if (this.upgradePanel && this.upgradePanel.isValid) {
                this.upgradePanel.destroy();
            }
            this.upgradePanel = null;
        };

        const onTouchEnd = (event: any) => {
            const touch = event.touch;
            if (!touch) return;

            const loc = touch.getLocation();
            const uiLoc = touch.getUILocation();

            // getUILocation() 返回 UITransform 空间坐标
            // 需要按 UIT/设计分辨率 缩放，再减去设计半宽半高转到局部坐标
            const tx = uiLoc.x * 720 / uitW - 360;
            const ty = uiLoc.y * 1280 / uitH - 640;

            for (let i = 0; i < 3; i++) {
                if (Math.abs(tx) < btnW / 2 &&
                    Math.abs(ty - btnY[i]) < btnH / 2) {
                    this.applyUpgrade(options[i]);
                    closeUpgradePanel();
                    return;
                }
            }
        };
        input.on(Input.EventType.TOUCH_END, onTouchEnd, this);
    }

    /** 创建单个升级按钮（纯视觉，不含事件） */
    private createUpgradeButton(label: string, y: number): Node {
        const btn = new Node('btn_' + label);
        btn.setPosition(0, y, 0);

        const bg = btn.addComponent(Graphics);
        bg.fillColor = new Color(50, 60, 80, 255);
        bg.strokeColor = new Color(180, 180, 180, 180);
        bg.lineWidth = 2;
        bg.roundRect(-200, -35, 400, 70, 10);
        bg.fill();
        bg.stroke();

        const textNode = new Node('text');
        const lb = textNode.addComponent(Label);
        lb.string = label;
        lb.fontSize = 24;
        lb.color = new Color(255, 255, 255);
        btn.addChild(textNode);

        return btn;
    }

    private updateRangeIndicator() {
        if (!this.rangeIndicator) return;
        const r = this.rangeBaseRadius + this.rangeBonus;
        this.rangeIndicator.clear();
        this.rangeIndicator.circle(0, 0, r);
        this.rangeIndicator.fill();
        this.rangeIndicator.stroke();
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
