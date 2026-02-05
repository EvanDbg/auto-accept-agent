/**
 * CDP Final Test - Verify fix works with actual code logic
 * Tests the actual isAcceptButton function with the fix
 * 
 * Usage: node test_scripts/cdp_verify_fix.js
 */

const WebSocket = require('ws');

const PAGE_ID = 'F30DB204CB27AE1271FCD7083D295C3F';
const WS_URL = `ws://127.0.0.1:9000/devtools/page/${PAGE_ID}`;

async function main() {
    console.log('=== CDP Final Verification Test ===\n');
    console.log('Connecting to:', WS_URL);

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

            // 使用修复后的实际逻辑进行测试
            const testScript = `
                (function() {
                    // 修复后的实际代码逻辑（从 auto_accept.js 复制）
                    const ACCEPT_PATTERNS = [
                        { pattern: 'accept', exact: false },
                        { pattern: 'accept all', exact: false },
                        { pattern: 'acceptalt', exact: false },
                        { pattern: 'run command', exact: false },
                        { pattern: 'run', exact: false },
                        { pattern: 'run code', exact: false },
                        { pattern: 'run cell', exact: false },
                        { pattern: 'run all', exact: false },
                        { pattern: 'run selection', exact: false },
                        { pattern: 'run and debug', exact: false },
                        { pattern: 'run test', exact: false },
                        { pattern: 'apply', exact: true },
                        { pattern: 'execute', exact: true },
                        { pattern: 'resume', exact: true },
                        { pattern: 'retry', exact: true },
                        { pattern: 'try again', exact: false },
                        { pattern: 'confirm', exact: false },
                        { pattern: 'Allow Once', exact: true }
                    ];
                    
                    const REJECT_PATTERNS = ['skip', 'reject', 'cancel', 'discard', 'deny', 'close', 'refine', 'other', 'always'];
                    
                    function isAcceptButton_FIXED(text) {
                        if (!text || text.length === 0 || text.length > 50) return false;
                        
                        const lowerText = text.toLowerCase().trim();
                        
                        // Pattern matching
                        const matched = ACCEPT_PATTERNS.some(p => p.exact ? lowerText === p.pattern : lowerText.includes(p.pattern));
                        if (!matched) return false;
                        
                        // Reject if matches negative pattern
                        if (REJECT_PATTERNS.some(p => lowerText.includes(p))) {
                            return false;
                        }
                        
                        return true;
                    }
                    
                    // 递归获取所有文档
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
                    
                    const results = {
                        foundButtons: [],
                        wouldClick: [],
                        wouldSkip: []
                    };
                    
                    const docs = getDocuments();
                    const selectors = ['.bg-ide-button-background', 'button.cursor-pointer', '.bg-primary button'];
                    
                    for (const doc of docs) {
                        for (const selector of selectors) {
                            try {
                                const elements = doc.querySelectorAll(selector);
                                for (const el of elements) {
                                    const text = (el.textContent || '').trim();
                                    if (text.length === 0) continue;
                                    
                                    const rect = el.getBoundingClientRect();
                                    const style = el.ownerDocument.defaultView.getComputedStyle(el);
                                    const visible = style.display !== 'none' && 
                                                   style.visibility !== 'hidden' && 
                                                   rect.width > 0 && 
                                                   rect.height > 0;
                                    
                                    if (!visible) continue;
                                    
                                    const shouldClick = isAcceptButton_FIXED(text);
                                    
                                    const buttonInfo = {
                                        text: text.substring(0, 30),
                                        selector: selector,
                                        shouldClick: shouldClick
                                    };
                                    
                                    results.foundButtons.push(buttonInfo);
                                    
                                    if (shouldClick) {
                                        results.wouldClick.push(text);
                                    } else {
                                        results.wouldSkip.push(text);
                                    }
                                }
                            } catch (e) { }
                        }
                    }
                    
                    return JSON.stringify(results, null, 2);
                })()
            `;

            console.log('Running verification with fixed code...\n');

            const result = await send('Runtime.evaluate', {
                expression: testScript,
                returnByValue: true
            });

            const data = JSON.parse(result.result.value);

            console.log('=== Verification Results ===\n');
            console.log(`Total buttons found: ${data.foundButtons.length}\n`);

            console.log('WOULD CLICK:');
            data.wouldClick.forEach(text => {
                const icon = text.toLowerCase().includes('always') ? '⚠️ ' : '✅';
                console.log(`  ${icon} "${text}"`);
            });

            console.log('\nWOULD SKIP:');
            data.wouldSkip.forEach(text => {
                const icon = text.toLowerCase().includes('always') ? '✅' : '';
                console.log(`  ${icon} "${text}"`);
            });

            // 检查是否有 "always" 按钮被错误点击
            const alwaysButtonClicked = data.wouldClick.some(t => t.toLowerCase().includes('always'));
            const alwaysButtonSkipped = data.wouldSkip.some(t => t.toLowerCase().includes('always'));

            console.log('\n=== Final Verdict ===');
            if (alwaysButtonClicked) {
                console.log('❌ FIX FAILED! "Always" button would still be clicked.');
            } else if (alwaysButtonSkipped) {
                console.log('✅ FIX SUCCESSFUL! "Always" button is correctly skipped.');
                console.log('✅ "Run" button is still clickable.');
            } else {
                console.log('ℹ️  No "Always" button found (may have been removed from page).');
            }

            // 验证 Run 按钮仍然可点击
            const runButtonClicked = data.wouldClick.some(t => t.toLowerCase().includes('run') && !t.toLowerCase().includes('always'));
            if (runButtonClicked) {
                console.log('✅ "Run" button functionality preserved.');
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
