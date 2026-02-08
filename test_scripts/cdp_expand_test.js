/**
 * CDP Test Script - Click Expand buttons to reveal Run buttons
 * Tests clicking Expand when Step Requires Input is detected
 * 
 * Usage: node test_scripts/cdp_expand_test.js [PAGE_ID]
 */

const WebSocket = require('ws');

const PAGE_ID = process.argv[2] || '67F75EE97DD3DCEADC3C4760FB4133FC';
const WS_URL = `ws://127.0.0.1:9000/devtools/page/${PAGE_ID}`;

async function main() {
    console.log('=== CDP Expand Button Test ===\n');
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
                (async function() {
                    const logs = [];
                    const log = (msg) => { logs.push(msg); console.log(msg); };
                    
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
                    log('Documents: ' + docs.length);
                    
                    // Check for Step Requires Input
                    let hasStepInput = false;
                    for (const doc of docs) {
                        const text = doc.body?.textContent || '';
                        if (text.includes('Step Requires Input') || text.includes('Requires Input')) {
                            hasStepInput = true;
                            break;
                        }
                    }
                    log('Has "Step Requires Input": ' + (hasStepInput ? 'YES' : 'NO'));
                    
                    // Find Run buttons before clicking Expand
                    function countRunButtons() {
                        let count = 0;
                        for (const doc of docs) {
                            const buttons = doc.querySelectorAll('button, .bg-ide-button-background');
                            for (const btn of buttons) {
                                const t = (btn.textContent || '').trim().toLowerCase();
                                if ((t.includes('run') && !t.includes('running')) || t.includes('accept') || t.includes('allow')) {
                                    count++;
                                }
                            }
                        }
                        return count;
                    }
                    
                    const runButtonsBefore = countRunButtons();
                    log('Run/Accept buttons BEFORE expand: ' + runButtonsBefore);
                    
                    // Find and click Expand buttons
                    let expandClicked = 0;
                    for (const doc of docs) {
                        const elements = doc.querySelectorAll('button, [role="button"], .cursor-pointer');
                        for (const el of elements) {
                            const text = (el.textContent || '').trim();
                            if (text === 'Expand' || text === 'Expand all') {
                                const rect = el.getBoundingClientRect();
                                const vp = (doc.defaultView || window).innerHeight;
                                
                                log('Found "' + text + '" at y=' + Math.round(rect.y));
                                
                                // Click if in viewport
                                if (rect.y > 0 && rect.y < vp && rect.width > 0) {
                                    el.dispatchEvent(new MouseEvent('click', { 
                                        view: doc.defaultView, 
                                        bubbles: true, 
                                        cancelable: true 
                                    }));
                                    log('✅ Clicked "' + text + '"');
                                    expandClicked++;
                                    await new Promise(r => setTimeout(r, 300));
                                }
                            }
                        }
                    }
                    
                    if (expandClicked === 0) {
                        log('❌ No Expand buttons found or clicked');
                    }
                    
                    // Wait for UI to update
                    await new Promise(r => setTimeout(r, 500));
                    
                    // Count Run buttons after clicking Expand
                    const runButtonsAfter = countRunButtons();
                    log('Run/Accept buttons AFTER expand: ' + runButtonsAfter);
                    
                    // Find and show Run buttons
                    for (const doc of docs) {
                        const buttons = doc.querySelectorAll('button, .bg-ide-button-background');
                        for (const btn of buttons) {
                            const t = (btn.textContent || '').trim().toLowerCase();
                            if ((t.includes('run') && !t.includes('running')) || t.includes('accept') || t.includes('allow')) {
                                const rect = btn.getBoundingClientRect();
                                log('🎯 Found: "' + (btn.textContent || '').trim().substring(0, 30) + '" at y=' + Math.round(rect.y));
                            }
                        }
                    }
                    
                    return {
                        logs: logs,
                        hasStepInput: hasStepInput,
                        expandClicked: expandClicked,
                        runButtonsBefore: runButtonsBefore,
                        runButtonsAfter: runButtonsAfter,
                        success: runButtonsAfter > runButtonsBefore
                    };
                })()
            `;

            console.log('Executing test...\n');

            const result = await send('Runtime.evaluate', {
                expression: testScript,
                returnByValue: true,
                awaitPromise: true
            });

            const data = result.result.value;

            console.log('=== Logs ===');
            data.logs.forEach(l => console.log(l));

            console.log('\n=== Result ===');
            console.log('Has "Step Requires Input":', data.hasStepInput ? '✅ YES' : '❌ NO');
            console.log('Expand buttons clicked:', data.expandClicked);
            console.log('Run buttons before:', data.runButtonsBefore);
            console.log('Run buttons after:', data.runButtonsAfter);
            console.log('Success:', data.success ? '✅ More buttons revealed!' : '❌ No new buttons');

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
