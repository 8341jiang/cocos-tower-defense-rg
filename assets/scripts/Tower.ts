import { _decorator, Component, Node, Color, Graphics } from 'cc';
import { Enemy } from './Enemy';
import { GameBootstrap } from './GameBootstrap';
import { HALF_WIDTH, HALF_HEIGHT } from './ScreenConstants';
const { ccclass } = _decorator;

/**
 * Tower — 炮塔组件
 * 自动寻找矩形区域内最近敌人并射击
 * 由 GameBootstrap 自动创建，不需要手动配置
 */
@ccclass('Tower')
export class Tower extends Component {

    /** 攻击矩形（世界坐标） */
    attackRect = { minX: -HALF_WIDTH, maxX: HALF_WIDTH, minY: -HALF_HEIGHT, maxY: HALF_HEIGHT };

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

    private _timer: number = 0;

    update(dt: number) {
        if (GameBootstrap.gamePaused) return;
        // 攻速加成
        const speedBonus = this.getSpeedBonus ? this.getSpeedBonus() : 0;
        const interval = Math.max(0.1, this.attackInterval - speedBonus);

        this._timer += dt;
        if (this._timer < interval) return;
        this._timer = 0;

        // 找矩形内最近敌人
        const target = this.findNearest();
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

    private findNearest(): Enemy | null {
        let best: Enemy | null = null;
        let bestDist = Infinity;
        const r = this.attackRect;

        for (const e of this.enemies) {
            if (!e || !e.alive) continue;
            const ep = e.node.position;
            if (ep.x < r.minX || ep.x > r.maxX || ep.y < r.minY || ep.y > r.maxY) continue;
            const dx = ep.x - this.node.position.x;
            const dy = ep.y - this.node.position.y;
            const d2 = dx * dx + dy * dy;
            if (d2 < bestDist) {
                bestDist = d2;
                best = e;
            }
        }
        return best;
    }
}
