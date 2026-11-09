import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { History } from '../../src/vdom/index.js';

describe('05. State History (back, forward, goTo, 분기 폐기, 양 끝 경계, limit)', () => {
  it('초기 생성 상태와 entries 방어적 복사(불변성)를 보장한다', () => {
    const h = new History('s0');
    assert.equal(h.current, 's0');
    assert.equal(h.index, 0);
    assert.equal(h.length, 1);
    assert.equal(h.canBack, false);
    assert.equal(h.canForward, false);
    assert.deepEqual(h.entries, ['s0']);

    // 외부에서 반환된 entries 배열을 변조해도 내부 상태는 오염되지 않아야 한다
    const leaked = h.entries;
    leaked.push('hacked');
    assert.equal(h.length, 1);
    assert.deepEqual(h.entries, ['s0']);
  });

  it('push → back → forward 이동과 양 끝 경계(null 반환)가 정확히 동작한다', () => {
    const h = new History('s0');
    assert.equal(h.back(), null);
    assert.equal(h.forward(), null);

    assert.equal(h.push('s1'), 's1');
    assert.equal(h.push('s2'), 's2');
    assert.equal(h.index, 2);
    assert.equal(h.length, 3);
    assert.equal(h.canBack, true);
    assert.equal(h.canForward, false);

    assert.equal(h.back(), 's1');
    assert.equal(h.current, 's1');
    assert.equal(h.canBack, true);
    assert.equal(h.canForward, true);

    assert.equal(h.back(), 's0');
    assert.equal(h.current, 's0');
    assert.equal(h.canBack, false);
    assert.equal(h.canForward, true);

    // 맨 앞 경계에서 추가 back()은 null이고 위치 유지
    assert.equal(h.back(), null);
    assert.equal(h.index, 0);
    assert.equal(h.current, 's0');

    assert.equal(h.forward(), 's1');
    assert.equal(h.forward(), 's2');
    assert.equal(h.canForward, false);

    // 맨 뒤 경계에서 추가 forward()는 null이고 위치 유지
    assert.equal(h.forward(), null);
    assert.equal(h.index, 2);
    assert.equal(h.current, 's2');
  });

  it('과거 시점으로 돌아간 뒤 새로 push 하면 앞쪽(미래) 기록을 전부 폐기한다', () => {
    const h = new History('s0');
    h.push('s1');
    h.push('s2');
    h.push('s3');

    h.back(); // s2
    h.back(); // s1
    assert.equal(h.current, 's1');

    h.push('s2-new');
    assert.deepEqual(h.entries, ['s0', 's1', 's2-new']);
    assert.equal(h.index, 2);
    assert.equal(h.length, 3);
    assert.equal(h.canForward, false);
    assert.equal(h.forward(), null);
  });

  it('goTo(index)는 유효한 인덱스로 즉시 이동하며, 범위 밖이나 정수가 아닌 값에는 RangeError를 던진다', () => {
    const h = new History('s0');
    h.push('s1');
    h.push('s2');

    assert.equal(h.goTo(0), 's0');
    assert.equal(h.index, 0);
    assert.equal(h.goTo(2), 's2');
    assert.equal(h.index, 2);

    for (const bad of [-1, 3, 99, 1.5, NaN, Infinity, -Infinity, '1', null, undefined]) {
      assert.throws(() => h.goTo(bad), RangeError, `잘못된 인덱스 ${String(bad)}에서 RangeError가 발생해야 함`);
    }
  });

  it('limit 옵션: 최대 개수를 초과하면 가장 오래된 기록부터 버리고, 0 이하의 limit은 거부한다', () => {
    assert.throws(() => new History('init', { limit: 0 }), RangeError);
    assert.throws(() => new History('init', { limit: -3 }), RangeError);

    // limit = 1 경계값
    const single = new History('a', { limit: 1 });
    single.push('b');
    assert.deepEqual(single.entries, ['b']);
    assert.equal(single.index, 0);
    assert.equal(single.canBack, false);

    // limit = 3 슬라이딩 윈도우
    const h = new History('s0', { limit: 3 });
    h.push('s1');
    h.push('s2');
    assert.deepEqual(h.entries, ['s0', 's1', 's2']);

    h.push('s3');
    assert.deepEqual(h.entries, ['s1', 's2', 's3']);
    assert.equal(h.index, 2);
    assert.equal(h.current, 's3');

    // limit 상태에서 뒤로 간 뒤 push 할 때는 미래 기록이 먼저 지워지므로 오래된 기록이 불필요하게 밀려나지 않는다
    h.back(); // s2 (index 1)
    h.push('s3-alt');
    assert.deepEqual(h.entries, ['s1', 's2', 's3-alt']);
    assert.equal(h.index, 2);
  });

  it('limit 옵션에 NaN이나 정수가 아닌 소수(1.5)를 전달하면 RangeError를 던진다', () => {
    assert.throws(() => new History('init', { limit: NaN }), RangeError, 'NaN limit은 RangeError를 던져야 함');
    assert.throws(() => new History('init', { limit: 1.5 }), RangeError, '소수 limit은 RangeError를 던져야 함');
  });

  it('null이나 undefined를 유효한 상태 값으로 저장했을 때도 back/forward 반환값과 경계(null)를 구분하거나 상태가 이동하는지 검증', () => {
    const h = new History(null);
    h.push('next');
    assert.equal(h.canBack, true);
    const prev = h.back();
    assert.equal(prev, null);
    assert.equal(h.index, 0);
    assert.equal(h.current, null);
  });
});
