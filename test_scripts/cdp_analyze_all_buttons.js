/**
 * CDP Test Script - Analyze ALL buttons to find "Always run" button
 * This helps identify which buttons are being incorrectly clicked
 * 
 * Usage: node test_scripts/cdp_analyze_all_buttons.js
 */

const WebSocket = require('ws');

const PAGE_ID = 'F30DB204CB27AE1271FCD7083D295C3F';
const WS_URL = `ws://127.0.0.1:9000/devtools/page/${PAGE_ID}`;

async function main() {
    console.log('=== CDP All Buttons Analysis ===\n');
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

            // 分析所有按钮，找出会被当前选择器匹配的按钮
            const analysisScript = `
                (function() {
                    const results = {
                        currentSelectors: [
                            '.bg-ide-button-background',
                            'button.cursor-pointer',
                            '.bg-primary button'
                        ],
                        allMatchedButtons: [],
                        alwaysRunButtons: []
                    };
                    
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
                    
                    const docs = getDocuments();
                    results.documentCount = docs.length;
                    
                    // 对每个选择器查找匹配的按钮
                    for (const selector of results.currentSelectors) {
                        for (const doc of docs) {
                            try {
                                const elements = doc.querySelectorAll(selector);
                                for (const el of elements) {
                                    const text = (el.textContent || '').trim();
                                    const lowerText = text.toLowerCase();
                                    
                                    const rect = el.getBoundingClientRect();
                                    const style = el.ownerDocument.defaultView.getComputedStyle(el);
                                    
                                    const buttonInfo = {
                                        selector: selector,
                                        tagName: el.tagName,
                                        text: text.substring(0, 50),
                                        fullText: text,
                                        className: el.className,
                                        id: el.id || '',
                                        visible: style.display !== 'none' && 
                                                 style.visibility !== 'hidden' && 
                                                 rect.width > 0 && 
                                                 rect.height > 0,
                                        disabled: el.disabled || false,
                                        rect: { 
                                            x: Math.round(rect.x), 
                                            y: Math.round(rect.y), 
                                            w: Math.round(rect.width), 
                                            h: Math.round(rect.height) 
                                        }
                                    };
                                    
                                    // 检查是否包含 "always" 关键词
                                    if (lowerText.includes('always')) {
                                        results.alwaysRunButtons.push({
                                            ...buttonInfo,
                                            WARNING: '⚠️ This button contains ALWAYS and may be clicked repeatedly!'
                                        });
                                    }
                                    
                                    // 只记录可见的按钮
                                    if (buttonInfo.visible) {
                                        results.allMatchedButtons.push(buttonInfo);
                                    }
                                }
                            } catch (e) {
                                // selector error
                            }
                        }
                    }
                    
                    return JSON.stringify(results, null, 2);
                })()
            `;

            console.log('Analyzing all buttons...\n');

            const result = await send('Runtime.evaluate', {
                expression: analysisScript,
                returnByValue: true
            });

            const data = JSON.parse(result.result.value);

            console.log('=== Analysis Result ===\n');
            console.log(`Documents found: ${data.documentCount}`);
            console.log(`Current selectors: ${data.currentSelectors.join(', ')}`);
            console.log(`\nTotal visible matched buttons: ${data.allMatchedButtons.length}\n`);

            // 显示所有匹配的按钮
            console.log('All Matched Buttons:');
            data.allMatchedButtons.forEach((btn, i) => {
                console.log(`\n${i + 1}. [${btn.selector}] ${btn.tagName}`);
                console.log(`   Text: "${btn.text}"`);
                console.log(`   Class: ${btn.className.substring(0, 60)}`);
                console.log(`   Visible: ${btn.visible}, Disabled: ${btn.disabled}`);
                console.log(`   Position: (${btn.rect.x}, ${btn.rect.y}) Size: ${btn.rect.w}x${btn.rect.h}`);
            });

            // 特别标记 "Always" 按钮
            console.log('\n\n=== ⚠️  ALWAYS RUN BUTTONS FOUND ===');
            if (data.alwaysRunButtons.length > 0) {
                console.log(`Found ${data.alwaysRunButtons.length} button(s) with "always" keyword:\n`);
                data.alwaysRunButtons.forEach((btn, i) => {
                    console.log(`${i + 1}. [${btn.selector}] ${btn.tagName}`);
                    console.log(`   🔴 Full Text: "${btn.fullText}"`);
                    console.log(`   Class: ${btn.className}`);
                    console.log(`   Visible: ${btn.visible}, Disabled: ${btn.disabled}`);
                    console.log(`   ${btn.WARNING}\n`);
                });

                console.log('⚠️  These buttons will be clicked repeatedly by the current code!');
            } else {
                console.log('No "always" buttons found.');
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
