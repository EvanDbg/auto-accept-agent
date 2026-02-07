/**
 * CDP Test Script - Verify scrollIntoView fix for hidden buttons
 * Tests the improved scroll-then-click approach
 * 
 * Usage: node test_scripts/cdp_verify_scroll_fix.js [PAGE_ID]
 */

const WebSocket = require('ws');

const PAGE_ID = process.argv[2] || '164F2313902FA4080D2768EA1C5BB085';
const WS_URL = `ws://127.0.0.1:9000/devtools/page/${PAGE_ID}`;

async function main() {
    console.log('=== CDP Verify Scroll Fix ===\n');
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
                    
                    // 递归获取所有文档（包含 iframe）
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
                    
                    const REJECT_PATTERNS = ['skip', 'reject', 'cancel', 'close', 'refine', 'always'];
                    const ACCEPT_PATTERNS = ['run', 'accept', 'retry', 'apply', 'execute', 'confirm', 'allow'];
                    
                    function isAcceptText(text) {
                        const lowerText = text.toLowerCase();
                        if (REJECT_PATTERNS.some(p => lowerText.includes(p))) return false;
                        return ACCEPT_PATTERNS.some(p => lowerText.includes(p));
                    }
                    
                    function getViewportInfo(doc) {
                        const win = doc.defaultView || window;
                        return {
                            width: win.innerWidth || doc.documentElement.clientWidth,
                            height: win.innerHeight || doc.documentElement.clientHeight
                        };
                    }
                    
                    function isInViewport(el, viewport) {
                        const rect = el.getBoundingClientRect();
                        return rect.bottom > 0 && rect.top < viewport.height &&
                               rect.right > 0 && rect.left < viewport.width;
                    }
                    
                    const results = {
                        foundButtons: [],
                        scrolledAndClicked: false,
                        hasStepRequiresInput: false
                    };
                    
                    const docs = getDocuments();
                    log('Found ' + docs.length + ' documents');
                    
                    // Check for "Step Requires Input"
                    for (const doc of docs) {
                        try {
                            const allText = doc.body?.textContent || '';
                            if (allText.includes('Step Requires Input') || allText.includes('Requires Input')) {
                                results.hasStepRequiresInput = true;
                                log('✅ "Step Requires Input" detected!');
                                break;
                            }
                        } catch (e) {}
                    }
                    
                    const selectors = ['.bg-ide-button-background', 'button.cursor-pointer', '.bg-primary button', 'button'];
                    
                    // Find all accept buttons
                    for (const doc of docs) {
                        const viewport = getViewportInfo(doc);
                        
                        for (const selector of selectors) {
                            try {
                                const elements = doc.querySelectorAll(selector);
                                for (const el of elements) {
                                    const text = (el.textContent || '').trim();
                                    if (!text || !isAcceptText(text)) continue;
                                    
                                    const rect = el.getBoundingClientRect();
                                    const inViewport = isInViewport(el, viewport);
                                    
                                    results.foundButtons.push({
                                        text: text.substring(0, 30),
                                        inViewport: inViewport,
                                        y: Math.round(rect.y),
                                        viewportHeight: viewport.height
                                    });
                                    
                                    // If button is not in viewport, scroll it into view
                                    if (!inViewport && rect.width > 0 && rect.height > 0) {
                                        log('🔄 Scrolling button into view: "' + text.substring(0, 20) + '"');
                                        
                                        el.scrollIntoView({ behavior: 'instant', block: 'center' });
                                        await new Promise(r => setTimeout(r, 200));
                                        
                                        const newRect = el.getBoundingClientRect();
                                        const nowInViewport = isInViewport(el, viewport);
                                        
                                        log('   Before: Y=' + Math.round(rect.y) + ', After: Y=' + Math.round(newRect.y));
                                        log('   Now in viewport: ' + nowInViewport);
                                        
                                        if (nowInViewport) {
                                            log('🎯 Clicking button...');
                                            el.dispatchEvent(new MouseEvent('click', { 
                                                view: doc.defaultView, 
                                                bubbles: true, 
                                                cancelable: true 
                                            }));
                                            log('✅ Click dispatched!');
                                            results.scrolledAndClicked = true;
                                            
                                            // Return after first successful click
                                            return {
                                                logs: logs,
                                                hasStepRequiresInput: results.hasStepRequiresInput,
                                                foundButtons: results.foundButtons.length,
                                                scrolledAndClicked: true,
                                                clickedButton: text.substring(0, 30)
                                            };
                                        }
                                    }
                                }
                            } catch (e) {
                                log('Error: ' + e.message);
                            }
                        }
                    }
                    
                    return {
                        logs: logs,
                        hasStepRequiresInput: results.hasStepRequiresInput,
                        foundButtons: results.foundButtons.length,
                        scrolledAndClicked: false,
                        reason: 'No hidden buttons found or all buttons visible'
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
            console.log('Has "Step Requires Input":', data.hasStepRequiresInput ? '✅ YES' : '❌ NO');
            console.log('Found buttons:', data.foundButtons);
            console.log('Scrolled and clicked:', data.scrolledAndClicked ? '✅ YES' : '❌ NO');
            if (data.clickedButton) {
                console.log('Clicked button:', data.clickedButton);
            }

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
