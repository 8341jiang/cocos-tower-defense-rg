import { _decorator, Component } from 'cc';
import { GameBootstrap } from './GameBootstrap';
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
            this.node.destroy();
        }
    }

    update(dt: number) {
        if (!this.alive || GameBootstrap.gamePaused) return;

        const p = this.node.position;
        this.node.setPosition(p.x, p.y - this.speed * dt, 0);

        // 超出下边界 → 漏怪
        if (this.node.position.y < -640) {
            this.alive = false;
            if (this.onEscape) this.onEscape(this);
            this.node.destroy();
        }
    }
}
