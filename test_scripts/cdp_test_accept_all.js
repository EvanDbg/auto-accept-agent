/**
 * CDP Test - Diagnose & Click "Accept All" button
 * 
 * This script:
 * 1. Scans ALL pages for Accept-type buttons
 * 2. Simulates the exact isAcceptButton() logic from full_cdp_script.js
 * 3. Reports WHY each button passes or fails
 * 4. Optionally clicks the Accept All button (with --click flag)
 * 
 * Usage:
 *   node test_scripts/cdp_test_accept_all.js          # diagnose only
 *   node test_scripts/cdp_test_accept_all.js --click   # diagnose + click
 */
const WebSocket = require('ws');
const http = require('http');

const DO_CLICK = process.argv.includes('--click');

function getPages() {
    return new Promise((resolve, reject) => {
        http.get('http://127.0.0.1:9000/json', (res) => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => {
                try { resolve(JSON.parse(data).filter(p => p.type === 'page')); }
                catch (e) { reject(e); }
            });
        }).on('error', reject);
    });
}

function evalOnPage(pageInfo, expr) {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => { reject(new Error('TIMEOUT (5s)')); try { ws.close(); } catch (e) { } }, 5000);
        var ws = new WebSocket(pageInfo.webSocketDebuggerUrl);
        ws.on('error', (e) => { clearTimeout(timeout); reject(e); });
        ws.on('open', () => {
            ws.send(JSON.stringify({
                id: 1,
                method: 'Runtime.evaluate',
                params: { expression: expr, returnByValue: true }
            }));
            ws.on('message', (d) => {
                var msg = JSON.parse(d.toString());
                if (msg.id === 1) {
                    clearTimeout(timeout);
                    ws.close();
                    if (msg.error) reject(new Error(msg.error.message));
                    else if (msg.result.result.type === 'undefined') resolve(undefined);
                    else resolve(msg.result.result.value);
                }
            });
        });
    });
}

const SCAN_SCRIPT = `(function() {
    var doClick = CLICK_PLACEHOLDER;
    var result = { state: null, buttons: [], badges: 0, clickResults: [] };

    // 1. Check Auto Accept state
    var s = window.__autoAcceptState;
    if (s) {
        result.state = {
            isRunning: s.isRunning,
            mode: s.currentMode,
            bgMode: s.isBackgroundMode,
            autoAcceptFileEdits: s.autoAcceptFileEdits,
            sid: s.sessionID,
            completion: s.completionStatus || {}
        };
    }

    // 2. Count Good/Bad badges
    document.querySelectorAll('span').forEach(function(span) {
        var t = span.textContent.trim();
        if (t === 'Good' || t === 'Bad') result.badges++;
    });

    // 3. Find ALL potential accept buttons with detailed checks
    var selectors = ['.bg-ide-button-background', 'button.cursor-pointer', '.bg-primary button', 'button.keep-changes', '[class*="bg-ide-button"]'];
    var seen = new Set();

    selectors.forEach(function(sel) {
        try {
            document.querySelectorAll(sel).forEach(function(el) {
                if (seen.has(el)) return;
                seen.add(el);

                var text = (el.textContent || '').trim();
                var lt = text.toLowerCase();
                if (lt.length === 0 || lt.length > 50) return;

                // Pattern checks (same as isAcceptButton)
                var patterns = ['accept', 'run', 'retry', 'apply', 'execute', 'confirm', 'allow once', 'allow', 'accept changes'];
                var rejects = ['skip', 'reject', 'cancel', 'close', 'refine', 'always run'];
                var matchedP = patterns.filter(function(p) { return lt.indexOf(p) >= 0; });
                var matchedR = rejects.filter(function(r) { return lt.indexOf(r) >= 0; });
                if (matchedP.length === 0) return; // not an accept button

                // File edit check
                var isFileEdit = lt.indexOf('accept all') >= 0 || lt.indexOf('accept file') >= 0 || lt.indexOf('accept changes') >= 0;
                var fileEditDisabled = isFileEdit && s && s.autoAcceptFileEdits === false;

                // Visibility checks
                var style = window.getComputedStyle(el);
                var rect = el.getBoundingClientRect();
                var vw = window.innerWidth || document.documentElement.clientWidth;
                var vh = window.innerHeight || document.documentElement.clientHeight;
                var inVP = rect.bottom > 0 && rect.top < vh && rect.right > 0 && rect.left < vw;

                var checks = {
                    patternMatch: matchedP,
                    rejectMatch: matchedR,
                    isFileEdit: isFileEdit,
                    fileEditDisabled: fileEditDisabled,
                    display: style.display !== 'none',
                    visibility: style.visibility !== 'hidden',
                    opacity: parseFloat(style.opacity) !== 0,
                    pointerEvents: style.pointerEvents !== 'none',
                    notDisabled: !el.disabled,
                    hasDimensions: rect.width > 0 && rect.height > 0,
                    inViewport: inVP
                };

                // Check if inside agentPanel
                var p = el, inPanel = false;
                while (p) {
                    if (p.id && p.id.indexOf('antigravity') >= 0) inPanel = true;
                    p = p.parentElement;
                }

                var wouldPass = matchedP.length > 0 && matchedR.length === 0 && !fileEditDisabled
                    && checks.display && checks.visibility && checks.opacity
                    && checks.pointerEvents && checks.notDisabled
                    && checks.hasDimensions && checks.inViewport;

                var failures = [];
                if (matchedR.length > 0) failures.push('REJECT:' + matchedR.join(','));
                if (fileEditDisabled) failures.push('FILE_EDITS_DISABLED');
                if (!checks.display) failures.push('display:none');
                if (!checks.visibility) failures.push('visibility:hidden');
                if (!checks.opacity) failures.push('opacity:0');
                if (!checks.pointerEvents) failures.push('pointerEvents:none');
                if (!checks.notDisabled) failures.push('disabled');
                if (!checks.hasDimensions) failures.push('zero_size');
                if (!checks.inViewport) failures.push('OUT_OF_VIEWPORT(rect:' + Math.round(rect.left) + ',' + Math.round(rect.top) + ',' + Math.round(rect.right) + ',' + Math.round(rect.bottom) + ' vp:' + vw + 'x' + vh + ')');

                result.buttons.push({
                    text: text,
                    tag: el.tagName,
                    selector: sel,
                    wouldPass: wouldPass,
                    failures: failures,
                    inPanel: inPanel,
                    isFileEdit: isFileEdit,
                    rect: [Math.round(rect.left), Math.round(rect.top), Math.round(rect.width), Math.round(rect.height)],
                    viewport: [vw, vh]
                });

                // Click if requested and it's an Accept All button
                if (doClick && isFileEdit && wouldPass) {
                    el.dispatchEvent(new MouseEvent('click', { view: window, bubbles: true, cancelable: true }));
                    result.clickResults.push({ text: text, clicked: true });
                } else if (doClick && isFileEdit && !wouldPass) {
                    // Try clicking anyway to test
                    el.dispatchEvent(new MouseEvent('click', { view: window, bubbles: true, cancelable: true }));
                    result.clickResults.push({ text: text, clicked: true, forced: true, failures: failures });
                }
            });
        } catch(e) {}
    });

    return JSON.stringify(result);
})()`;

