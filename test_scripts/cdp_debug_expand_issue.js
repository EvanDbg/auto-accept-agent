/**
 * CDP Debug Script - Diagnose Expand Button Not Being Clicked
 * 
 * Tests the exact issue: "Step Requires Input" is present but Expand button
 * in the same panel is not being clicked.
 * 
 * Usage: node test_scripts/cdp_debug_expand_issue.js [PAGE_ID]
 */

const WebSocket = require('ws');

const PAGE_ID = process.argv[2] || '67F75EE97DD3DCEADC3C4760FB4133FC';
const WS_URL = `ws://127.0.0.1:9000/devtools/page/${PAGE_ID}`;

async function main() {
    console.log('=== CDP Debug: Expand Button Issue ===\n');
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

            const debugScript = `
                (async function() {
                    const logs = [];
                    const log = (msg) => { logs.push(msg); console.log('[Debug] ' + msg); };
                    
                    // Helper: Get all documents including iframes
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
                    log('Total documents found: ' + docs.length);
                    
                    // 1. Check for "Step Requires Input" indicator
                    let stepRequiresInputElement = null;
                    let hasStepInput = false;
                    
                    for (const doc of docs) {
                        const allElements = doc.querySelectorAll('*');
                        for (const el of allElements) {
                            const text = (el.textContent || '').trim();
                            if (text.includes('Step Requires Input') || text.includes('Requires Input')) {
                                hasStepInput = true;
                                // Find the most specific element containing this text
                                if (!stepRequiresInputElement || 
                                    el.textContent.length < stepRequiresInputElement.textContent.length) {
                                    stepRequiresInputElement = el;
                                }
                            }
                        }
                    }
                    
                    log('===== STEP 1: Check for Step Requires Input =====');
                    log('Has "Step Requires Input": ' + (hasStepInput ? 'YES ✅' : 'NO'));
                    
                    if (stepRequiresInputElement) {
                        const rect = stepRequiresInputElement.getBoundingClientRect();
                        log('Element tag: ' + stepRequiresInputElement.tagName);
                        log('Element text (first 100 chars): ' + stepRequiresInputElement.textContent.substring(0, 100));
                        log('Position: y=' + Math.round(rect.y) + ', height=' + Math.round(rect.height));
                    }
                    
                    // 2. Find the Step Panel container
                    log('');
                    log('===== STEP 2: Find Step Panel Container =====');
                    let stepPanel = null;
                    
                    if (stepRequiresInputElement) {
                        let container = stepRequiresInputElement;
                        for (let i = 0; i < 10 && container.parentElement; i++) {
                            container = container.parentElement;
                            const rect = container.getBoundingClientRect();
                            log('Walking up level ' + i + ': tag=' + container.tagName + 
                                ', height=' + Math.round(rect.height) + ', classes=' + container.className.substring(0, 50));
                            
                            // Stop when we find a container that's reasonably sized
                            if (rect.height > 200 && rect.height < 1000) {
                                stepPanel = container;
                                log('>>> Found step panel at level ' + i);
                                break;
                            }
                        }
                    }
                    
                    // 3. Search for Expand buttons
                    log('');
                    log('===== STEP 3: Search for Expand Buttons =====');
                    
                    const allExpandButtons = [];
                    const expandInPanel = [];
                    
                    for (const doc of docs) {
                        const buttons = doc.querySelectorAll('button, [role="button"]');
                        for (const btn of buttons) {
                            const text = (btn.textContent || '').trim();
                            if (text === 'Expand' || text === 'Expand all') {
                                const rect = btn.getBoundingClientRect();
                                const info = {
                                    text: text,
                                    y: Math.round(rect.y),
                                    visible: rect.width > 0 && rect.height > 0,
                                    inViewport: rect.y > 0 && rect.y < window.innerHeight,
                                    inStepPanel: stepPanel ? stepPanel.contains(btn) : false
                                };
                                allExpandButtons.push(info);
                                
                                if (info.inStepPanel) {
                                    expandInPanel.push(btn);
                                }
                                
                                log('Found "' + text + '" at y=' + info.y + 
                                    ' | visible=' + info.visible + 
                                    ' | inViewport=' + info.inViewport + 
                                    ' | inStepPanel=' + info.inStepPanel);
                            }
                        }
                    }
                    
                    log('Total Expand buttons found: ' + allExpandButtons.length);
                    log('Expand buttons in step panel: ' + expandInPanel.length);
                    
                    // 4. Search for Run/Accept buttons
                    log('');
                    log('===== STEP 4: Search for Run/Accept Buttons =====');
                    
                    const actionButtons = [];
                    for (const doc of docs) {
                        const buttons = doc.querySelectorAll('button, .bg-ide-button-background');
                        for (const btn of buttons) {
                            const t = (btn.textContent || '').trim().toLowerCase();
                            if ((t.includes('run') && !t.includes('running')) || 
                                t.includes('accept') || 
                                t.includes('allow') ||
                                t.includes('always allow')) {
                                const rect = btn.getBoundingClientRect();
                                const info = {
                                    text: btn.textContent.trim().substring(0, 30),
                                    y: Math.round(rect.y),
                                    visible: rect.width > 0 && rect.height > 0,
                                    inViewport: rect.y > 0 && rect.y < window.innerHeight,
                                    inStepPanel: stepPanel ? stepPanel.contains(btn) : false
                                };
                                actionButtons.push(info);
                                
                                log('Found action button: "' + info.text + '" at y=' + info.y + 
                                    ' | visible=' + info.visible + 
                                    ' | inViewport=' + info.inViewport);
                            }
                        }
                    }
                    
                    log('Total action buttons found: ' + actionButtons.length);
                    
                    // 5. Diagnosis
                    log('');
                    log('===== DIAGNOSIS =====');
                    
                    const diagnosis = [];
                    
                    if (hasStepInput && expandInPanel.length > 0 && actionButtons.length === 0) {
                        diagnosis.push('🔴 ISSUE CONFIRMED: Step Requires Input + Expand in panel + NO action buttons visible');
                        diagnosis.push('💡 Need to click Expand to reveal Run buttons');
                    } else if (hasStepInput && expandInPanel.length === 0) {
                        diagnosis.push('🟠 Step Requires Input but no Expand buttons in the detected panel');
                        diagnosis.push('💡 Panel detection may be incorrect');
                    } else if (hasStepInput && actionButtons.length > 0) {
                        diagnosis.push('🟢 Step Requires Input AND action buttons are visible');
                        diagnosis.push('💡 performClick should work - check if buttons are being clicked');
                    } else if (!hasStepInput) {
                        diagnosis.push('🟢 No "Step Requires Input" detected');
                        diagnosis.push('💡 The issue may not be present right now');
                    }
                    
                    // Check if Expand button is outside viewport
                    if (allExpandButtons.some(b => !b.inViewport && b.visible)) {
                        diagnosis.push('⚠️ Some Expand buttons are outside viewport');
                    }
                    
                    diagnosis.forEach(d => log(d));
                    
                    // 6. Test: Click Expand if applicable
                    log('');
                    log('===== TEST: Attempt to Click Expand =====');
                    
                    let clicked = 0;
                    for (const btn of expandInPanel) {
                        const text = btn.textContent.trim();
                        let rect = btn.getBoundingClientRect();
                        const vp = window.innerHeight;
                        
                        // Scroll into view if needed
                        if (rect.y < 0 || rect.y > vp) {
                            log('Scrolling "' + text + '" into view...');
                            btn.scrollIntoView({ behavior: 'instant', block: 'center' });
                            await new Promise(r => setTimeout(r, 200));
                            rect = btn.getBoundingClientRect();
                        }
                        
                        if (rect.width > 0 && rect.height > 0) {
                            log('Clicking "' + text + '" at y=' + Math.round(rect.y));
                            btn.dispatchEvent(new MouseEvent('click', {
                                view: window,
                                bubbles: true,
                                cancelable: true
                            }));
                            clicked++;
                            await new Promise(r => setTimeout(r, 300));
                        }
                    }
                    
                    log('Clicked ' + clicked + ' Expand button(s)');
                    
                    // Wait and check for revealed buttons
                    await new Promise(r => setTimeout(r, 500));
                    
                    log('');
                    log('===== AFTER EXPAND: Check for New Action Buttons =====');
                    
                    let afterActionButtons = 0;
                    for (const doc of docs) {
                        const buttons = doc.querySelectorAll('button, .bg-ide-button-background');
                        for (const btn of buttons) {
                            const t = (btn.textContent || '').trim().toLowerCase();
                            if ((t.includes('run') && !t.includes('running')) || 
                                t.includes('accept') || 
                                t.includes('allow')) {
                                const rect = btn.getBoundingClientRect();
                                if (rect.width > 0 && rect.y > 0 && rect.y < window.innerHeight) {
                                    afterActionButtons++;
                                    log('🎯 Now visible: "' + btn.textContent.trim().substring(0, 30) + 
                                        '" at y=' + Math.round(rect.y));
                                }
                            }
                        }
                    }
                    
                    log('Action buttons now visible: ' + afterActionButtons);
                    
                    const success = afterActionButtons > actionButtons.length;
                    if (clicked > 0) {
                        log(success ? '✅ SUCCESS: Expand revealed new buttons!' : 
                            '❌ Expand clicked but no new buttons appeared');
                    }
                    
                    return {
                        logs: logs,
                        hasStepInput: hasStepInput,
                        stepPanelFound: !!stepPanel,
                        expandButtonsTotal: allExpandButtons.length,
                        expandButtonsInPanel: expandInPanel.length,
                        actionButtonsBefore: actionButtons.length,
                        actionButtonsAfter: afterActionButtons,
                        expandClicked: clicked,
                        success: success
                    };
                })()
            `;

            console.log('Executing diagnostic script...\n');

            const result = await send('Runtime.evaluate', {
                expression: debugScript,
                returnByValue: true,
                awaitPromise: true
            });

            const data = result.result.value;

            console.log('\n=== Debug Logs ===');
            data.logs.forEach(l => console.log(l));

            console.log('\n=== Summary ===');
            console.log('Has "Step Requires Input":', data.hasStepInput ? '✅ YES' : '❌ NO');
            console.log('Step panel found:', data.stepPanelFound ? '✅ YES' : '❌ NO');
            console.log('Total Expand buttons:', data.expandButtonsTotal);
            console.log('Expand buttons in panel:', data.expandButtonsInPanel);
            console.log('Action buttons before expand:', data.actionButtonsBefore);
            console.log('Action buttons after expand:', data.actionButtonsAfter);
            console.log('Expand buttons clicked:', data.expandClicked);
            console.log('Test result:', data.success ? '✅ SUCCESS' : data.expandClicked > 0 ? '⚠️ CLICKED BUT NO NEW BUTTONS' : '❓ NOT TESTED');

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
