/**
 * CDP Test - Scan ALL pages for hidden Run buttons
 * Checks every Antigravity window for hidden buttons
 * 
 * Usage: node test_scripts/cdp_scan_all_pages.js
 */

const WebSocket = require('ws');
const http = require('http');

async function getPages() {
    return new Promise((resolve, reject) => {
        http.get('http://127.0.0.1:9000/json', (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const pages = JSON.parse(data).filter(p => p.type === 'page');
                    resolve(pages);
                } catch (e) {
                    reject(e);
                }
            });
        }).on('error', reject);
    });
}

async function scanPage(pageInfo) {
    return new Promise((resolve) => {
        const ws = new WebSocket(pageInfo.webSocketDebuggerUrl);
        let messageId = 1;
        const timeout = setTimeout(() => {
            ws.close();
            resolve({ pageId: pageInfo.id, title: pageInfo.title, error: 'Timeout' });
        }, 10000);

        const send = (method, params = {}) => {
            return new Promise((res, rej) => {
                const id = messageId++;
                const handler = (data) => {
                    const msg = JSON.parse(data.toString());
                    if (msg.id === id) {
                        ws.off('message', handler);
                        if (msg.error) rej(new Error(msg.error.message));
                        else res(msg.result);
                    }
                };
                ws.on('message', handler);
                ws.send(JSON.stringify({ id, method, params }));
            });
        };

        ws.on('open', async () => {
            try {
                await send('Runtime.enable');

                const script = `
                    (function() {
                        function getDocuments(root = document) {
                            let docs = [root];
                            try {
                                const iframes = root.querySelectorAll('iframe, frame');
                                for (const iframe of iframes) {
                                    try {
                                        const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
                                        if (iframeDoc) docs.push(...getDocuments(iframeDoc));
                                    } catch (e) { }
                                }
                            } catch (e) { }
                            return docs;
                        }
                        
                        const REJECT = ['skip', 'reject', 'cancel', 'close', 'refine', 'always'];
                        const ACCEPT = ['run', 'accept', 'retry', 'apply', 'execute', 'confirm'];
                        
                        const results = { visible: [], hidden: [] };
                        const docs = getDocuments();
                        const selectors = ['.bg-ide-button-background', 'button.cursor-pointer', '.bg-primary button'];
                        
                        for (const doc of docs) {
                            const win = doc.defaultView || window;
                            const vw = win.innerWidth || 1920;
                            const vh = win.innerHeight || 1080;
                            
                            for (const selector of selectors) {
                                try {
                                    const els = doc.querySelectorAll(selector);
                                    for (const el of els) {
                                        const text = (el.textContent || '').trim();
                                        const lt = text.toLowerCase();
                                        if (!text || REJECT.some(p => lt.includes(p))) continue;
                                        if (!ACCEPT.some(p => lt.includes(p))) continue;
                                        
                                        const rect = el.getBoundingClientRect();
                                        const inView = rect.bottom > 0 && rect.top < vh && rect.right > 0 && rect.left < vw;
                                        const hasSize = rect.width > 0 && rect.height > 0;
                                        
                                        const info = {
                                            text: text.substring(0, 30),
                                            pos: '(' + Math.round(rect.x) + ',' + Math.round(rect.y) + ')',
                                            size: Math.round(rect.width) + 'x' + Math.round(rect.height),
                                            viewport: vw + 'x' + vh
                                        };
                                        
                                        if (hasSize && !inView) {
                                            results.hidden.push(info);
                                        } else if (hasSize && inView) {
                                            results.visible.push(info);
                                        }
                                    }
                                } catch (e) { }
                            }
                        }
                        return results;
                    })()
                `;

                const result = await send('Runtime.evaluate', { expression: script, returnByValue: true });
                clearTimeout(timeout);
                ws.close();
                resolve({
                    pageId: pageInfo.id,
                    title: pageInfo.title,
                    visible: result.result.value.visible,
                    hidden: result.result.value.hidden
                });
            } catch (err) {
                clearTimeout(timeout);
                ws.close();
                resolve({ pageId: pageInfo.id, title: pageInfo.title, error: err.message });
            }
        });

        ws.on('error', (err) => {
            clearTimeout(timeout);
            resolve({ pageId: pageInfo.id, title: pageInfo.title, error: err.message });
        });
    });
}

async function main() {
    console.log('=== Scanning ALL Antigravity Pages for Hidden Buttons ===\n');

    try {
        const pages = await getPages();
        console.log('Found', pages.length, 'pages\n');

        for (const page of pages) {
            console.log('---');
            console.log('Page:', page.title || '(untitled)');
            console.log('ID:', page.id);

            const result = await scanPage(page);

            if (result.error) {
                console.log('Error:', result.error);
            } else {
                console.log('Visible buttons:', result.visible.length);
                result.visible.forEach(b => console.log('  ✅', b.text, 'at', b.pos));

                console.log('Hidden buttons:', result.hidden.length);
                result.hidden.forEach(b => {
                    console.log('  ⚠️  HIDDEN:', b.text, 'at', b.pos, '(viewport:', b.viewport + ')');
                });
            }
            console.log('');
        }

    } catch (err) {
        console.error('Error:', err.message);
    }
}

main();
