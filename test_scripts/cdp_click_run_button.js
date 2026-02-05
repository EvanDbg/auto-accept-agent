/**
 * CDP Test Script - Click Run Button in Antigravity iframe
 * This script tests the proposed fix by directly clicking the Run button
 * 
 * Usage: node test_scripts/cdp_click_run_button.js
 */

const WebSocket = require('ws');

const PAGE_ID = '70A258AA7BC6DA1B2581DB4F39FA0D1A';
const WS_URL = `ws://127.0.0.1:9000/devtools/page/${PAGE_ID}`;

// 新的选择器方案
const NEW_SELECTORS = [
    '.bg-ide-button-background',      // 旧选择器（保持兼容）
    'button.cursor-pointer',           // 新按钮有 cursor-pointer 类
    '.bg-primary button'               // 按钮在 bg-primary 父元素内
];

// 按钮文本匹配模式
const ACCEPT_PATTERNS = ['run', 'accept', 'retry', 'apply', 'execute', 'confirm', 'allow'];
const REJECT_PATTERNS = ['skip', 'reject', 'cancel', 'close', 'refine'];

async function main() {
    console.log('=== CDP Run Button Click Test ===\n');
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

            // 测试脚本：遍历 iframe 并点击 Run 按钮
            const testScript = `
                (function() {
                    const log = [];
                    const SELECTORS = ${JSON.stringify(NEW_SELECTORS)};
                    const ACCEPT_PATTERNS = ${JSON.stringify(ACCEPT_PATTERNS)};
                    const REJECT_PATTERNS = ${JSON.stringify(REJECT_PATTERNS)};
                    
                    // 递归获取所有文档（包括 iframe）
                    function getDocuments(root = document) {
                        let docs = [root];
                        try {
                            const iframes = root.querySelectorAll('iframe, frame');
                            for (const iframe of iframes) {
                                try {
                                    const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
                                    if (iframeDoc) docs.push(...getDocuments(iframeDoc));
                                } catch (e) { 
                                    log.push('Could not access iframe: ' + e.message);
                                }
                            }
                        } catch (e) { }
                        return docs;
                    }
                    
                    // 检查按钮是否是 accept 类型
                    function isAcceptButton(el) {
                        const text = (el.textContent || '').trim().toLowerCase();
                        if (text.length === 0 || text.length > 50) return false;
                        
                        // 检查拒绝模式
                        if (REJECT_PATTERNS.some(r => text.includes(r))) return false;
                        
                        // 检查接受模式
                        if (!ACCEPT_PATTERNS.some(p => text.includes(p))) return false;
                        
                        // 可见性检查
                        const style = el.ownerDocument.defaultView.getComputedStyle(el);
                        const rect = el.getBoundingClientRect();
                        if (style.display === 'none') return false;
                        if (style.visibility === 'hidden') return false;
                        if (parseFloat(style.opacity) === 0) return false;
                        if (style.pointerEvents === 'none') return false;
                        if (el.disabled) return false;
                        if (rect.width <= 0 || rect.height <= 0) return false;
                        
                        return true;
                    }
                    
                    // 主逻辑
                    const docs = getDocuments();
                    log.push('Found ' + docs.length + ' documents (main + iframes)');
                    
                    const foundButtons = [];
                    let clickedCount = 0;
                    
                    for (const doc of docs) {
                        for (const selector of SELECTORS) {
                            try {
                                const elements = doc.querySelectorAll(selector);
                                for (const el of elements) {
                                    const text = (el.textContent || '').trim();
                                    const lowerText = text.toLowerCase();
                                    
                                    if (isAcceptButton(el)) {
                                        foundButtons.push({
                                            selector: selector,
                                            text: text.substring(0, 30),
                                            tagName: el.tagName,
                                            className: (el.className || '').substring(0, 50)
                                        });
                                        
                                        // 优先点击 Run 按钮
                                        if (lowerText.includes('run')) {
                                            log.push('🎯 CLICKING Run button: "' + text + '"');
                                            
                                            // 使用 dispatchEvent 模拟点击
                                            el.dispatchEvent(new MouseEvent('click', { 
                                                view: el.ownerDocument.defaultView, 
                                                bubbles: true, 
                                                cancelable: true 
                                            }));
                                            
                                            clickedCount++;
                                            log.push('✅ Click dispatched!');
                                        }
                                    }
                                }
                            } catch (e) {
                                log.push('Error with selector ' + selector + ': ' + e.message);
                            }
                        }
                    }
                    
                    return {
                        success: clickedCount > 0,
                        clickedCount: clickedCount,
                        foundButtons: foundButtons,
                        logs: log
                    };
                })()
            `;

            console.log('Executing test script...\n');

            const result = await send('Runtime.evaluate', {
                expression: testScript,
                returnByValue: true
            });

            const data = result.result.value;

            console.log('=== Test Result ===\n');
            console.log('Logs:');
            data.logs.forEach(l => console.log('  ' + l));

            console.log('\nFound Accept-type Buttons:');
            data.foundButtons.forEach((b, i) => {
                console.log(`  ${i + 1}. [${b.selector}] ${b.tagName} - "${b.text}"`);
            });

            console.log('\n=== RESULT ===');
            if (data.success) {
                console.log(`✅ SUCCESS! Clicked ${data.clickedCount} Run button(s)`);
            } else {
                console.log('❌ FAILED! No Run button was clicked');
                console.log('   Possible reasons:');
                console.log('   - No Run button found');
                console.log('   - Button not visible or disabled');
                console.log('   - Cross-origin iframe restriction');
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
