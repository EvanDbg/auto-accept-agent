/**
 * CDP Test Script - ScrollIntoView Fix for Hidden Run Button
 * Tests if scrollIntoView can make a hidden Run button visible and clickable
 * 
 * Usage: node test_scripts/cdp_scroll_click_test.js
 */

const WebSocket = require('ws');

// 从命令行获取 PAGE_ID，或使用默认值
const PAGE_ID = process.argv[2] || '6F751FF5305B8D4731F3CE79842A0FAA';  // doubao-ime-mac
const WS_URL = `ws://127.0.0.1:9000/devtools/page/${PAGE_ID}`;

async function main() {
    console.log('=== CDP ScrollIntoView Click Test ===\n');
    console.log('Page ID:', PAGE_ID);
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
                    
                    // REJECT 模式
                    const REJECT_PATTERNS = ['skip', 'reject', 'cancel', 'close', 'refine', 'always'];
                    const ACCEPT_PATTERNS = ['run', 'accept', 'retry', 'apply', 'execute', 'confirm'];
                    
                    // 检查是否是 accept 类型按钮
                    function isAcceptText(text) {
                        const lowerText = text.toLowerCase();
                        if (REJECT_PATTERNS.some(p => lowerText.includes(p))) return false;
                        return ACCEPT_PATTERNS.some(p => lowerText.includes(p));
                    }
                    
                    // 获取视口信息
                    function getViewportInfo(doc) {
                        const win = doc.defaultView || window;
                        return {
                            width: win.innerWidth || doc.documentElement.clientWidth,
                            height: win.innerHeight || doc.documentElement.clientHeight
                        };
                    }
                    
                    // 检查是否在视口内
                    function isInViewport(el, viewport) {
                        const rect = el.getBoundingClientRect();
                        return rect.bottom > 0 && rect.top < viewport.height &&
                               rect.right > 0 && rect.left < viewport.width;
                    }
                    
                    const results = {
                        foundButtons: [],
                        hiddenButtons: [],
                        scrollResult: null
                    };
                    
                    const docs = getDocuments();
                    log('Found ' + docs.length + ' documents');
                    
                    const selectors = ['.bg-ide-button-background', 'button.cursor-pointer', '.bg-primary button'];
                    
                    // 找所有 Run 按钮
                    for (const doc of docs) {
                        const viewport = getViewportInfo(doc);
                        log('Viewport: ' + viewport.width + 'x' + viewport.height);
                        
                        for (const selector of selectors) {
                            try {
                                const elements = doc.querySelectorAll(selector);
                                for (const el of elements) {
                                    const text = (el.textContent || '').trim();
                                    if (!text || !isAcceptText(text)) continue;
                                    
                                    const rect = el.getBoundingClientRect();
                                    const style = doc.defaultView.getComputedStyle(el);
                                    const inViewport = isInViewport(el, viewport);
                                    
                                    const btnInfo = {
                                        text: text.substring(0, 30),
                                        selector: selector,
                                        rect: { 
                                            x: Math.round(rect.x), 
                                            y: Math.round(rect.y), 
                                            w: Math.round(rect.width), 
                                            h: Math.round(rect.height)
                                        },
                                        inViewport: inViewport,
                                        display: style.display,
                                        visibility: style.visibility,
                                        disabled: el.disabled
                                    };
                                    
                                    results.foundButtons.push(btnInfo);
                                    
                                    if (!inViewport && rect.width > 0 && rect.height > 0) {
                                        log('⚠️  HIDDEN BUTTON FOUND: "' + text + '"');
                                        log('   Position: (' + Math.round(rect.x) + ', ' + Math.round(rect.y) + ')');
                                        log('   Viewport: ' + viewport.width + 'x' + viewport.height);
                                        results.hiddenButtons.push({ el, btnInfo, doc });
                                    }
                                }
                            } catch (e) {
                                log('Error: ' + e.message);
                            }
                        }
                    }
                    
                    // 如果找到隐藏的按钮，尝试滚动并点击
                    if (results.hiddenButtons.length > 0) {
                        const { el, btnInfo, doc } = results.hiddenButtons[0];
                        const viewport = getViewportInfo(doc);
                        
                        log('');
                        log('=== TESTING SCROLL-THEN-CLICK ===');
                        log('Before scroll:');
                        log('  - Button position: (' + btnInfo.rect.x + ', ' + btnInfo.rect.y + ')');
                        log('  - In viewport: ' + btnInfo.inViewport);
                        
                        // 滚动到按钮位置
                        el.scrollIntoView({ behavior: 'instant', block: 'center' });
                        
                        // 等待滚动完成
                        await new Promise(r => setTimeout(r, 100));
                        
                        // 重新获取位置
                        const newRect = el.getBoundingClientRect();
                        const nowInViewport = isInViewport(el, viewport);
                        
                        log('');
                        log('After scroll:');
                        log('  - Button position: (' + Math.round(newRect.x) + ', ' + Math.round(newRect.y) + ')');
                        log('  - In viewport: ' + nowInViewport);
                        
                        results.scrollResult = {
                            beforePosition: btnInfo.rect,
                            afterPosition: { 
                                x: Math.round(newRect.x), 
                                y: Math.round(newRect.y),
                                w: Math.round(newRect.width),
                                h: Math.round(newRect.height)
                            },
                            wasInViewport: btnInfo.inViewport,
                            nowInViewport: nowInViewport,
                            scrollWorked: !btnInfo.inViewport && nowInViewport
                        };
                        
                        if (nowInViewport) {
                            log('');
                            log('✅ Scroll successful! Button is now visible.');
                            log('🎯 Clicking the button...');
                            
                            // 点击按钮
                            el.dispatchEvent(new MouseEvent('click', { 
                                view: doc.defaultView, 
                                bubbles: true, 
                                cancelable: true 
                            }));
                            
                            log('✅ Click dispatched!');
                            results.scrollResult.clicked = true;
                        } else {
                            log('');
                            log('❌ Scroll did NOT work. Button still not in viewport.');
                            results.scrollResult.clicked = false;
                        }
                    } else if (results.foundButtons.length > 0) {
                        log('');
                        log('All buttons are already visible. No scroll needed.');
                    } else {
                        log('');
                        log('No Run/Accept buttons found on this page.');
                    }
                    
                    return {
                        logs: logs,
                        foundButtons: results.foundButtons,
                        hiddenButtonCount: results.hiddenButtons.length,
                        scrollResult: results.scrollResult
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

            console.log('\n=== Summary ===');
            console.log('Total buttons found:', data.foundButtons.length);
            console.log('Hidden buttons found:', data.hiddenButtonCount);

            if (data.scrollResult) {
                console.log('\n=== Scroll Test Result ===');
                console.log('Before:', JSON.stringify(data.scrollResult.beforePosition));
                console.log('After:', JSON.stringify(data.scrollResult.afterPosition));
                console.log('Was in viewport:', data.scrollResult.wasInViewport);
                console.log('Now in viewport:', data.scrollResult.nowInViewport);
                console.log('Scroll worked:', data.scrollResult.scrollWorked ? '✅ YES' : '❌ NO');
                console.log('Button clicked:', data.scrollResult.clicked ? '✅ YES' : '❌ NO');
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
        console.error('Make sure Antigravity is running with remote debugging enabled.');
        process.exit(1);
    });
}

main();
