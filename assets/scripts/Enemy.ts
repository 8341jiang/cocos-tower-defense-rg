import { _decorator, Component } from 'cc';
import { GameBootstrap } from './GameBootstrap';
import { HALF_HEIGHT } from './ScreenConstants';
const { ccclass } = _decorator;

/**
 * Enemy — 敌人组件
 * 由 GameBootstrap 自动创建挂载，不需要手动配置
 */
@ccclass('Enemy')
export class Enemy extends Component {

    hp: number = 100;
    maxHp: number = 100;
    speed: number = 80;
    reward: number = 10;
    exp: number = 15;
    alive: boolean = true;

    /** 减速因子（1.0=正常，由 SlowTower 攻击命中时设置） */
    slowFactor: number = 1.0;

    /** 减速剩余时间（秒，>0 时保持减速，归零后恢复） */
    slowTimer: number = 0;

    /** 死亡时分裂（SplitEnemy 专用） */
    splitOnDeath: boolean = false;
    /** 分裂出的小怪是否为子代（防止无限分裂） */
    isSplitChild: boolean = false;

    /** 血条前景节点（由 GameBootstrap 注入，用于实时更新宽度） */
    hpBar: import('cc').Node | null = null;

    /** 死亡回调（由 GameBootstrap 注入） */
    onDeath: ((e: Enemy) => void) | null = null;

    /** 漏怪回调（由 GameBootstrap 注入） */
    onEscape: ((e: Enemy) => void) | null = null;

    takeDamage(dmg: number) {
        if (!this.alive) return;
        this.hp -= dmg;

        // 更新血条宽度
        if (this.hpBar && this.maxHp > 0) {
            const ratio = Math.max(0, this.hp / this.maxHp);
            this.hpBar.setScale(ratio, 1, 1);
        }

        if (this.hp <= 0) {
            this.hp = 0;
            this.alive = false;
            if (this.onDeath) this.onDeath(this);
            this.onDeath = null;
            this.node.destroy();
        }
    }

    update(dt: number) {
        if (!this.alive || GameBootstrap.gamePaused) return;

        // 减速倒计时
        if (this.slowTimer > 0) {
            this.slowTimer -= dt;
            if (this.slowTimer <= 0) {
                this.slowTimer = 0;
                this.slowFactor = 1.0;
            }
        }

        const p = this.node.position;
        this.node.setPosition(p.x, p.y - this.speed * this.slowFactor * dt, 0);

        // 超出下边界 → 漏怪
        if (this.node.position.y < -HALF_HEIGHT) {
            this.alive = false;
            if (this.onEscape) this.onEscape(this);
            this.node.destroy();
        }
    }
}
