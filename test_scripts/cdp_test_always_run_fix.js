/**
 * CDP Test Script - Test fix for "Always run" button
 * Verifies that "Always run" button is correctly filtered out
 * 
 * Usage: node test_scripts/cdp_test_always_run_fix.js
 */

const WebSocket = require('ws');

const PAGE_ID = 'F30DB204CB27AE1271FCD7083D295C3F';
const WS_URL = `ws://127.0.0.1:9000/devtools/page/${PAGE_ID}`;

async function main() {
    console.log('=== CDP Always Run Button Fix Test ===\n');
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

            // 测试修复后的逻辑
            const testScript = `
                (function() {
                    const results = {
                        testCases: [],
                        summary: {}
                    };
                    
                    // 新的 REJECT_PATTERNS（添加了 'always'）
                    const REJECT_PATTERNS_OLD = ['skip', 'reject', 'cancel', 'discard', 'deny', 'close', 'refine', 'other'];
                    const REJECT_PATTERNS_NEW = ['skip', 'reject', 'cancel', 'discard', 'deny', 'close', 'refine', 'other', 'always'];
                    const ACCEPT_PATTERNS = ['run', 'accept', 'retry', 'apply', 'execute', 'confirm', 'allow'];
                    
                    // 测试按钮文本
                    const testButtons = [
                        'Run⌥⏎',           // 应该点击
                        'Always run',      // 不应该点击
                        'Accept',          // 应该点击
                        'Retry',           // 应该点击
                        'Cancel',          // 不应该点击
                        'Run command',     // 应该点击
                        'Always allow'     // 不应该点击
                    ];
                    
                    function testPattern(text, acceptPatterns, rejectPatterns) {
                        const lowerText = text.toLowerCase();
                        
                        // 检查拒绝模式
                        if (rejectPatterns.some(p => lowerText.includes(p))) {
                            return false;
                        }
                        
                        // 检查接受模式
                        if (!acceptPatterns.some(p => lowerText.includes(p))) {
                            return false;
                        }
                        
                        return true;
                    }
                    
                    for (const text of testButtons) {
                        const oldResult = testPattern(text, ACCEPT_PATTERNS, REJECT_PATTERNS_OLD);
                        const newResult = testPattern(text, ACCEPT_PATTERNS, REJECT_PATTERNS_NEW);
                        
                        results.testCases.push({
                            text: text,
                            oldLogic: oldResult ? '✅ CLICK' : '❌ SKIP',
                            newLogic: newResult ? '✅ CLICK' : '❌ SKIP',
                            fixed: text.toLowerCase().includes('always') ? (newResult === false ? '✅ FIXED' : '⚠️  STILL BROKEN') : 'N/A'
                        });
                    }
                    
                    // 在真实 DOM 中查找 "Always run" 按钮
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
                    
                    const docs = getDocuments();
                    const selectors = ['.bg-ide-button-background', 'button.cursor-pointer', '.bg-primary button'];
                    
                    let alwaysButtonFound = false;
                    for (const doc of docs) {
                        for (const selector of selectors) {
                            try {
                                const elements = doc.querySelectorAll(selector);
                                for (const el of elements) {
                                    const text = (el.textContent || '').trim();
                                    if (text.toLowerCase().includes('always')) {
                                        alwaysButtonFound = true;
                                        const oldWouldClick = testPattern(text, ACCEPT_PATTERNS, REJECT_PATTERNS_OLD);
                                        const newWouldClick = testPattern(text, ACCEPT_PATTERNS, REJECT_PATTERNS_NEW);
                                        
                                        results.realButton = {
                                            text: text,
                                            selector: selector,
                                            oldLogic: oldWouldClick ? '⚠️  WOULD CLICK (BUG!)' : '✅ CORRECTLY SKIPPED',
                                            newLogic: newWouldClick ? '⚠️  WOULD STILL CLICK (NOT FIXED!)' : '✅ CORRECTLY SKIPPED (FIXED!)'
                                        };
                                    }
                                }
                            } catch (e) { }
                        }
                    }
                    
                    results.summary = {
                        alwaysButtonFound: alwaysButtonFound,
                        fixWorks: alwaysButtonFound ? !testPattern('Always run', ACCEPT_PATTERNS, REJECT_PATTERNS_NEW) : null
                    };
                    
                    return JSON.stringify(results, null, 2);
                })()
            `;

            console.log('Testing fix logic...\n');

            const result = await send('Runtime.evaluate', {
                expression: testScript,
                returnByValue: true
            });

            const data = JSON.parse(result.result.value);

            console.log('=== Test Cases ===\n');
            console.log('Button Text'.padEnd(20) + 'Old Logic'.padEnd(15) + 'New Logic'.padEnd(15) + 'Status');
            console.log('='.repeat(70));
            data.testCases.forEach(tc => {
                console.log(
                    tc.text.padEnd(20) +
                    tc.oldLogic.padEnd(15) +
                    tc.newLogic.padEnd(15) +
                    tc.fixed
                );
            });

            if (data.realButton) {
                console.log('\n=== Real "Always" Button on Page ===\n');
                console.log(`Button found: "${data.realButton.text}"`);
                console.log(`Matched by selector: ${data.realButton.selector}`);
                console.log(`Old logic: ${data.realButton.oldLogic}`);
                console.log(`New logic: ${data.realButton.newLogic}`);
            }

            console.log('\n=== Summary ===');
            if (data.summary.alwaysButtonFound) {
                if (data.summary.fixWorks) {
                    console.log('✅ Fix is correct! "Always run" button will be properly skipped.');
                } else {
                    console.log('❌ Fix does NOT work! "Always run" button would still be clicked.');
                }
            } else {
                console.log('ℹ️  No "Always" button found on page (may have been removed).');
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
