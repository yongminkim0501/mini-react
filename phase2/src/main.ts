import { FunctionComponent } from '../../src/runtime';
import { App, HOOK_LABELS } from './App';
import { createDebugPanel } from './debug';

const container = document.getElementById('app');
const debugRoot = document.getElementById('debug');
if (!container || !debugRoot) throw new Error('#app 또는 #debug 요소가 없습니다');

const app = new FunctionComponent(App, container);
const debug = createDebugPanel(debugRoot, app, HOOK_LABELS);
app.onCommit = (patches) => debug.record(patches);
app.mount();
