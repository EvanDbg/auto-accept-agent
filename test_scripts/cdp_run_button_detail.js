/**
 * CDP script to get detailed Run button info in Antigravity iframe
 * Usage: node test_scripts/cdp_run_button_detail.js
 */

const WebSocket = require('ws');

const PAGE_ID = '70A258AA7BC6DA1B2581DB4F39FA0D1A';
const WS_URL = `ws://127.0.0.1:9000/devtools/page/${PAGE_ID}`;

async function main() {
    console.log('Connecting to:', WS_URL);

    const ws = new WebSocket(WS_URL);
    let messageId = 1;

    const send = (method, params = {}) => {
        return new Promise((resolve, reject) => {
            const id = messageId++;
            const timeout = setTimeout(() => reject(new Error('Timeout')), 10000);
            const handler = (data) => {
                const msg = JSON.parse(data.toString());
                if (msg.id === id) {
                    clearTimeout(timeout);
                    ws.off('message', handler);
                    if (msg.error) {
                        reject(new Error(msg.error.message));
                    } else {
                        resolve(msg.result);
                    }
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

            // 获取 iframe 内 Run 按钮的完整 HTML 结构
            const result = await send('Runtime.evaluate', {
                expression: `
                    (function() {
                        const results = {
                            iframeInfo: [],
                            runButtons: [],
                            allButtonsInIframe: []
                        };
                        
                        const iframes = document.querySelectorAll('iframe, webview');
                        results.iframeInfo.push('Total iframes: ' + iframes.length);
                        
                        iframes.forEach((iframe, i) => {
                            try {
                                const doc = iframe.contentDocument || iframe.contentWindow?.document;
                                if (!doc) {
                                    results.iframeInfo.push('iframe[' + i + ']: no document access');
                                    return;
                                }
                                
                                results.iframeInfo.push('iframe[' + i + ']: src=' + (iframe.src || 'none').substring(0, 80));
                                results.iframeInfo.push('iframe[' + i + ']: className=' + iframe.className);
                                results.iframeInfo.push('iframe[' + i + ']: id=' + (iframe.id || 'none'));
                                
                                // 获取所有按钮
                                const allButtons = doc.querySelectorAll('button, [role="button"], [class*="button"]');
                                results.allButtonsInIframe.push('iframe[' + i + '] has ' + allButtons.length + ' button-like elements');
                                
                                allButtons.forEach((btn, j) => {
                                    const text = (btn.textContent || '').trim();
                                    const rect = btn.getBoundingClientRect();
                                    const style = btn.ownerDocument.defaultView.getComputedStyle(btn);
                                    
                                    const info = {
                                        iframeIndex: i,
                                        buttonIndex: j,
                                        tagName: btn.tagName,
                                        text: text.substring(0, 50),
                                        className: btn.className,
                                        id: btn.id || '',
                                        outerHTML: btn.outerHTML.substring(0, 300),
                                        parentClassName: btn.parentElement?.className || '',
                                        grandparentClassName: btn.parentElement?.parentElement?.className || '',
                                        rect: { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) },
                                        visible: style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0
                                    };
                                    
                                    // 只输出包含 run/accept/retry 的按钮
                                    const lowerText = text.toLowerCase();
                                    if (lowerText.includes('run') || lowerText.includes('accept') || lowerText.includes('retry') || lowerText.includes('allow')) {
                                        results.runButtons.push(info);
                                    }
                                });
                            } catch (e) {
                                results.iframeInfo.push('iframe[' + i + ']: error - ' + e.message);
                            }
                        });
                        
                        return JSON.stringify(results, null, 2);
                    })()
                `,
                returnByValue: true
            });

            console.log('=== Run Button Analysis ===');
            console.log(result.result.value);

            ws.close();
        } catch (err) {
            console.error('Error:', err.message);
            ws.close();
        }
    });

    ws.on('error', (err) => {
        console.error('WebSocket error:', err.message);
        process.exit(1);
    });
}

main();
