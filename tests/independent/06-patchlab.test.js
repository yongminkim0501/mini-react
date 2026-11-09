import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { PatchLab } from '../../src/lab/lab.js';
import { observeChanges } from '../../src/lab/watcher.js';
import { containerToVNode, isEqual } from '../../src/vdom/index.js';
import { setupDOM } from './setup-dom.js';

const SAMPLE_HTML = `
  <!-- 로드 시 정규화되어야 하는 주석과 들여쓰기 -->
  <div class="card" id="profile">
    <h2>미니 리액트 연구소</h2>
    <p class="desc">Virtual DOM 을 <b>직접</b> 만들어 봅니다.</p>
    <ul class="todo">
      <li key="a">Virtual DOM 변환</li>
      <li key="b">Diff 알고리즘</li>
      <li key="c">Patch</li>
    </ul>
    <label class="field">이름 <input type="text" value="정글"></label>
    <label class="field"><input type="checkbox" checked> 동의</label>
    <textarea class="memo">초기 메모</textarea>
    <select class="lang">
      <option value="js" selected>JS</option>
      <option value="ts">TS</option>
    </select>
  </div>
`;

describe('06. PatchLab 통합 동작 (로드 → 편집 → Patch → 뒤로/앞으로 · 입력값 보존)', () => {
  let env;
  let realRoot;
  let testRoot;
  let lab;

  beforeEach(() => {
    env = setupDOM();
    realRoot = env.document.createElement('div');
    testRoot = env.document.createElement('div');
    realRoot.innerHTML = SAMPLE_HTML;
    env.document.body.append(realRoot, testRoot);

    lab = new PatchLab({ realRoot, testRoot });
    lab.init();
  });

  afterEach(() => {
    env.cleanup();
  });

  it('초기 로드 시 샘플 HTML을 정규화하여 실제 영역과 테스트 영역을 1:1 동일 상태로 맞추고 변경 없음 상태가 된다', () => {
    assert.deepEqual(lab.pendingOps(), []);
    assert.deepEqual(lab.state, {
      index: 0,
      length: 1,
      canBack: false,
      canForward: false,
    });
    assert.equal(lab.verify(), true);
    assert.equal(
      isEqual(containerToVNode(realRoot), containerToVNode(testRoot)),
      true,
    );
  });

  it('변경이 없을 때(그대로이거나 수정 후 원상복구했을 때) Patch는 아무 작업도 하지 않고 히스토리를 쌓지 않는다', () => {
    // 1) 아무 수정 없이 Patch
    const r0 = lab.patch();
    assert.equal(r0.changed, false);
    assert.deepEqual(r0.ops, []);
    assert.equal(lab.state.length, 1);

    // 2) 테스트 영역을 고쳤다가 다시 원래 글자로 되돌림
    const testH2 = testRoot.querySelector('h2');
    const originalTitle = testH2.textContent;
    testH2.textContent = '잠깐 바꾼 제목';
    assert.ok(lab.pendingOps().length > 0);

    testH2.textContent = originalTitle;
    assert.deepEqual(lab.pendingOps(), []);

    const r1 = lab.patch();
    assert.equal(r1.changed, false);
    assert.equal(lab.state.length, 1);
  });

  it('테스트 영역 편집 → Patch → 뒤로(back) / 앞으로(forward) / goTo 시 두 영역이 함께 이동한다', () => {
    const initialVNode = lab.current;
    const realCard = realRoot.querySelector('#profile');

    // Patch #1: 제목 변경
    testRoot.querySelector('h2').textContent = '1단계 제목';
    const p1 = lab.patch();
    assert.equal(p1.changed, true);
    assert.equal(p1.verified, true);
    assert.equal(p1.recovered, false);
    assert.equal(realRoot.querySelector('h2').textContent, '1단계 제목');
    // 카드 루트 DOM은 재생성되지 않고 그대로 재사용되어야 한다
    assert.equal(realRoot.querySelector('#profile'), realCard);
    const step1VNode = lab.current;

    // Patch #2: key 리스트 순서 변경 및 항목 추가
    const testUl = testRoot.querySelector('ul.todo');
    const liNew = env.document.createElement('li');
    liNew.setAttribute('key', 'd');
    liNew.textContent = 'State History';
    testUl.prepend(liNew);
    const p2 = lab.patch();
    assert.equal(p2.changed, true);
    assert.equal(p2.verified, true);
    assert.equal(p2.recovered, false);
    assert.equal(realRoot.querySelectorAll('ul.todo li').length, 4);
    const step2VNode = lab.current;

    // 테스트 영역에 아직 Patch 하지 않은 임시 낙서를 한 뒤 back()을 누르면
    // 임시 낙서는 버려지고 두 영역 모두 1단계로 일치해야 한다
    testRoot.querySelector('h2').textContent = '저장 안 한 낙서';
    const b1 = lab.back();
    assert.ok(b1);
    assert.equal(b1.verified, true);
    assert.equal(b1.recovered, false);
    assert.equal(isEqual(containerToVNode(realRoot), step1VNode), true);
    assert.equal(isEqual(containerToVNode(testRoot), step1VNode), true);
    assert.deepEqual(lab.pendingOps(), []);

    // 한 번 더 back() → 초기 상태
    const b2 = lab.back();
    assert.ok(b2);
    assert.equal(isEqual(containerToVNode(realRoot), initialVNode), true);
    assert.equal(isEqual(containerToVNode(testRoot), initialVNode), true);
    assert.equal(lab.back(), null);

    // forward() → 1단계, goTo(2) → 2단계
    lab.forward();
    assert.equal(realRoot.querySelector('h2').textContent, '1단계 제목');

    lab.goTo(2);
    assert.equal(isEqual(containerToVNode(realRoot), step2VNode), true);
    assert.equal(isEqual(containerToVNode(testRoot), step2VNode), true);
    assert.equal(lab.forward(), null);

    // 과거(1단계)로 돌아간 뒤 새 변경을 Patch 하면 기존 2단계 미래 기록은 폐기된다
    lab.back();
    testRoot.querySelector('h2').textContent = '분기된 새 2단계';
    lab.patch();
    assert.equal(lab.state.length, 3);
    assert.equal(lab.state.canForward, false);
    assert.equal(realRoot.querySelector('h2').textContent, '분기된 새 2단계');
  });

  it('실제 영역의 입력창(input, checkbox, textarea, select)에 사용자가 직접 입력한 값은 다른 요소를 Patch 해도 보존된다', () => {
    const realInput = realRoot.querySelector('input[type="text"]');
    const realCheckbox = realRoot.querySelector('input[type="checkbox"]');
    const realTextarea = realRoot.querySelector('textarea.memo');
    const realSelect = realRoot.querySelector('select.lang');

    // 사용자가 실제 영역의 폼 컨트롤들을 직접 조작함
    realInput.value = '사용자가 타이핑 중인 이름';
    realCheckbox.checked = false;
    realTextarea.value = '사용자가 작성 중인 긴 메모';
    realSelect.value = 'ts';

    // 테스트 영역에서는 폼이 아닌 제목(<h2>)과 설명(<p>)만 수정 후 Patch
    testRoot.querySelector('h2').textContent = '패치된 연구소 제목';
    const res = lab.patch();

    // 전체 재렌더링(recovered)으로 복구되면 입력값이 날아가므로 반드시 verified: true, recovered: false여야 한다!
    assert.equal(res.changed, true);
    assert.equal(res.verified, true, '실제 영역의 사용자 입력값 때문에 verify()가 실패해서는 안 됨');
    assert.equal(res.recovered, false, '전체 재렌더링 복구가 일어나면 안 됨');

    // DOM 노드 동일성 및 사용자가 입력해 둔 현재 프로퍼티 값 보존 확인
    assert.equal(realRoot.querySelector('input[type="text"]'), realInput);
    assert.equal(realInput.value, '사용자가 타이핑 중인 이름');
    assert.equal(realCheckbox.checked, false);
    assert.equal(realTextarea.value, '사용자가 작성 중인 긴 메모');
    assert.equal(realSelect.value, 'ts');
  });

  it('테스트 영역의 폼 요소 값(input, checkbox, textarea 비우기/채우기, select)을 바꾸고 Patch → 뒤로/앞으로 이동 시 실제 영역 화면 값도 정확히 따라간다', () => {
    const testInput = testRoot.querySelector('input[type="text"]');
    const testCheckbox = testRoot.querySelector('input[type="checkbox"]');
    const testTextarea = testRoot.querySelector('textarea.memo');
    const testSelect = testRoot.querySelector('select.lang');

    // 1차 Patch: 테스트 영역에서 폼 값들을 전부 변경 (특히 textarea는 빈 문자열로 비움)
    testInput.value = '새 이름';
    testCheckbox.checked = false;
    testTextarea.value = '';
    testSelect.value = 'ts';

    assert.ok(lab.pendingOps().length > 0);
    const p1 = lab.patch();
    assert.equal(p1.changed, true);
    assert.equal(p1.verified, true);
    assert.equal(p1.recovered, false);

    const realInput = realRoot.querySelector('input[type="text"]');
    const realCheckbox = realRoot.querySelector('input[type="checkbox"]');
    const realTextarea = realRoot.querySelector('textarea.memo');
    const realSelect = realRoot.querySelector('select.lang');

    assert.equal(realInput.value, '새 이름');
    assert.equal(realCheckbox.checked, false);
    assert.equal(realTextarea.value, '');
    assert.equal(realSelect.value, 'ts');

    // 뒤로 가기(back) 시 초기 폼 값('정글', checked=true, '초기 메모', 'js')으로 두 영역 모두 복원되어야 한다
    const b = lab.back();
    assert.equal(b.verified, true);
    assert.equal(b.recovered, false);
    assert.equal(realRoot.querySelector('input[type="text"]').value, '정글');
    assert.equal(realRoot.querySelector('input[type="checkbox"]').checked, true);
    assert.equal(realRoot.querySelector('textarea.memo').value, '초기 메모');
    assert.equal(realRoot.querySelector('select.lang').value, 'js');

    // 앞으로 가기(forward) 시 다시 1차 Patch 상태로 이동
    const f = lab.forward();
    assert.equal(f.verified, true);
    assert.equal(f.recovered, false);
    assert.equal(realRoot.querySelector('input[type="text"]').value, '새 이름');
    assert.equal(realRoot.querySelector('input[type="checkbox"]').checked, false);
    assert.equal(realRoot.querySelector('textarea.memo').value, '');
    assert.equal(realRoot.querySelector('select.lang').value, 'ts');
  });

  it('getSource()와 setSource()를 통한 HTML 코드 편집 후 Patch가 정상 동작한다', () => {
    const src = lab.getSource();
    assert.ok(src.includes('<h2>미니 리액트 연구소</h2>'));

    const edited = src.replace('미니 리액트 연구소', 'HTML 소스에서 바꾼 제목');
    lab.setSource(edited);
    assert.ok(lab.pendingOps().length > 0);

    const res = lab.patch();
    assert.equal(res.changed, true);
    assert.equal(res.verified, true);
    assert.equal(res.recovered, false);
    assert.equal(realRoot.querySelector('h2').textContent, 'HTML 소스에서 바꾼 제목');
  });

  it('observeChanges(MutationObserver 래퍼)가 하위 DOM 변경을 비동기로 감지하고 해제 함수 호출 후 중단된다', async () => {
    let callCount = 0;
    const stop = observeChanges(testRoot, () => {
      callCount++;
    });

    testRoot.querySelector('h2').textContent = '변경1';
    testRoot.querySelector('p').setAttribute('data-test', '1');
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));

    assert.equal(callCount, 1, '한 틱 내의 여러 DOM 변경은 마이크로태스크로 묶여 1회 호출되어야 함');

    stop();
    testRoot.querySelector('h2').textContent = '변경2';
    await new Promise((r) => setTimeout(r, 0));
    assert.equal(callCount, 1, 'stop() 호출 이후에는 콜백이 더 이상 호출되지 않아야 함');
  });

  it('테스트 영역(contenteditable)에서 Enter·복사 붙여넣기로 <li key="a">가 복제되어 중복 key가 생겨도 Patch 검증(verify)과 입력값 보존이 깨지지 않는다', () => {
    // 실제 영역 입력창에 사용자가 글을 작성 중
    const realInput = realRoot.querySelector('input[type="text"]');
    realInput.value = '날아가면 안 되는 사용자 입력';

    // 브라우저 contenteditable에서 <li key="a">에 커서를 두고 Enter를 치면 동일한 key="a"를 가진 <li>가 복제된다
    const testUl = testRoot.querySelector('ul.todo');
    const clonedLi = testUl.querySelector('li[key="a"]').cloneNode(true);
    clonedLi.textContent = '새로 줄바꿈한 할 일';
    testUl.insertBefore(clonedLi, testUl.children[1]);

    const res = lab.patch();
    assert.equal(res.changed, true);
    assert.equal(res.verified, true, '중복 key 때문에 verify()가 실패하여 복구 렌더링을 발동하면 안 됨');
    assert.equal(res.recovered, false, '불필요한 전체 재렌더링으로 복구되면 사용자 입력이 증발함');
    assert.equal(realInput.value, '날아가면 안 되는 사용자 입력');

    // 방금 Patch를 완료했으므로 추가 수정이 없다면 변경 대기 목록은 비어 있어야 한다
    assert.deepEqual(lab.pendingOps(), []);
    assert.equal(lab.patch().changed, false);
  });
});
