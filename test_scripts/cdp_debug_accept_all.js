// Quick check: is Auto Accept injected and running?
const WebSocket = require('ws');
const http = require('http');

http.get('http://127.0.0.1:9000/json', (res) => {
    let data = '';
    res.on('data', c => data += c);
    res.on('end', async () => {
        const pages = JSON.parse(data).filter(p => p.type === 'page');
        console.log(`Found ${pages.length} pages\n`);

        for (const page of pages) {
            console.log(`--- ${page.title} ---`);
            try {
                const result = await evalOnPage(page, `JSON.stringify({
                    hasState: !!window.__autoAcceptState,
                    isRunning: window.__autoAcceptState ? window.__autoAcceptState.isRunning : false,
                    mode: window.__autoAcceptState ? window.__autoAcceptState.currentMode : 'N/A',
                    autoAcceptFileEdits: window.__autoAcceptState ? window.__autoAcceptState.autoAcceptFileEdits : 'N/A',
                    sid: window.__autoAcceptState ? window.__autoAcceptState.sessionID : 0,
                    bgMode: window.__autoAcceptState ? window.__autoAcceptState.isBackgroundMode : false,
                    badges: (function() { var c = 0; document.querySelectorAll('span').forEach(function(s) { var t = s.textContent.trim(); if (t === 'Good' || t === 'Bad') c++; }); return c; })(),
                    acceptBtns: document.querySelectorAll('.bg-ide-button-background').length,
                    viewport: [window.innerWidth, window.innerHeight]
                })`);
                const r = JSON.parse(result);
                console.log(`  State injected: ${r.hasState}`);
                console.log(`  isRunning: ${r.isRunning}`);
                console.log(`  Mode: ${r.mode}`);
                console.log(`  autoAcceptFileEdits: ${r.autoAcceptFileEdits}`);
                console.log(`  SessionID: ${r.sid}`);
                console.log(`  Background: ${r.bgMode}`);
                console.log(`  Good/Bad badges: ${r.badges}`);
                console.log(`  .bg-ide-button-background count: ${r.acceptBtns}`);
                console.log(`  Viewport: ${r.viewport[0]}x${r.viewport[1]}`);
            } catch (e) {
                console.log(`  Error: ${e.message}`);
            }
            console.log('');
        }
        process.exit(0);
    });
}).on('error', e => { console.log('HTTP error:', e.message); process.exit(1); });

function evalOnPage(pageInfo, expr) {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => { reject(new Error('TIMEOUT')); try { ws.close(); } catch (e) { } }, 4000);
        var ws = new WebSocket(pageInfo.webSocketDebuggerUrl);
        ws.on('error', (e) => { clearTimeout(timeout); reject(e); });
        ws.on('open', () => {
            ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: expr, returnByValue: true } }));
            ws.on('message', (d) => {
                var msg = JSON.parse(d.toString());
                if (msg.id === 1) {
                    clearTimeout(timeout);
                    ws.close();
                    if (msg.error) reject(new Error(msg.error.message));
                    else resolve(msg.result.result.value);
                }
            });
        });
    });
}
