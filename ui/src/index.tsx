/**
 * The Files view, which fills the app's tab: the folders the person gave
 * the app as a tree, and a preview of the file picked in it.
 */
import { createRoot } from 'react-dom/client';
import { App, PostMessageTransport } from '@modelcontextprotocol/ext-apps';
import { Files } from './Files.tsx';
import { Host } from './host.ts';
import sheet from './ui.css?inline';

const style = document.createElement('style');
style.textContent = sheet;
document.head.append(style);

const app = new App({ name: 'Files', version: '1.1.0' }, {}, { autoResize: false });
const host = new Host(app);
await app.connect(new PostMessageTransport(window.parent, window.parent));

const root = document.createElement('div');
root.className = 'files-root';
document.body.append(root);
createRoot(root).render(<Files host={host} />);
