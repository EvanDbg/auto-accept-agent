/**
 * CDP - Detailed Run button visibility analysis
 */
const WebSocket = require('ws');

const PAGE_ID = '6F751FF5305B8D4731F3CE79842A0FAA';
const ws = new WebSocket(`ws://127.0.0.1:9000/devtools/page/${PAGE_ID}`);
let id = 1;

const send = (m, p = {}) => new Promise((res, rej) => {
    const i = id++;
    const t = setTimeout(() => rej('timeout'), 10000);
    const handler = d => {
        const msg = JSON.parse(d.toString());
        if (msg.id === i) {
            clearTimeout(t);
            ws.off('message', handler);
            res(msg.result);
        }
    };
    ws.on('message', handler);
    ws.send(JSON.stringify({ id: i, method: m, params: p }));
});

ws.on('open', async () => {
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
            
            const results = [];
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
                            const text = (el.textContent || '').trim().toLowerCase();
                            if (!text.includes('run')) continue;
                            if (text.includes('always')) continue;
                            
                            const rect = el.getBoundingClientRect();
                            const style = doc.defaultView.getComputedStyle(el);
                            
                            // 计算可见比例
                            const visibleTop = Math.max(0, rect.top);
                            const visibleBottom = Math.min(vh, rect.bottom);
                            const visibleLeft = Math.max(0, rect.left);
                            const visibleRight = Math.min(vw, rect.right);
                            const visibleHeight = Math.max(0, visibleBottom - visibleTop);
                            const visibleWidth = Math.max(0, visibleRight - visibleLeft);
                            const visibleArea = visibleWidth * visibleHeight;
                            const totalArea = rect.width * rect.height;
                            const visibleRatio = totalArea > 0 ? (visibleArea / totalArea * 100).toFixed(1) : 0;
                            
                            results.push({
                                text: (el.textContent || '').trim(),
                                rect: {
                                    top: Math.round(rect.top),
                                    bottom: Math.round(rect.bottom),
                                    left: Math.round(rect.left),
                                    right: Math.round(rect.right),
                                    width: Math.round(rect.width),
                                    height: Math.round(rect.height)
                                },
                                viewport: { width: vw, height: vh },
                                visibleRatio: visibleRatio + '%',
                                visibility: style.visibility,
                                display: style.display,
                                opacity: style.opacity,
                                pointerEvents: style.pointerEvents,
                                disabled: el.disabled,
                                isInViewport: rect.bottom > 0 && rect.top < vh && rect.right > 0 && rect.left < vw
                            });
                        }
                    } catch(e) {}
                }
            }
            return results;
        })()
    `;

    const r = await send('Runtime.evaluate', { expression: script, returnByValue: true });

    console.log('=== Run Button Visibility Analysis ===\n');
    const buttons = r.result.value;

    for (const btn of buttons) {
        console.log('Button:', btn.text);
        console.log('  Rect: top=' + btn.rect.top + ', bottom=' + btn.rect.bottom + ', left=' + btn.rect.left + ', right=' + btn.rect.right);
        console.log('  Size:', btn.rect.width + 'x' + btn.rect.height);
        console.log('  Viewport:', btn.viewport.width + 'x' + btn.viewport.height);
        console.log('  Visible Ratio:', btn.visibleRatio);
        console.log('  Is In Viewport:', btn.isInViewport);
        console.log('  CSS: visibility=' + btn.visibility + ', display=' + btn.display + ', opacity=' + btn.opacity);
        console.log('  pointerEvents:', btn.pointerEvents);
        console.log('  disabled:', btn.disabled);
        console.log('');
    }

    ws.close();
});

ws.on('error', err => {
    console.error('WebSocket error:', err.message);
    process.exit(1);
});
