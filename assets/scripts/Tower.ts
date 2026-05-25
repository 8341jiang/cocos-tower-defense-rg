import { _decorator, Component, Node, Color, Graphics } from 'cc';
import { Enemy } from './Enemy';
import { GameBootstrap } from './GameBootstrap';
import { HALF_WIDTH, HALF_HEIGHT } from './ScreenConstants';
const { ccclass } = _decorator;

@ccclass('Tower')
export class Tower extends Component {

    attackRect = { minX: -HALF_WIDTH, maxX: HALF_WIDTH, minY: -HALF_HEIGHT, maxY: HALF_HEIGHT };
    damage: number = 20;
    attackInterval: number = 1.0;
    enemies: Enemy[] = [];
    createBullet: ((fromX: number, fromY: number, target: Enemy | null, dmg: number,
        penetrate?: number, isCrit?: boolean, dirX?: number, dirY?: number) => void) | null = null;
    getDamageBonus: (() => number) | null = null;
    getSpeedBonus: (() => number) | null = null;

    critChance: number = 0;
    doubleShotChance: number = 0;
    penetrateLevel: number = 0;
    scatterEnabled: boolean = false;

    private _timer: number = 0;

    update(dt: number) {
        if (GameBootstrap.gamePaused) return;
        const speedBonus = this.getSpeedBonus ? this.getSpeedBonus() : 0;
        const interval = Math.max(0.1, this.attackInterval - speedBonus);

        this._timer += dt;
        if (this._timer < interval) return;
        this._timer = 0;

        const target = this.findNearest();
        if (!target) return;

        const dmgBonus = this.getDamageBonus ? this.getDamageBonus() : 0;
        let totalDmg = this.damage + dmgBonus;
        let isCrit = false;
        if (this.critChance > 0 && Math.random() < this.critChance) {
            totalDmg *= 2;
            isCrit = true;
        }

        const p = this.node.position;

        if (this.scatterEnabled) {
            const tx = target.node.position.x;
            const ty = target.node.position.y;
            const dx = tx - p.x;
            const dy = ty - p.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const ndx = dist > 0 ? dx / dist : 0;
            const ndy = dist > 0 ? dy / dist : 1;
            this._fireScatter(p.x, p.y, ndx, ndy, totalDmg, isCrit, target);
        } else {
            this._fireNormal(p.x, p.y, target, totalDmg, isCrit, 0);
            // 双发
            if (this.doubleShotChance > 0 && Math.random() < this.doubleShotChance) {
                this._fireNormal(p.x, p.y, target, totalDmg, isCrit, 8);
            }
        }
    }

    private _fireNormal(x: number, y: number, target: Enemy, dmg: number, isCrit: boolean, offsetX: number) {
        if (this.createBullet) {
            this.createBullet(x + offsetX, y, target, dmg, this.penetrateLevel, isCrit);
        }
    }

    private _fireScatter(x: number, y: number, ndx: number, ndy: number, dmg: number, isCrit: boolean, target: Enemy) {
        if (!this.createBullet) return;
        const angles = [0, 15, -15];
        for (const angle of angles) {
            const rad = angle * Math.PI / 180;
            const rdx = ndx * Math.cos(rad) - ndy * Math.sin(rad);
            const rdy = ndx * Math.sin(rad) + ndy * Math.cos(rad);
            this.createBullet(x, y, null as any, dmg, this.penetrateLevel, isCrit, rdx, rdy);
        }
        // 双发叠加：额外 +1 发追踪弹
        if (this.doubleShotChance > 0 && Math.random() < this.doubleShotChance) {
            this.createBullet(x, y, target, dmg, this.penetrateLevel, isCrit);
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
