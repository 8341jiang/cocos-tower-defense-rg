import { _decorator, Component, Color, Graphics } from 'cc';
import { Enemy } from './Enemy';
import { GameBootstrap } from './GameBootstrap';
const { ccclass } = _decorator;

@ccclass('Bullet')
export class Bullet extends Component {

    speed: number = 800;
    damage: number = 20;
    target: Enemy | null = null;

    penetrateCount: number = 0;
    isCrit: boolean = false;
    /** 穿透后无目标时的飞行方向 */
    dirX: number = 0;
    dirY: number = 0;
    hasDir: boolean = false;
    /** 已命中敌人集合，防止重复命中 */
    hitEnemies: Set<number> = new Set();
    /** 全部敌人引用（由 GameBootstrap 注入，用于穿透后寻找下一个目标） */
    allEnemies: Enemy[] = [];

    private _graphics: Graphics | null = null;
    private _lifetime: number = 0;

    start() {
        this._graphics = this.node.getComponent(Graphics);
    }

    update(dt: number) {
        if (GameBootstrap.gamePaused) return;
        this._lifetime += dt;

        // 防止子弹永存
        if (this._lifetime > 5) { this.node.destroy(); return; }

        // 目标丢失：穿透模式下用方向继续飞行，否则销毁
        if (!this.target || !this.target.node || !this.target.node.isValid) {
            if (this.hasDir) {
                this._flyDirection(dt);
                return;
            }
            this.node.destroy();
            return;
        }
        if (!this.target.alive) {
            if (this.hasDir) {
                this.target = null;
                this._flyDirection(dt);
                return;
            }
            this.node.destroy();
            return;
        }

        const p = this.node.position;
        const tp = this.target.node.position;
        const dx = tp.x - p.x;
        const dy = tp.y - p.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        // 命中判定
        if (dist < 10) {
            this._hitTarget();
            return;
        }

        // 飞向目标
        const move = this.speed * dt;
        this.node.setPosition(
            p.x + (dx / dist) * move,
            p.y + (dy / dist) * move,
            0
        );

        // 更新飞行方向（供穿透后使用）
        this.dirX = dx / dist;
        this.dirY = dy / dist;
        this.hasDir = true;
    }

    private _hitTarget() {
        const enemy = this.target!;
        const uid = enemy.node.uuid;
        this.hitEnemies.add(uid);
        enemy.takeDamage(this.damage, this.isCrit);

        if (this.penetrateCount > 0) {
            this.penetrateCount--;
            // 寻找下一个未命中的最近敌人
            const next = this._findNextTarget();
            if (next) {
                this.target = next;
                return;
            }
            // 无新目标，用方向继续飞行
            this.target = null;
            return;
        }
        this.node.destroy();
    }

    private _findNextTarget(): Enemy | null {
        const p = this.node.position;
        let best: Enemy | null = null;
        let bestDist = Infinity;
        for (const e of this.allEnemies) {
            if (!e || !e.alive || !e.node || !e.node.isValid) continue;
            if (this.hitEnemies.has(e.node.uuid)) continue;
            const ep = e.node.position;
            const dx = ep.x - p.x;
            const dy = ep.y - p.y;
            const d2 = dx * dx + dy * dy;
            if (d2 < bestDist) {
                bestDist = d2;
                best = e;
            }
        }
        return best;
    }

    private _flyDirection(dt: number) {
        const p = this.node.position;
        const move = this.speed * dt;
        this.node.setPosition(
            p.x + this.dirX * move,
            p.y + this.dirY * move,
            0
        );
        // 方向飞行时检测命中（散射/穿透子弹）
        for (const e of this.allEnemies) {
            if (!e || !e.alive || !e.node || !e.node.isValid) continue;
            if (this.hitEnemies.has(e.node.uuid)) continue;
            const ep = e.node.position;
            const dx = ep.x - this.node.position.x;
            const dy = ep.y - this.node.position.y;
            if (dx * dx + dy * dy < 100) {
                this.target = e;
                this._hitTarget();
                return;
            }
        }
        // 超出屏幕销毁
        const pos = this.node.position;
        if (pos.x < -400 || pos.x > 400 || pos.y < -700 || pos.y > 700) {
            this.node.destroy();
        }
    }
}
