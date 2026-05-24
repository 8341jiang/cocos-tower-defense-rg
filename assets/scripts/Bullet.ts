import { _decorator, Component } from 'cc';
import { Enemy } from './Enemy';
import { GameBootstrap } from './GameBootstrap';
const { ccclass } = _decorator;

/**
 * Bullet — 子弹组件
 * 飞向目标敌人，命中扣血，目标死亡则子弹消失
 * 由 GameBootstrap 自动创建，不需要手动配置
 */
@ccclass('Bullet')
export class Bullet extends Component {

    speed: number = 400;
    damage: number = 20;
    target: Enemy | null = null;

    update(dt: number) {
        if (GameBootstrap.gamePaused) return;
        if (!this.target || !this.target.alive || !this.target.node.isValid) {
            this.node.destroy();
            return;
        }

        const p = this.node.position;
        const tp = this.target.node.position;
        const dx = tp.x - p.x;
        const dy = tp.y - p.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        // 命中判定（距离 < 10像素）
        if (dist < 10) {
            this.target.takeDamage(this.damage);
            this.node.destroy();
            return;
        }

        // 飞向目标
        const move = this.speed * dt;
        this.node.setPosition(
            p.x + (dx / dist) * move,
            p.y + (dy / dist) * move,
            0
        );
    }
}
