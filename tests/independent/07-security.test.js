import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  h,
  fragment,
  htmlToVNode,
  containerToVNode,
  createDOM,
  render,
  diff,
  patch,
  isSafeAttribute,
} from '../../src/vdom/index.js';
import { PatchLab } from '../../src/lab/lab.js';
import { setupDOM } from './setup-dom.js';

describe('07. 보안 검증 (<script>, on* 이벤트 핸들러, srcdoc, javascript:/vbscript: URL 차단)', () => {
  let env;

  beforeEach(() => {
    env = setupDOM();
    env.window.__xssExecuted = false;
  });

  afterEach(() => {
    env.cleanup();
  });

  describe('<script> 태그 차단 및 무력화', () => {
    it('htmlToVNode 및 containerToVNode에서 대소문자·중첩·SVG 내부 <script>를 모두 제거하고 파싱 중 실행하지 않는다', () => {
      const maliciousHTML = `
        <div class="safe">
          <script>window.__xssExecuted = true;</script>
          <SCRIPT src="https://evil.example/payload.js"></SCRIPT>
          <p>안전한 텍스트<script>alert(1)</script></p>
          <svg viewBox="0 0 10 10"><script>window.__xssExecuted = true;</script><circle cx="5" cy="5" r="4"/></svg>
        </div>
      `;

      const v = htmlToVNode(maliciousHTML);
      assert.equal(env.window.__xssExecuted, false);

      const container = env.document.createElement('div');
      render(v, container);
      assert.equal(container.querySelectorAll('script').length, 0);
      assert.equal(container.querySelector('p').textContent, '안전한 텍스트');
      assert.ok(container.querySelector('circle'));
    });

    it('수동으로 h("script") VNode를 만들어 createDOM에 넘겨도 실행되지 않도록 방어된다', () => {
      const v = h('script', null, 'window.__xssExecuted = true;');
      const el = createDOM(v);
      env.document.body.appendChild(el);

      assert.equal(env.window.__xssExecuted, false);
      // type="text/plain" 처리 등으로 실행 차단 확인
      assert.notEqual(el.getAttribute('type') ?? '', 'text/javascript');
    });
  });

  describe('인라인 이벤트 핸들러(on*) 및 srcdoc 차단', () => {
    it('모든 대소문자 조합의 on* 속성(onerror, onclick, onload, onmouseover, onfocus, SVG onbegin 등)을 차단한다', () => {
      const html = `
        <img src="x" onerror="window.__xssExecuted=true" ONLOAD="alert(1)" alt="이미지">
        <button OnClick="evil()" onmouseover="evil()" onfocus="evil()" type="button">버튼</button>
        <iframe srcdoc="<script>alert(1)</script>" SRCDOC="evil"></iframe>
        <svg><animate onbegin="alert(1)" attributeName="x"/></svg>
      `;
      const v = htmlToVNode(html);
      const container = env.document.createElement('div');
      render(v, container);

      const img = container.querySelector('img');
      const btn = container.querySelector('button');
      const iframe = container.querySelector('iframe');
      const animate = container.querySelector('animate');

      assert.equal(img.hasAttribute('onerror'), false);
      assert.equal(img.hasAttribute('onload'), false);
      assert.equal(img.getAttribute('alt'), '이미지');

      assert.equal(btn.hasAttribute('onclick'), false);
      assert.equal(btn.hasAttribute('onmouseover'), false);
      assert.equal(btn.hasAttribute('onfocus'), false);

      assert.equal(iframe.hasAttribute('srcdoc'), false);
      assert.equal(animate.hasAttribute('onbegin'), false);
    });

    it('VNode에 강제로 on* 속성을 넣어 createDOM이나 patch(PROPS)를 호출해도 실제 DOM에는 반영되지 않는다', () => {
      const container = env.document.createElement('div');
      const t1 = fragment([h('div', { id: 'box', onclick: 'alert(1)' }, '내용')]);
      render(t1, container);
      const box = container.firstChild;
      assert.equal(box.hasAttribute('onclick'), false);

      const t2 = fragment([h('div', { id: 'box', onerror: 'alert(2)', 'data-ok': 'yes' }, '내용')]);
      patch(container, diff(t1, t2));
      assert.equal(box.hasAttribute('onerror'), false);
      assert.equal(box.getAttribute('data-ok'), 'yes');
    });

    it('숫자나 기호가 섞인 비표준 on* 이벤트명이나 isSafeAttribute 직접 호출도 점검한다', () => {
      assert.equal(isSafeAttribute('onclick', 'alert(1)'), false);
      assert.equal(isSafeAttribute('ONERROR', 'alert(1)'), false);
      assert.equal(isSafeAttribute('srcdoc', '<p>hi</p>'), false);
      assert.equal(isSafeAttribute('data-onclick', 'safe'), true);
    });
  });

  describe('javascript: 및 vbscript: 스킴 URL 우회 시도 차단', () => {
    it('공백·탭·줄바꿈·제어문자·대소문자·HTML 엔티티로 난독화된 javascript: 및 vbscript: URL을 모두 차단한다', () => {
      const html = `
        <a id="a1" href="javascript:alert(1)">1</a>
        <a id="a2" href="JaVaScRiPt:alert(1)">2</a>
        <a id="a3" href="   javascript:alert(1)">3</a>
        <a id="a4" href="java\t\n\rscript:alert(1)">4</a>
        <a id="a5" href="&#106;avascript:alert(1)">5</a>
        <a id="a6" href="java&#x09;script:alert(1)">6</a>
        <a id="a7" href="vbscript:msgbox(1)">7</a>
        <form id="f1" action="javascript:alert(1)">
          <button id="b1" formaction="  javascript:alert(1)">제출</button>
        </form>
        <iframe id="i1" src="javascript:alert(1)"></iframe>
        <object id="o1" data="javascript:alert(1)"></object>
        <video id="v1" poster="javascript:alert(1)"></video>
        <svg><a id="s1" xlink:href="javascript:alert(1)" href="javascript:alert(1)"><text>링크</text></a></svg>
      `;

      const v = htmlToVNode(html);
      const container = env.document.createElement('div');
      render(v, container);

      for (const id of ['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7', 's1']) {
        const el = container.querySelector(`#${id}`);
        assert.equal(el.hasAttribute('href'), false, `#${id}의 위험한 href가 제거되지 않음`);
        assert.equal(el.hasAttribute('xlink:href'), false, `#${id}의 위험한 xlink:href가 제거되지 않음`);
      }
      assert.equal(container.querySelector('#f1').hasAttribute('action'), false);
      assert.equal(container.querySelector('#b1').hasAttribute('formaction'), false);
      assert.equal(container.querySelector('#i1').hasAttribute('src'), false);
      assert.equal(container.querySelector('#o1').hasAttribute('data'), false);
      assert.equal(container.querySelector('#v1').hasAttribute('poster'), false);
    });

    it('정상적인 https:, mailto:, 상대 경로 URL과 일반 data-* 속성 내의 "javascript:" 문자열은 오탐 없이 허용한다', () => {
      const html = `
        <a href="https://react.dev/learn?topic=javascript:basics" data-note="javascript: 스킴 주의">공식 문서</a>
        <a href="/docs/intro#section">내부 링크</a>
        <a href="mailto:test@example.com">메일</a>
      `;
      const v = htmlToVNode(html);
      assert.equal(v.children[0].props.href, 'https://react.dev/learn?topic=javascript:basics');
      assert.equal(v.children[0].props['data-note'], 'javascript: 스킴 주의');
      assert.equal(v.children[1].props.href, '/docs/intro#section');
      assert.equal(v.children[2].props.href, 'mailto:test@example.com');
    });

    it('PatchLab 테스트 영역에 악성 HTML을 직접 주입하거나 setSource로 넣은 뒤 Patch 해도 실제 영역에는 절대 반영·실행되지 않는다', () => {
      const realRoot = env.document.createElement('div');
      const testRoot = env.document.createElement('div');
      realRoot.innerHTML = '<div class="box"><p>초기 안전한 문장</p></div>';
      env.document.body.append(realRoot, testRoot);

      const lab = new PatchLab({ realRoot, testRoot });
      lab.init();

      // 1) setSource를 통한 공격 페이로드 입력
      lab.setSource(`
        <div class="box">
          <p onclick="window.__xssExecuted=true">수정된 문장</p>
          <img src="x" onerror="window.__xssExecuted=true">
          <a href="javascript:window.__xssExecuted=true">악성 링크</a>
          <script>window.__xssExecuted = true;</script>
        </div>
      `);
      const res1 = lab.patch();
      assert.equal(env.window.__xssExecuted, false);
      assert.equal(res1.verified, true);
      assert.equal(res1.recovered, false);
      assert.equal(realRoot.querySelectorAll('script').length, 0);
      assert.equal(realRoot.querySelector('p').hasAttribute('onclick'), false);
      assert.equal(realRoot.querySelector('img').hasAttribute('onerror'), false);
      assert.equal(realRoot.querySelector('a').hasAttribute('href'), false);

      // 2) 테스트 영역 DOM에 직접 위험 속성을 주입한 뒤 Patch
      testRoot.querySelector('a').setAttribute('href', '  JaVaScRiPt:alert(1)');
      testRoot.querySelector('p').setAttribute('onmouseover', 'alert(1)');
      const evilScript = env.document.createElement('script');
      evilScript.textContent = 'window.__xssExecuted = true;';
      testRoot.querySelector('.box').appendChild(evilScript);

      const res2 = lab.patch();
      // 위험 요소·속성은 모두 정화되므로 실제 영역에는 아무 변화도 없어야 한다
      assert.equal(res2.changed, false);
      assert.equal(realRoot.querySelectorAll('script').length, 0);
      assert.equal(realRoot.querySelector('a').hasAttribute('href'), false);
      assert.equal(realRoot.querySelector('p').hasAttribute('onmouseover'), false);
    });
  });
});
