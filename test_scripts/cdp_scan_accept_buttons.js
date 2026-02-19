/**
 * CDP Test - Scan & optionally click Accept/File-Edit buttons
 * 
 * Modes:
 *   node test_scripts/cdp_scan_accept_buttons.js          # scan only
 *   node test_scripts/cdp_scan_accept_buttons.js --click   # scan + click Accept all
 * 
 * Port: 9000 (Antigravity CDP)
 */

const WebSocket = require('ws');
const http = require('http');

const DO_CLICK = process.argv.includes('--click');

async function getPages() {
    return new Promise((resolve, reject) => {
        http.get('http://127.0.0.1:9000/json', (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data).filter(p => p.type === 'page'));
                } catch (e) { reject(e); }
            });
        }).on('error', reject);
    });
}

function scanPage(pageInfo, doClick) {
    return new Promise((resolve) => {
        const globalTimeout = setTimeout(() => {
            try { ws.close(); } catch (e) { }
            resolve({ title: pageInfo.title, error: 'TIMEOUT (5s)' });
        }, 5000);

        let ws;
        try {
            ws = new WebSocket(pageInfo.webSocketDebuggerUrl);
        } catch (e) {
            clearTimeout(globalTimeout);
            resolve({ title: pageInfo.title, error: 'WS create failed: ' + e.message });
            return;
        }

        let mid = 1;
        const send = (m, p = {}) => new Promise((res, rej) => {
            const id = mid++;
            const t = setTimeout(() => rej(new Error('send timeout')), 4000);
            const h = (d) => {
                const msg = JSON.parse(d.toString());
                if (msg.id === id) { clearTimeout(t); ws.off('message', h); msg.error ? rej(new Error(msg.error.message)) : res(msg.result); }
            };
            ws.on('message', h);
            ws.send(JSON.stringify({ id, method: m, params: p }));
        });

        ws.on('error', () => {
            clearTimeout(globalTimeout);
            resolve({ title: pageInfo.title, error: 'WS error' });
        });

        ws.on('open', async () => {
            try {
                await send('Runtime.enable');

                // ===== STEP 1: Broad scan with OLD + NEW selectors =====
                const scanScript = `(function() {
                    var res = { panels: [], buttons: [], clickResult: null };

                    // 找 panels
                    document.querySelectorAll('[id*="antigravity"], [id*="agentPanel"]').forEach(function(p) {
                        if (p.offsetWidth > 10) res.panels.push({ id: p.id, w: p.offsetWidth, h: p.offsetHeight });
                    });

                    // ===== 关键改动：扩展选择器，覆盖 SPAN 和其他新元素 =====
                    var OLD_SELECTORS = [
                        'button',
                        '[role="button"]',
                        '.bg-ide-button-background',
                        'button.cursor-pointer',
                        '.bg-primary button'
                    ];
                    var NEW_SELECTORS = [
                        '[class*="bg-ide-button"]',           // 新版 span 有 bg-ide-button-* 类
                        'span.cursor-pointer',                // 新版用 span 代替 button
                        '[class*="cursor-pointer"][class*="rounded"]'  // 更宽泛的匹配
                    ];
                    var ALL_SELECTORS = OLD_SELECTORS.concat(NEW_SELECTORS);

                    var KEYWORDS = ['accept', 'run', 'retry', 'apply', 'execute', 'confirm', 'allow', 'resume'];
                    var seen = {};

                    ALL_SELECTORS.forEach(function(sel) {
                        try {
                            document.querySelectorAll(sel).forEach(function(el) {
                                var t = (el.textContent || '').trim();
                                if (!t || t.length > 80) return;
                                var lt = t.toLowerCase();
                                if (!KEYWORDS.some(function(k) { return lt.indexOf(k) >= 0; })) return;

                                // 去重
                                var rect = el.getBoundingClientRect();
                                var key = t + '|' + Math.round(rect.y);
                                if (seen[key]) return;
                                seen[key] = true;

                                var style = window.getComputedStyle(el);
                                var visible = style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;

                                var isOld = OLD_SELECTORS.indexOf(sel) >= 0;

                                res.buttons.push({
                                    text: t.substring(0, 60),
                                    tag: el.tagName,
                                    matchedBy: sel,
                                    isOldSelector: isOld,
                                    isNewSelector: !isOld,
                                    fullClass: (el.className || '').toString(),
                                    visible: visible,
                                    disabled: el.disabled || false,
                                    x: Math.round(rect.x), y: Math.round(rect.y),
                                    w: Math.round(rect.width), h: Math.round(rect.height),
                                    parentTag: el.parentElement ? el.parentElement.tagName : '',
                                    parentCls: el.parentElement ? (el.parentElement.className || '').toString().substring(0, 80) : '',
                                    isFileEdit: lt.indexOf('accept all') >= 0 || lt.indexOf('accept file') >= 0,
                                    isRun: lt.indexOf('run') >= 0,
                                    isRetry: lt.indexOf('retry') >= 0
                                });
                            });
                        } catch(e) {}
                    });

                    // ===== STEP 2: 如果 --click 模式，尝试点击 Accept all =====
                    if (${doClick ? 'true' : 'false'}) {
                        var acceptAllBtns = res.buttons.filter(function(b) { return b.isFileEdit && b.visible; });
                        if (acceptAllBtns.length > 0) {
                            // 重新找到元素并点击
                            var allEls = document.querySelectorAll('[class*="bg-ide-button"], span.cursor-pointer, button');
                            for (var i = 0; i < allEls.length; i++) {
                                var el = allEls[i];
                                var txt = (el.textContent || '').trim().toLowerCase();
                                if (txt.indexOf('accept all') >= 0 || txt.indexOf('accept file') >= 0) {
                                    var r = el.getBoundingClientRect();
                                    if (r.width > 0 && r.height > 0) {
                                        el.dispatchEvent(new MouseEvent('click', { view: window, bubbles: true, cancelable: true }));
                                        res.clickResult = { clicked: true, text: txt, tag: el.tagName, x: Math.round(r.x), y: Math.round(r.y) };
                                        break;
                                    }
                                }
                            }
                            if (!res.clickResult) {
                                res.clickResult = { clicked: false, reason: 'element not re-found' };
                            }
                        } else {
                            res.clickResult = { clicked: false, reason: 'no visible Accept all button found' };
                        }
                    }

                    return JSON.stringify(res);
                })()`;

                const r = await send('Runtime.evaluate', { expression: scanScript, returnByValue: true });
                clearTimeout(globalTimeout);
                ws.close();
                resolve({ title: pageInfo.title, data: JSON.parse(r.result.value) });
            } catch (e) {
                clearTimeout(globalTimeout);
                try { ws.close(); } catch (x) { }
                resolve({ title: pageInfo.title, error: e.message });
            }
        });
    });
}

