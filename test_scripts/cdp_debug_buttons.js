/**
 * Debug script to find all buttons on a page
 * Usage: node test_scripts/cdp_debug_buttons.js [PAGE_ID]
 */

const WebSocket = require('ws');

const PAGE_ID = process.argv[2] || '195F083FD30961D676A8ACDBD8469342';
const WS_URL = `ws://127.0.0.1:9000/devtools/page/${PAGE_ID}`;

async function main() {
    console.log('=== Debug Buttons ===\n');
    console.log('Page ID:', PAGE_ID);

    const ws = new WebSocket(WS_URL);
    let messageId = 1;

    const send = (method, params = {}) => {
        return new Promise((resolve, reject) => {
            const id = messageId++;
            const timeout = setTimeout(() => reject(new Error('Timeout')), 15000);
            const handler = (data) => {
                const msg = JSON.parse(data.toString());
                if (msg.id === id) {
                    clearTimeout(timeout);
                    ws.off('message', handler);
                    if (msg.error) reject(new Error(msg.error.message));
                    else resolve(msg.result);
                }
            };
            ws.on('message', handler);
            ws.send(JSON.stringify({ id, method, params }));
        });
    };

    ws.on('open', async () => {
        try {
            console.log('Connected!\n');
            await send('Runtime.enable');

            const result = await send('Runtime.evaluate', {
                expression: `
                    (function() {
                        function getDocuments(root = document) {
                            let docs = [root];
                            try {
                                const iframes = root.querySelectorAll('iframe, frame');
                                for (const iframe of iframes) {
                                    try {
                                        const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
                                        if (iframeDoc) docs.push(...getDocuments(iframeDoc));
                                    } catch (e) {}
                                }
                            } catch (e) {}
                            return docs;
                        }
                        
                        const docs = getDocuments();
                        const results = {
                            docCount: docs.length,
                            hasStepInput: false,
                            allButtonsRaw: [],
                            elements: []
                        };
                        
                        for (let i = 0; i < docs.length; i++) {
                            const doc = docs[i];
                            const text = doc.body?.textContent || '';
                            if (text.includes('Step Requires Input')) results.hasStepInput = true;
                            
                            // 检查所有可能的按钮元素
                            const selectors = [
                                'button',
                                '[role="button"]',
                                '.bg-ide-button-background',
                                '.cursor-pointer',
                                '[class*="button"]',
                                '[class*="btn"]'
                            ];
                            
                            for (const sel of selectors) {
                                try {
                                    const els = doc.querySelectorAll(sel);
                                    for (const el of els) {
                                        const t = (el.textContent || '').trim();
                                        if (t && t.length > 0 && t.length < 100) {
                                            const rect = el.getBoundingClientRect();
                                            results.elements.push({
                                                sel: sel,
                                                text: t.substring(0, 40),
                                                doc: i,
                                                w: Math.round(rect.width),
                                                h: Math.round(rect.height),
                                                y: Math.round(rect.y)
                                            });
                                        }
                                    }
                                } catch (e) {}
                            }
                        }
                        
                        // 去重
                        const seen = new Set();
                        results.elements = results.elements.filter(e => {
                            const key = e.text + e.y;
                            if (seen.has(key)) return false;
                            seen.add(key);
                            return true;
                        });
                        
                        return JSON.stringify(results, null, 2);
                    })()
                `,
                returnByValue: true
            });

            const data = JSON.parse(result.result.value);
            console.log('Documents:', data.docCount);
            console.log('Has "Step Requires Input":', data.hasStepInput ? 'YES' : 'NO');
            console.log('\nFound elements:');
            data.elements.forEach(e => {
                console.log(`  [${e.sel}] "${e.text}" (doc:${e.doc}, y:${e.y}, ${e.w}x${e.h})`);
            });

            ws.close();
        } catch (err) {
            console.error('Error:', err.message);
            ws.close();
            process.exit(1);
        }
    });

    ws.on('error', (err) => {
        console.error('WebSocket error:', err.message);
        process.exit(1);
    });
}

main();