async function main() {
    console.log('===========================================');
    console.log('  CDP Accept All Button Diagnostic Tool');
    console.log('  Mode: ' + (DO_CLICK ? '🔴 CLICK' : '🔍 SCAN ONLY'));
    console.log('===========================================\n');

    const pages = await getPages();
    console.log('Found ' + pages.length + ' pages\n');

    for (const page of pages) {
        console.log('━━━ Page: ' + (page.title || '(untitled)') + ' ━━━');

        try {
            const script = SCAN_SCRIPT.replace('CLICK_PLACEHOLDER', DO_CLICK ? 'true' : 'false');
            const raw = await evalOnPage(page, script);
            if (!raw) { console.log('  (no result)\n'); continue; }

            const r = JSON.parse(raw);

            // State
            if (r.state) {
                console.log('\n  📊 Auto Accept State:');
                console.log('     isRunning: ' + r.state.isRunning);
                console.log('     mode: ' + r.state.mode);
                console.log('     autoAcceptFileEdits: ' + r.state.autoAcceptFileEdits);
                console.log('     bgMode: ' + r.state.bgMode);
                console.log('     completion: ' + JSON.stringify(r.state.completion));
            } else {
                console.log('\n  ⚠️  Auto Accept NOT injected on this page');
            }

            // Badges
            console.log('\n  🏷  Good/Bad badges: ' + r.badges);
            if (r.badges > 0) {
                console.log('     → hasBadge=true: main loop SKIPS panel clicks');
                console.log('     → BUT file-edit global scan should still run');
            }

            // Buttons
            if (r.buttons.length === 0) {
                console.log('\n  ⚠️  No accept-type buttons found');
            } else {
                console.log('\n  🎯 Accept-type buttons found: ' + r.buttons.length);
                r.buttons.forEach(function (b, i) {
                    var icon = b.wouldPass ? '✅' : '❌';
                    var fileIcon = b.isFileEdit ? ' 📝' : '';
                    console.log('\n     ' + (i + 1) + '. ' + icon + ' "' + b.text + '" <' + b.tag + '>' + fileIcon);
                    console.log('        selector: ' + b.selector);
                    console.log('        rect: [' + b.rect.join(', ') + ']  viewport: [' + b.viewport.join(', ') + ']');
                    console.log('        inPanel: ' + b.inPanel);
                    if (b.wouldPass) {
                        console.log('        → isAcceptButton() would PASS ✅');
                    } else {
                        console.log('        → isAcceptButton() would FAIL ❌');
                        console.log('        → Reasons: ' + b.failures.join(', '));
                    }
                });
            }

            // Click results
            if (r.clickResults.length > 0) {
                console.log('\n  🖱  Click Results:');
                r.clickResults.forEach(function (c) {
                    if (c.forced) {
                        console.log('     ⚠️ FORCE-clicked "' + c.text + '" (would normally fail: ' + c.failures.join(', ') + ')');
                    } else {
                        console.log('     ✅ Clicked "' + c.text + '"');
                    }
                });
            }

        } catch (e) {
            console.log('  Error: ' + e.message);
        }
        console.log('');
    }

    console.log('Done.');
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
