import { _decorator, Component, Node } from 'cc';
import { Enemy } from './Enemy';
import { GameBootstrap } from './GameBootstrap';
const { ccclass } = _decorator;

/**
 * Tower — 炮塔组件
 * 自动寻找最近敌人并射击
 * 由 GameBootstrap 自动创建，不需要手动配置
 */
@ccclass('Tower')
export class Tower extends Component {

    /** 攻击范围（像素） */
    range: number = 200;

    /** 基础伤害 */
    damage: number = 20;

    /** 攻击间隔（秒） */
    attackInterval: number = 1.0;

    /** 敌人列表引用（由 GameBootstrap 注入） */
    enemies: Enemy[] = [];

    /** 创建子弹的回调（由 GameBootstrap 注入） */
    createBullet: ((fromX: number, fromY: number, target: Enemy, dmg: number) => void) | null = null;

    /** 全局伤害加成引用（由 GameBootstrap 注入） */
    getDamageBonus: (() => number) | null = null;

    /** 全局攻速加成引用（由 GameBootstrap 注入） */
    getSpeedBonus: (() => number) | null = null;

    /** 全局范围加成引用（由 GameBootstrap 注入） */
    getRangeBonus: (() => number) | null = null;

    private _timer: number = 0;

    update(dt: number) {
        if (GameBootstrap.gamePaused) return;
        // 攻速加成
        const speedBonus = this.getSpeedBonus ? this.getSpeedBonus() : 0;
        const interval = Math.max(0.1, this.attackInterval - speedBonus);

        this._timer += dt;
        if (this._timer < interval) return;
        this._timer = 0;

        // 范围加成
        const rangeBonus = this.getRangeBonus ? this.getRangeBonus() : 0;
        const totalRange = this.range + rangeBonus;

        // 找最近敌人
        const target = this.findNearest(totalRange);
        if (!target) return;

        // 伤害加成
        const dmgBonus = this.getDamageBonus ? this.getDamageBonus() : 0;
        const totalDmg = this.damage + dmgBonus;

        // 发射子弹
        const p = this.node.position;
        if (this.createBullet) {
            this.createBullet(p.x, p.y, target, totalDmg);
        }
    }

    private findNearest(range: number): Enemy | null {
        let best: Enemy | null = null;
        let bestDist = range * range;
        const p = this.node.position;

        for (const e of this.enemies) {
            if (!e || !e.alive) continue;
            const ep = e.node.position;
            const d2 = (ep.x - p.x) ** 2 + (ep.y - p.y) ** 2;
            if (d2 < bestDist) {
                bestDist = d2;
                best = e;
            }
        }
        return best;
    }
}
