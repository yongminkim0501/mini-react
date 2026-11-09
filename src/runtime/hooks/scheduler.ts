import type { HookHost } from '../hookRuntime';

const scheduled = new WeakSet<HookHost>();

/**
 * 업데이트를 예약한다. 이미 예약되어 있으면 아무것도 하지 않는다.
 * 한 번의 이벤트에서 setState를 여러 번 불러도 렌더링은 한 번이다.
 * 마이크로태스크는 현재 이벤트 처리가 끝난 직후, 화면을 그리기 전에 실행된다.
 */
export function scheduleUpdate(component: HookHost): void {
  if (scheduled.has(component)) return;
  scheduled.add(component);
  queueMicrotask(() => {
    scheduled.delete(component);
    component.update();
  });
}
