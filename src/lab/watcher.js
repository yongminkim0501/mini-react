/**
 * MutationObserver 로 DOM 변화를 "감지"한다.
 *
 * 브라우저가 DOM 이 바뀐 시점에 알려주므로 다음 상황을 모두 한 곳에서 잡을 수 있다.
 *   - 사용자가 contenteditable 에 타이핑 (input 이벤트가 발생)
 *   - 스크립트가 DOM 을 직접 수정 (input 이벤트가 발생하지 않음 ← 이벤트 리스너로는 놓친다)
 *   - 붙여넣기, 드래그, 실행 취소(Ctrl+Z) 등
 *
 * 콜백은 마이크로태스크로 "묶여서" 호출된다. 한 번에 수십 번 바뀌어도 콜백은 한 번이다.
 * 이 묶음 처리 덕분에, 변경마다 diff 를 돌려도 비용이 문제되지 않는다.
 *
 * @param {Node} root 감시할 DOM
 * @param {(records: MutationRecord[]) => void} callback
 * @returns {() => void} 감시 중단 함수
 */
export function observeChanges(root, callback) {
  const observer = new MutationObserver((records) => callback(records));
  observer.observe(root, {
    childList: true, //     자식 추가/삭제
    attributes: true, //    속성 변경
    characterData: true, // 텍스트 내용 변경
    subtree: true, //       하위 전체
  });
  return () => observer.disconnect();
}
