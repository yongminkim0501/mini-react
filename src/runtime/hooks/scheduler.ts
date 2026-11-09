import type { HookHost } from '../hookRuntime';

const scheduled = new WeakSet<HookHost>();

/** 이벤트 루프로 돌아가지 않고 이어지는 업데이트 한도. deps 없는 effect 안의 setState 같은 무한 렌더링을 끊는다. */
export const MAX_CHAINED_UPDATES = 100;
const chains = new WeakMap<HookHost, number>();

/**
 * 업데이트를 예약한다. 이미 예약되어 있으면 아무것도 하지 않는다.
 * 한 번의 이벤트에서 setState를 여러 번 불러도 렌더링은 한 번이다.
 * 마이크로태스크는 현재 이벤트 처리가 끝난 직후, 화면을 그리기 전에 실행된다.
 */
export function scheduleUpdate(component: HookHost): void {
  if (scheduled.has(component)) return;

  // 마이크로태스크끼리 이어지는 동안에는 setTimeout이 실행되지 않으므로 횟수가 계속 쌓인다.
  const count = (chains.get(component) ?? 0) + 1;
  if (count > MAX_CHAINED_UPDATES) {
    console.error(
      `[FunctionComponent] 렌더링이 연속 ${MAX_CHAINED_UPDATES}회를 넘어 중단합니다. useEffect 안에서 setState를 부르면 의존성 배열을 확인하세요.`,
    );
    return;
  }
  if (count === 1) setTimeout(() => chains.delete(component), 0);
  chains.set(component, count);

  scheduled.add(component);
  queueMicrotask(() => {
    scheduled.delete(component);
    component.update();
  });
}
