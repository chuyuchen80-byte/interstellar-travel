// 输入管理：指针锁定 + 键盘 + 鼠标增量
export interface Actions {
  fire: boolean;
  boost: boolean;
}

export class Controls {
  keys = new Set<string>();
  mouseDX = 0;
  mouseDY = 0;
  locked = false;
  private fireHeld = false;

  constructor(
    private canvas: HTMLCanvasElement,
    private onLockChange: (locked: boolean) => void,
  ) {
    canvas.addEventListener('mousedown', (e) => {
      e.preventDefault(); // 阻止拖拽选择/手势
      if (this.locked && e.button === 0) this.fireHeld = true; // 仅左键射击
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.fireHeld = false;
    });
    // 阻止右键菜单与拖动手势
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('dragstart', (e) => e.preventDefault());
    window.addEventListener('mousemove', (e) => {
      if (this.locked) {
        this.mouseDX += e.movementX;
        this.mouseDY += e.movementY;
      }
    });
    window.addEventListener('keydown', (e) => {
      this.keys.add(e.code);
      if (e.code === 'Space') e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      this.fireHeld = false;
      this.onLockChange(this.locked);
    });
    canvas.addEventListener('click', () => {
      if (!this.locked) this.lock();
    });
  }

  lock() {
    this.canvas.requestPointerLock();
  }

  unlock() {
    document.exitPointerLock();
  }

  consumeMouse(): { dx: number; dy: number } {
    const dx = this.mouseDX;
    const dy = this.mouseDY;
    this.mouseDX = 0;
    this.mouseDY = 0;
    return { dx, dy };
  }

  isDown(code: string): boolean {
    return this.keys.has(code);
  }

  get actions(): Actions {
    return {
      fire: this.fireHeld,
      boost: this.isDown('ShiftLeft') || this.isDown('ShiftRight'),
    };
  }
}
