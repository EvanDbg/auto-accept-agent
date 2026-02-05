/**
 * CDP script to find and analyze buttons in Antigravity
 * Usage: node test_scripts/cdp_get_buttons.js
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
            const handler = (data) => {
                const msg = JSON.parse(data.toString());
                if (msg.id === id) {
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

            // Enable Runtime
            await send('Runtime.enable');

            // 详细分析 iframe 结构
            const iframeAnalysis = await send('Runtime.evaluate', {
                expression: `
                    (function() {
                        const results = [];
                        const iframes = document.querySelectorAll('iframe, webview');
                        results.push('Found ' + iframes.length + ' iframes/webviews');

                        iframes.forEach((iframe, i) => {
                            try {
                                const doc = iframe.contentDocument || iframe.contentWindow?.document;
                                if (doc) {
                                    results.push('iframe[' + i + ']: accessible');
                                    const runButton = doc.querySelector('button, [role="button"]'); // Assuming there's only one "Run" button or we want the first
                                    if (runButton) {
                                        const text = runButton.textContent?.trim() || '';
                                        const lowerText = text.toLowerCase();
                                        if (lowerText.includes('run')) {
                                            const rect = runButton.getBoundingClientRect();
                                            const style = window.getComputedStyle(runButton);
                                            results.push({
                                                iframeIndex: i,
                                                tagName: runButton.tagName,
                                                text: text.substring(0, 100),
                                                className: runButton.className,
                                                id: runButton.id,
                                                disabled: runButton.disabled,
                                                visible: style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0,
                                                rect: {
                                                    x: Math.round(rect.x),
                                                    y: Math.round(rect.y),
                                                    width: Math.round(rect.width),
                                                    height: Math.round(rect.height)
                                                },
                                                opacity: style.opacity,
                                                pointerEvents: style.pointerEvents
                                            });
                                        }
                                    } else {
                                        results.push('iframe[' + i + ']: No button found');
                                    }
                                } else {
                                    results.push('iframe[' + i + ']: contentDocument/contentWindow.document not available');
                                }
                            } catch (e) {
                                results.push('iframe[' + i + ']: cannot access (cross-origin or other error) - ' + e.message);
                            }
                        });

                        return JSON.stringify(results, null, 2);
                    })()
                `,
                returnByValue: true
            });

            console.log('\n=== Deep Iframe Analysis ===');
            console.log(iframeAnalysis.result.value);

            // Find all buttons and elements with "run" text
            const result = await send('Runtime.evaluate', {
                expression: `
                    (function() {
                        const results = [];
                        
                        // Find all buttons
                        const allButtons = document.querySelectorAll('button, [role="button"], .bg-ide-button-background, [class*="button"]');
                        
                        allButtons.forEach((btn, index) => {
                            const text = btn.textContent?.trim() || '';
                            const lowerText = text.toLowerCase();
                            
                            // Only log buttons with relevant text
                            if (lowerText.includes('run') || 
                                lowerText.includes('accept') || 
                                lowerText.includes('retry') ||
                                lowerText.includes('execute') ||
                                lowerText.includes('allow')) {
                                
                                const rect = btn.getBoundingClientRect();
                                const style = window.getComputedStyle(btn);
                                
                                results.push({
                                    index: index,
                                    tagName: btn.tagName,
                                    text: text.substring(0, 100),
                                    className: btn.className,
                                    id: btn.id,
                                    disabled: btn.disabled,
                                    visible: style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0,
                                    rect: { 
                                        x: Math.round(rect.x), 
                                        y: Math.round(rect.y), 
                                        width: Math.round(rect.width), 
                                        height: Math.round(rect.height) 
                                    },
                                    opacity: style.opacity,
                                    pointerEvents: style.pointerEvents
                                });
                            }
                        });
                        
                        return JSON.stringify(results, null, 2);
                    })()
                `,
                returnByValue: true
            });

            console.log('=== Found Buttons ===');
            console.log(result.result.value);

            // Also check for buttons inside iframes
            const iframeResult = await send('Runtime.evaluate', {
                expression: `
                    (function() {
                        const results = [];
                        const iframes = document.querySelectorAll('iframe, webview');
                        results.push('Found ' + iframes.length + ' iframes/webviews');
                        
                        iframes.forEach((iframe, i) => {
                            try {
                                const doc = iframe.contentDocument || iframe.contentWindow?.document;
                                if (doc) {
                                    const buttons = doc.querySelectorAll('button, [role="button"]');
                                    buttons.forEach(btn => {
                                        const text = btn.textContent?.trim().toLowerCase() || '';
                                        if (text.includes('run') || text.includes('accept')) {
                                            results.push('iframe[' + i + ']: ' + btn.tagName + ' - "' + text.substring(0, 50) + '"');
                                        }
                                    });
                                }
                            } catch (e) {
                                results.push('iframe[' + i + ']: cannot access (cross-origin)');
                            }
                        });
                        
                        return results.join('\\n');
                    })()
                `,
                returnByValue: true
            });

            console.log('\n=== Iframe Check ===');
            console.log(iframeResult.result.value);

            // Check specific Antigravity panel
            const panelResult = await send('Runtime.evaluate', {
                expression: `
                    (function() {
                        const panel = document.querySelector('#antigravity\\\\.agentPanel');
                        if (!panel) return 'Antigravity panel NOT FOUND!';
                        
                        const buttons = panel.querySelectorAll('button, .bg-ide-button-background');
                        let info = 'Antigravity panel found! Buttons inside: ' + buttons.length + '\\n';
                        
                        buttons.forEach((btn, i) => {
                            const text = btn.textContent?.trim() || '';
                            info += i + ': ' + btn.tagName + '.' + btn.className.split(' ').slice(0,3).join('.') + ' - "' + text.substring(0, 50) + '"\\n';
                        });
                        
                        return info;
                    })()
                `,
                returnByValue: true
            });

            console.log('\n=== Antigravity Panel Check ===');
            console.log(panelResult.result.value);

            ws.close();

        } catch (err) {
            console.error('Error:', err.message);
            ws.close();
        }
    });

    ws.on('error', (err) => {
        console.error('WebSocket error:', err.message);
    });
}

main();
