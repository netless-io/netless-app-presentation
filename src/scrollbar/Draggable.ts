/**
 * 为指定的 DOM 元素添加四周 拖拽 的功能，并限制拖拽方法, x ,y。
 * @param element 目标元素（需要设置 position 为 absolute 或 relative）
 */
export interface DraggableOptions {
  direction: 'x' | 'y' | 'xy';
  onDragStart?: () => void;
  onDrag?: (transformedDrag: {x: number, y: number}) => void;
  onDragEnd?: (transformedDrag: {x: number, y: number}) => void;
}

export enum DragState {
  START = 1,
  DRAG = 2,
  END = 3,
}
export function makeDraggable(element:HTMLDivElement, options:DraggableOptions) {
  // 为目标元素添加 handle 节点
  let currentDragger: HTMLDivElement | null = null;
  let originalMouseX: number = 0;
  let originalMouseY: number = 0;
  const { onDragEnd, onDrag, onDragStart, direction='xy' } = options;

  const drag = (e: PointerEvent, state?: DragState) => {
    e.stopPropagation();
    if (!currentDragger) return;
    // 计算鼠标移动的原始向量
    let transformedDragX = 0;
    let transformedDragY = 0;
    if (direction === 'x') {
      transformedDragX = Math.round((e.pageX - originalMouseX));
    } else if (direction === 'y') {
      transformedDragY = Math.round((e.pageY - originalMouseY));
    } else {
      transformedDragX = Math.round((e.pageX - originalMouseX));
      transformedDragY = Math.round((e.pageY - originalMouseY));
    }
    if (state === DragState.END) {
      onDragEnd?.({x: transformedDragX, y: transformedDragY});
    } else {
      onDrag?.({x: transformedDragX, y: transformedDragY});
    }
  };

  element.addEventListener('pointerdown', bindDrag);

  function bindDrag(e: PointerEvent) {
    currentDragger = e.target as HTMLDivElement;
    e.stopPropagation();
    if (currentDragger !== element) {
      return;
    }
    originalMouseX = e.pageX;
    originalMouseY = e.pageY;
    element.addEventListener('pointermove', drag);
    document.body.addEventListener('pointerup', stopDrag);
    document.body.addEventListener('pointercancel', stopDrag);
    element.setPointerCapture(e.pointerId);
    onDragStart?.();
  }
  function removeEventListener() {
    currentDragger = null;
    element.removeEventListener('pointermove', drag);
    document.body.removeEventListener('pointerup', stopDrag);
    document.body.removeEventListener('pointercancel', stopDrag);
  }
  function stopDrag(e: PointerEvent): void {
    if (!currentDragger) return; // 如果已经停止，直接返回
    e.stopPropagation();
    drag(e, DragState.END);
    removeEventListener();
  }
  function destroy() {
    stop();
    element.removeEventListener('pointerdown', bindDrag);
  }
  function stop(): void {
    removeEventListener();
  }
  return { destroy };
}