async function main() {
    console.log('=== CDP Scan: Accept Buttons (port 9000) ===');
    console.log('Mode: ' + (DO_CLICK ? '🔴 CLICK MODE' : '🔍 SCAN ONLY'));
    console.log('');

    const pages = await getPages();
    console.log('Found ' + pages.length + ' pages\n');

    for (const page of pages) {
        console.log('--- Page: ' + (page.title || '(untitled)') + ' ---');
        const result = await scanPage(page, DO_CLICK);

        if (result.error) {
            console.log('  Error: ' + result.error);
        } else {
            const d = result.data;

            // Panels
            if (d.panels.length > 0) {
                console.log('  📐 Panels:');
                d.panels.forEach(p => console.log('    [' + p.id + '] ' + p.w + 'x' + p.h));
            }

            // Buttons
            if (d.buttons.length > 0) {
                console.log('  🎯 Accept/Run/Retry Buttons:');
                d.buttons.forEach((b, i) => {
                    var flags = [];
                    if (b.isFileEdit) flags.push('📝FILE_EDIT');
                    if (b.isRun) flags.push('▶️RUN');
                    if (b.isRetry) flags.push('🔄RETRY');
                    var selectorFlag = b.isOldSelector ? '🟡OLD_SEL' : '🟢NEW_SEL';
                    console.log('');
                    console.log('    ' + (i + 1) + '. "' + b.text + '" ' + flags.join(' ') + ' ' + selectorFlag);
                    console.log('       tag=<' + b.tag + '> visible=' + b.visible + ' disabled=' + b.disabled);
                    console.log('       pos=(' + b.x + ',' + b.y + ') size=' + b.w + 'x' + b.h);
                    console.log('       matchedBy: "' + b.matchedBy + '"');
                    console.log('       fullClass: "' + b.fullClass + '"');
                    console.log('       parent: <' + b.parentTag + '> cls="' + b.parentCls + '"');
                });
            } else {
                console.log('  ⚠️  No accept/run/retry buttons found');
            }

            // Click result
            if (d.clickResult) {
                console.log('');
                if (d.clickResult.clicked) {
                    console.log('  ✅ CLICK SUCCESS: "' + d.clickResult.text + '" <' + d.clickResult.tag + '> at (' + d.clickResult.x + ',' + d.clickResult.y + ')');
                } else {
                    console.log('  ❌ CLICK FAILED: ' + d.clickResult.reason);
                }
            }
        }
        console.log('');
    }
    console.log('Done.');
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
