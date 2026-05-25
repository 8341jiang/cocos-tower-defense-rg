import { _decorator, Component, Node, Color, Graphics } from 'cc';
import { GameBootstrap } from './GameBootstrap';
import { HALF_HEIGHT } from './ScreenConstants';
const { ccclass } = _decorator;

@ccclass('Enemy')
export class Enemy extends Component {

    hp: number = 100;
    maxHp: number = 100;
    speed: number = 80;
    reward: number = 10;
    exp: number = 15;
    alive: boolean = true;

    slowFactor: number = 1.0;
    slowTimer: number = 0;

    splitOnDeath: boolean = false;
    isSplitChild: boolean = false;

    hpBar: import('cc').Node | null = null;
    onDeath: ((e: Enemy) => void) | null = null;
    onEscape: ((e: Enemy) => void) | null = null;
    onDamage: ((dmg: number, isCrit: boolean, x: number, y: number) => void) | null = null;

    private _flashTimer: number = 0;
    private _isCritFlash: boolean = false;
    private _originalColor: Color = new Color(255, 255, 255);
    private _graphics: Graphics | null = null;
    private _size: number = 24;
    private _dying: boolean = false;
    private _deathAnimTimer: number = 0;

    /** 由 GameBootstrap 在创建时调用，传入初始颜色和尺寸 */
    initGraphics(color: Color, size: number) {
        this._originalColor = color.clone();
        this._graphics = this.node.getComponent(Graphics);
        this._size = size;
    }

    takeDamage(dmg: number, isCrit: boolean = false) {
        if (!this.alive) return;
        this.hp -= dmg;

        // 闪白/闪黄
        this._flashTimer = 0.08;
        this._isCritFlash = isCrit;
        if (this._graphics) {
            this._graphics.fillColor = isCrit ? new Color(255, 255, 100) : new Color(255, 255, 255);
            this._graphics.clear();
            const half = this._size / 2;
            this._graphics.rect(-half, -half, this._size, this._size);
            this._graphics.fill();
        }

        // 通知 GameBootstrap（暴击飘字）
        if (this.onDamage) {
            this.onDamage(dmg, isCrit, this.node.position.x, this.node.position.y);
        }

        // 更新血条
        if (this.hpBar && this.maxHp > 0) {
            const ratio = Math.max(0, this.hp / this.maxHp);
            this.hpBar.setScale(ratio, 1, 1);
        }

        if (this.hp <= 0) {
            this.hp = 0;
            this.alive = false;
            if (this.onDeath) this.onDeath(this);
            this.onDeath = null;
            this.onDamage = null;
            this._dying = true;
            this._deathAnimTimer = 0;
            // 隐藏血条
            if (this.hpBar && this.hpBar.parent) this.hpBar.parent.active = false;
        }
    }

    update(dt: number) {
        if (GameBootstrap.gamePaused) return;

        // 闪白恢复
        if (this._flashTimer > 0) {
            this._flashTimer -= dt;
            if (this._flashTimer <= 0) {
                this._flashTimer = 0;
                if (this._graphics && !this._dying) {
                    this._graphics.fillColor = this._originalColor;
                    this._graphics.clear();
                    const half = this._size / 2;
                    this._graphics.rect(-half, -half, this._size, this._size);
                    this._graphics.fill();
                }
            }
        }

        // 死亡缩放动画
        if (this._dying) {
            this._deathAnimTimer += dt;
            if (this._deathAnimTimer < 0.06) {
                const t = this._deathAnimTimer / 0.06;
                const s = 1 + 0.2 * t;
                this.node.setScale(s, s, 1);
            } else if (this._deathAnimTimer < 0.12) {
                const t = (this._deathAnimTimer - 0.06) / 0.06;
                const s = 1.2 * (1 - t);
                this.node.setScale(s, s, 1);
            } else {
                this.node.destroy();
                return;
            }
            // 死亡动画期间仍然移动
            if (this.alive) {
                // alive 已在 takeDamage 中设为 false，这里不执行移动
            }
            return;
        }

        if (!this.alive) return;

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

        if (this.node.position.y < -HALF_HEIGHT) {
            this.alive = false;
            if (this.onEscape) this.onEscape(this);
            this.node.destroy();
        }
    }
}
