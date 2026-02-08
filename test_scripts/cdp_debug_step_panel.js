/**
 * CDP Test Script - Debug Step Panel detection
 * Verifies the clickExpandInStepPanel logic
 * 
 * Usage: node test_scripts/cdp_debug_step_panel.js [PAGE_ID]
 */

const WebSocket = require('ws');

const PAGE_ID = process.argv[2];
if (!PAGE_ID) {
    console.log('Usage: node cdp_debug_step_panel.js <PAGE_ID>');
    process.exit(1);
}

const WS_URL = `ws://127.0.0.1:9000/devtools/page/${PAGE_ID}`;

async function main() {
    console.log('=== Debug Step Panel Detection ===\n');
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

            const testScript = `
                (function() {
                    function getDocuments(root = document) {
                        let docs = [root];
                        try {
                            const iframes = root.querySelectorAll('iframe, frame');
                            for (const iframe of iframes) {
                                try {
                                    const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
                                    if (iframeDoc) docs.push(...getDocuments(iframeDoc));
                                } catch (e) {}
                            }
                        } catch (e) {}
                        return docs;
                    }
                    
                    const logs = [];
                    const docs = getDocuments();
                    
                    logs.push('Documents found: ' + docs.length);
                    
                    for (let di = 0; di < docs.length; di++) {
                        const doc = docs[di];
                        const allElements = doc.querySelectorAll('*');
                        
                        for (const el of allElements) {
                            const text = (el.textContent || '').trim();
                            if (text.includes('Step Requires Input') || text.includes('Requires Input')) {
                                logs.push('');
                                logs.push('=== Found "Step Requires Input" in doc:' + di + ' ===');
                                logs.push('Direct element: ' + el.tagName + ' (' + el.className.substring(0, 30) + ')');
                                
                                // Walk up the DOM like the actual code does
                                let container = el;
                                for (let i = 0; i < 15 && container.parentElement; i++) {
                                    container = container.parentElement;
                                    const rect = container.getBoundingClientRect();
                                    
                                    // Check for Expand buttons in this container
                                    const expandBtns = container.querySelectorAll('button, [role="button"]');
                                    let expandCount = 0;
                                    for (const btn of expandBtns) {
                                        const t = (btn.textContent || '').trim();
                                        if (t === 'Expand' || t === 'Expand all') expandCount++;
                                    }
                                    
                                    logs.push('  Level ' + i + ': h=' + Math.round(rect.height) + 'px, w=' + Math.round(rect.width) + 'px, Expands=' + expandCount);
                                    
                                    // Mark which would be selected by current logic
                                    if (rect.height > 200 && rect.height < 1000 && expandCount > 0) {
                                        logs.push('    ✅ This container would be selected (h>200 && h<1000)');
                                        break;
                                    }
                                }
                                
                                break; // Only analyze first occurrence
                            }
                        }
                    }
                    
                    return logs.join('\\n');
                })()
            `;

            const result = await send('Runtime.evaluate', {
                expression: testScript,
                returnByValue: true
            });

            console.log(result.result.value);

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
