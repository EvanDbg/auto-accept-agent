// relauches ide window with cdp enabling flag
// Improved version with dynamic shortcut search

const vscode = require('vscode');
const { execSync, spawn } = require('child_process');
const os = require('os');
const http = require('http');
const fs = require('fs');
const path = require('path');

const BASE_CDP_PORT = 9000;
const ALTERNATE_CDP_PORT = 9222;
const CDP_FLAG = `--remote-debugging-port=${BASE_CDP_PORT}`;
const CDP_ADDITIONAL_FLAGS = '--disable-gpu-driver-bug-workarounds --ignore-gpu-blacklist';

class Relauncher {
    constructor(logger = null) {
        this.platform = os.platform();
        this.logger = logger || console.log;
        this.logFile = path.join(os.tmpdir(), 'auto_accept_relaunch.log');
    }

    log(msg) {
        try {
            const timestamp = new Date().toISOString();
            const formattedMsg = `[Relauncher ${timestamp}] ${msg}`;
            if (this.logger && typeof this.logger === 'function') {
                this.logger(formattedMsg);
            }
            console.log(formattedMsg);

            // Also append to log file for debugging
            try {
                fs.appendFileSync(this.logFile, formattedMsg + '\n');
            } catch (e) { /* ignore file write errors */ }
        } catch (e) {
            console.error('Relauncher log error:', e);
        }
    }

    logToFile(msg) {
        this.log(msg);
    }

    // check if cdp is already running
    async isCDPRunning() {
        const ports = [BASE_CDP_PORT, ALTERNATE_CDP_PORT];
        for (const port of ports) {
            const running = await new Promise((resolve) => {
                const req = http.get(`http://127.0.0.1:${port}/json/version`, (res) => {
                    resolve(res.statusCode === 200);
                });
                req.on('error', () => resolve(false));
                req.setTimeout(1000, () => {
                    req.destroy();
                    resolve(false);
                });
            });
            if (running) {
                this.log(`CDP found running on port ${port}`);
                return true;
            }
        }
        return false;
    }

    // find shortcut for this ide
    getIDEName() {
        const appName = vscode.env.appName || '';
        if (appName.toLowerCase().includes('cursor')) return 'Cursor';
        if (appName.toLowerCase().includes('antigravity')) return 'Antigravity';
        return 'Code';
    }

    async findIDEShortcuts() {
        const ideName = this.getIDEName();
        this.log(`Finding shortcuts for: ${ideName}`);

        if (this.platform === 'win32') {
            return await this._findWindowsShortcutsDynamic(ideName);
        } else if (this.platform === 'darwin') {
            return await this._findMacOSShortcuts(ideName);
        } else {
            return await this._findLinuxShortcuts(ideName);
        }
    }

    /**
     * IMPROVED: Dynamic Windows shortcut search using PowerShell
     * This searches the Desktop recursively and uses fuzzy matching
     */
    async _findWindowsShortcutsDynamic(ideName) {
        const shortcuts = [];
        const scriptPath = path.join(os.tmpdir(), 'auto_accept_find_shortcuts.ps1');

        try {
            // Build PowerShell script that dynamically finds shortcuts
            const psScript = `
$ErrorActionPreference = "SilentlyContinue"
$WshShell = New-Object -ComObject WScript.Shell
$DesktopPath = [System.IO.Path]::Combine($env:USERPROFILE, "Desktop")
$StartMenuPath = [System.IO.Path]::Combine($env:APPDATA, "Microsoft", "Windows", "Start Menu", "Programs")
$TaskBarPath = [System.IO.Path]::Combine($env:APPDATA, "Microsoft", "Internet Explorer", "Quick Launch", "User Pinned", "TaskBar")

$AllShortcuts = @()

# Search Desktop (no recursion)
if (Test-Path $DesktopPath) {
    $AllShortcuts += Get-ChildItem "$DesktopPath\\*.lnk" -ErrorAction SilentlyContinue | Where-Object { $_.Name -like "*${ideName}*" }
}

# Search Start Menu (with recursion for subfolders)
if (Test-Path $StartMenuPath) {
    $AllShortcuts += Get-ChildItem "$StartMenuPath\\*.lnk" -Recurse -ErrorAction SilentlyContinue | Where-Object { $_.Name -like "*${ideName}*" }
}

# Search TaskBar
if (Test-Path $TaskBarPath) {
    $AllShortcuts += Get-ChildItem "$TaskBarPath\\*.lnk" -ErrorAction SilentlyContinue | Where-Object { $_.Name -like "*${ideName}*" }
}

if ($AllShortcuts.Count -eq 0) {
    Write-Output "NONE_FOUND"
} else {
    foreach ($ShortcutFile in $AllShortcuts) {
        try {
            $Shortcut = $WshShell.CreateShortcut($ShortcutFile.FullName)
            $ShortcutType = "unknown"
            if ($ShortcutFile.FullName -like "*Desktop*") { $ShortcutType = "desktop" }
            elseif ($ShortcutFile.FullName -like "*Start Menu*") { $ShortcutType = "startmenu" }
            elseif ($ShortcutFile.FullName -like "*TaskBar*") { $ShortcutType = "taskbar" }
            
            # Output in parseable format
            Write-Output "SHORTCUT_START"
            Write-Output "PATH:$($ShortcutFile.FullName)"
            Write-Output "TARGET:$($Shortcut.TargetPath)"
            Write-Output "ARGS:$($Shortcut.Arguments)"
            Write-Output "TYPE:$ShortcutType"
            Write-Output "SHORTCUT_END"
        } catch {
            # Skip this shortcut if we can't read it
        }
    }
}
`;
            fs.writeFileSync(scriptPath, psScript, 'utf8');
            this.log(`DEBUG: Created find shortcuts script at ${scriptPath}`);

            const result = execSync(`powershell -ExecutionPolicy Bypass -File "${scriptPath}"`, {
                encoding: 'utf8',
                timeout: 30000
            });

            this.log(`DEBUG: PowerShell output:\n${result}`);

            if (result.includes('NONE_FOUND')) {
                this.log('No shortcuts found by PowerShell search');
                return [];
            }

            // Parse the output
            const shortcutBlocks = result.split('SHORTCUT_START').filter(b => b.includes('SHORTCUT_END'));

            for (const block of shortcutBlocks) {
                const lines = block.split('\n').map(l => l.trim()).filter(l => l);

                const pathLine = lines.find(l => l.startsWith('PATH:'));
                const targetLine = lines.find(l => l.startsWith('TARGET:'));
                const argsLine = lines.find(l => l.startsWith('ARGS:'));
                const typeLine = lines.find(l => l.startsWith('TYPE:'));

                if (pathLine) {
                    const shortcutPath = pathLine.substring(5);
                    const target = targetLine ? targetLine.substring(7) : '';
                    const args = argsLine ? argsLine.substring(5) : '';
                    const type = typeLine ? typeLine.substring(5) : 'unknown';
                    const hasFlag = args.includes('--remote-debugging-port');

                    shortcuts.push({
                        path: shortcutPath,
                        target: target,
                        args: args,
                        type: type,
                        hasFlag: hasFlag
                    });

                    this.log(`Found shortcut: ${shortcutPath} (type: ${type}, hasFlag: ${hasFlag})`);
                }
            }

            this.log(`Found ${shortcuts.length} Windows shortcuts total`);
            return shortcuts;

        } catch (e) {
            this.log(`Error finding shortcuts: ${e.message}`);
            return [];
        } finally {
            try { fs.unlinkSync(scriptPath); } catch (e) { /* ignore */ }
        }
    }

    /**
     * Find the IDE executable dynamically on Windows
     */
    async _findWindowsExecutable(ideName) {
        const scriptPath = path.join(os.tmpdir(), 'auto_accept_find_exe.ps1');

        try {
            const psScript = `
$ErrorActionPreference = "SilentlyContinue"
$IdeName = "${ideName}"

# Common installation paths for Electron-based IDEs
$Paths = @(
    "$env:LOCALAPPDATA\\Programs\\$IdeName\\$IdeName.exe",
    "$env:LOCALAPPDATA\\$IdeName\\$IdeName.exe",
    "$env:ProgramFiles\\$IdeName\\$IdeName.exe",
    "\${env:ProgramFiles(x86)}\\$IdeName\\$IdeName.exe"
)

# Add VS Code specific paths
if ($IdeName -eq "Code") {
    $Paths += "$env:LOCALAPPDATA\\Programs\\Microsoft VS Code\\Code.exe"
    $Paths += "$env:ProgramFiles\\Microsoft VS Code\\Code.exe"
}

foreach ($ExePath in $Paths) {
    if (Test-Path $ExePath) {
        Write-Output "FOUND:$ExePath"
        exit
    }
}

Write-Output "NOT_FOUND"
`;
            fs.writeFileSync(scriptPath, psScript, 'utf8');

            const result = execSync(`powershell -ExecutionPolicy Bypass -File "${scriptPath}"`, {
                encoding: 'utf8',
                timeout: 10000
            }).trim();

            if (result.startsWith('FOUND:')) {
                const exePath = result.substring(6);
                this.log(`Found executable: ${exePath}`);
                return exePath;
            }

            this.log('Executable not found in common locations');
            return null;

        } catch (e) {
            this.log(`Error finding executable: ${e.message}`);
            return null;
        } finally {
            try { fs.unlinkSync(scriptPath); } catch (e) { /* ignore */ }
        }
    }

    /**
     * Create a new Windows shortcut with CDP flag if none exist
     */
    async _createWindowsShortcut(ideName, targetExe) {
        const desktopPath = path.join(process.env.USERPROFILE || '', 'Desktop');
        const shortcutPath = path.join(desktopPath, `${ideName}.lnk`);
        const scriptPath = path.join(os.tmpdir(), 'auto_accept_create_shortcut.ps1');

        try {
            const psScript = `
$ErrorActionPreference = "Stop"
try {
    $WshShell = New-Object -ComObject WScript.Shell
    $Shortcut = $WshShell.CreateShortcut('${shortcutPath.replace(/'/g, "''")}')
    $Shortcut.TargetPath = '${targetExe.replace(/'/g, "''")}'
    $Shortcut.Arguments = '${CDP_FLAG} ${CDP_ADDITIONAL_FLAGS}'
    $Shortcut.WorkingDirectory = '${path.dirname(targetExe).replace(/'/g, "''")}'
    $Shortcut.Description = '${ideName} with CDP debugging enabled'
    $Shortcut.Save()
    Write-Output "SUCCESS:$('${shortcutPath.replace(/'/g, "''")}')"
} catch {
    Write-Output "ERROR:$($_.Exception.Message)"
}
`;
            fs.writeFileSync(scriptPath, psScript, 'utf8');

            const result = execSync(`powershell -ExecutionPolicy Bypass -File "${scriptPath}"`, {
                encoding: 'utf8',
                timeout: 10000
            }).trim();

            if (result.startsWith('SUCCESS:')) {
                this.log(`Created shortcut: ${shortcutPath}`);
                return {
                    success: true,
                    path: shortcutPath,
                    target: targetExe
                };
            } else if (result.startsWith('ERROR:')) {
                const error = result.substring(6);
                this.log(`Failed to create shortcut: ${error}`);
                return { success: false, message: error };
            }

            return { success: false, message: 'Unexpected result' };

        } catch (e) {
            this.log(`Error creating shortcut: ${e.message}`);
            return { success: false, message: e.message };
        } finally {
            try { fs.unlinkSync(scriptPath); } catch (e) { /* ignore */ }
        }
    }

    /**
     * Modify a Windows shortcut to add/update CDP port
     */
    async _modifyWindowsShortcut(shortcutPath) {
        const scriptPath = path.join(os.tmpdir(), 'auto_accept_modify_shortcut.ps1');

        try {
            const psScript = `
$ErrorActionPreference = "Stop"
try {
    $WshShell = New-Object -ComObject WScript.Shell
    $Shortcut = $WshShell.CreateShortcut('${shortcutPath.replace(/'/g, "''")}')
    
    Write-Output "BEFORE_ARGS:$($Shortcut.Arguments)"
    Write-Output "TARGET:$($Shortcut.TargetPath)"
    
    $CurrentArgs = $Shortcut.Arguments
    $NewPort = '${BASE_CDP_PORT}'
    $PortPattern = '--remote-debugging-port=\\d+'
    
    if ($CurrentArgs -match $PortPattern) {
        # Replace existing port
        $NewArgs = $CurrentArgs -replace $PortPattern, "--remote-debugging-port=$NewPort"
        if ($NewArgs -ne $CurrentArgs) {
            $Shortcut.Arguments = $NewArgs
            $Shortcut.Save()
            Write-Output "AFTER_ARGS:$($Shortcut.Arguments)"
            Write-Output "RESULT:UPDATED"
        } else {
            Write-Output "RESULT:ALREADY_CORRECT"
        }
    } else {
        # No port flag, add it at the beginning
        $Shortcut.Arguments = "--remote-debugging-port=$NewPort " + $CurrentArgs
        $Shortcut.Save()
        Write-Output "AFTER_ARGS:$($Shortcut.Arguments)"
        Write-Output "RESULT:MODIFIED"
    }
} catch {
    Write-Output "ERROR:$($_.Exception.Message)"
}
`;
            fs.writeFileSync(scriptPath, psScript, 'utf8');
            this.log(`DEBUG: Created modify script at ${scriptPath}`);

            const rawResult = execSync(`powershell -ExecutionPolicy Bypass -File "${scriptPath}"`, {
                encoding: 'utf8',
                timeout: 10000
            });

            this.log(`DEBUG: Modify output:\n${rawResult}`);

            const lines = rawResult.split('\n').map(l => l.trim()).filter(l => l);

            // Check for error
            const errorLine = lines.find(l => l.startsWith('ERROR:'));
            if (errorLine) {
                const errorMsg = errorLine.substring(6);
                this.log(`PowerShell error: ${errorMsg}`);
                return { success: false, modified: false, message: errorMsg };
            }

            const resultLine = lines.find(l => l.startsWith('RESULT:'));
            const result = resultLine ? resultLine.substring(7) : 'UNKNOWN';

            if (result === 'MODIFIED') {
                this.log(`Modified shortcut: ${shortcutPath}`);
                return { success: true, modified: true, message: `Modified: ${path.basename(shortcutPath)}` };
            } else if (result === 'UPDATED') {
                this.log(`Updated shortcut port: ${shortcutPath}`);
                return { success: true, modified: true, message: `Updated port: ${path.basename(shortcutPath)}` };
            } else if (result === 'ALREADY_CORRECT') {
                this.log(`Shortcut already has correct CDP port`);
                return { success: true, modified: false, message: 'Already configured with correct port' };
            } else {
                this.log(`Unexpected result: ${result}`);
                return { success: false, modified: false, message: `Unexpected result: ${result}` };
            }
        } catch (e) {
            this.log(`Error modifying shortcut: ${e.message}`);
            return { success: false, modified: false, message: e.message };
        } finally {
            try { fs.unlinkSync(scriptPath); } catch (e) { /* ignore */ }
        }
    }

    /**
     * Read Windows shortcut properties
     */
    async _readWindowsShortcut(shortcutPath) {
        const scriptPath = path.join(os.tmpdir(), 'auto_accept_read_shortcut.ps1');

        try {
            const psScript = `
$ErrorActionPreference = "Stop"
try {
    $WshShell = New-Object -ComObject WScript.Shell
    $Shortcut = $WshShell.CreateShortcut('${shortcutPath.replace(/'/g, "''")}')
    Write-Output "ARGS:$($Shortcut.Arguments)"
    Write-Output "TARGET:$($Shortcut.TargetPath)"
} catch {
    Write-Output "ERROR:$($_.Exception.Message)"
}
`;
            fs.writeFileSync(scriptPath, psScript, 'utf8');

            const result = execSync(`powershell -ExecutionPolicy Bypass -File "${scriptPath}"`, {
                encoding: 'utf8',
                timeout: 10000
            });

            const lines = result.split('\n').map(l => l.trim()).filter(l => l);

            const errorLine = lines.find(l => l.startsWith('ERROR:'));
            if (errorLine) {
                this.log(`Error reading shortcut: ${errorLine.substring(6)}`);
                return { args: '', target: '', hasFlag: false };
            }

            const argsLine = lines.find(l => l.startsWith('ARGS:')) || 'ARGS:';
            const targetLine = lines.find(l => l.startsWith('TARGET:')) || 'TARGET:';

            const args = argsLine.substring(5);
            const target = targetLine.substring(7);
            const hasFlag = args.includes('--remote-debugging-port');

            return { args, target, hasFlag };
        } catch (e) {
            this.log(`Error reading shortcut ${shortcutPath}: ${e.message}`);
            return { args: '', target: '', hasFlag: false };
        } finally {
            try { fs.unlinkSync(scriptPath); } catch (e) { /* ignore */ }
        }
    }

    // macOS shortcut handling
    async _findMacOSShortcuts(ideName) {
        const shortcuts = [];
        this.log(`Searching for macOS apps matching: ${ideName}`);

        // 1. Check for our wrapper script
        const wrapperPath = path.join(os.homedir(), '.local', 'bin', `${ideName.toLowerCase()}-cdp`);
        if (fs.existsSync(wrapperPath)) {
            const content = fs.readFileSync(wrapperPath, 'utf8');
            shortcuts.push({
                path: wrapperPath,
                hasFlag: content.includes('--remote-debugging-port'),
                type: 'wrapper'
            });
            this.log(`Found existing wrapper: ${wrapperPath}`);
        }

        // 2. Search common locations
        const commonPaths = [
            `/Applications/${ideName}.app`,
            path.join(os.homedir(), 'Applications', `${ideName}.app`),
            `/Applications/Visual Studio Code.app` // Fallback for 'Code'
        ];

        for (const appPath of commonPaths) {
            if (fs.existsSync(appPath)) {
                shortcuts.push({
                    path: appPath,
                    hasFlag: false,
                    type: 'app'
                });
                this.log(`Found app in common location: ${appPath}`);
            }
        }

        // 3. Dynamic search using mdfind (Spotlight)
        try {
            const mdfindCmd = `mdfind "kMDItemKind == 'Application' && kMDItemFSName == '*${ideName}*'"`;
            const mdfindResult = execSync(mdfindCmd, { encoding: 'utf8' }).trim();

            if (mdfindResult) {
                const foundPaths = mdfindResult.split('\n');
                for (const foundPath of foundPaths) {
                    if (foundPath.endsWith('.app') && !shortcuts.some(s => s.path === foundPath)) {
                        shortcuts.push({
                            path: foundPath,
                            hasFlag: false,
                            type: 'app'
                        });
                        this.log(`Found app via mdfind: ${foundPath}`);
                    }
                }
            }
        } catch (e) {
            this.log(`Spotlight search (mdfind) failed: ${e.message}`);
        }

        this.log(`Total macOS shortcuts/apps found: ${shortcuts.length}`);
        return shortcuts;
    }

    async _createMacOSWrapper() {
        const ideName = this.getIDEName();
        const wrapperDir = path.join(os.homedir(), '.local', 'bin');
        const wrapperPath = path.join(wrapperDir, `${ideName.toLowerCase()}-cdp`);

        try {
            fs.mkdirSync(wrapperDir, { recursive: true });

            const appBundle = `/Applications/${ideName}.app`;
            const scriptContent = `#!/bin/bash
# Auto Accept - ${ideName} with CDP enabled
# Generated: ${new Date().toISOString()}
open -a "${appBundle}" --args ${CDP_FLAG} "$@"
`;
            fs.writeFileSync(wrapperPath, scriptContent, { mode: 0o755 });
            this.log(`Created macOS wrapper: ${wrapperPath}`);

            return {
                success: true,
                modified: true,
                message: `Created wrapper script. Launch via: ${wrapperPath}`,
                wrapperPath
            };
        } catch (e) {
            this.log(`Error creating macOS wrapper: ${e.message}`);
            return { success: false, modified: false, message: e.message };
        }
    }

    // Linux shortcut handling
    async _findLinuxShortcuts(ideName) {
        const shortcuts = [];
        const desktopLocations = [
            path.join(os.homedir(), '.local', 'share', 'applications', `${ideName.toLowerCase()}.desktop`),
            `/usr/share/applications/${ideName.toLowerCase()}.desktop`,
        ];

        for (const desktopPath of desktopLocations) {
            if (fs.existsSync(desktopPath)) {
                const content = fs.readFileSync(desktopPath, 'utf8');
                const execMatch = content.match(/^Exec=(.*)$/m);
                const execLine = execMatch ? execMatch[1] : '';

                shortcuts.push({
                    path: desktopPath,
                    hasFlag: execLine.includes('--remote-debugging-port'),
                    type: desktopPath.includes('.local') ? 'user' : 'system',
                    execLine
                });
            }
        }

        this.log(`Found ${shortcuts.length} Linux .desktop files`);
        return shortcuts;
    }

    async _modifyLinuxDesktop(desktopPath) {
        try {
            let content = fs.readFileSync(desktopPath, 'utf8');
            const originalContent = content;

            if (content.includes('--remote-debugging-port')) {
                content = content.replace(
                    /--remote-debugging-port=\d+/g,
                    CDP_FLAG
                );
                if (content === originalContent) {
                    return { success: true, modified: false, message: 'Already configured with correct port' };
                }
            } else {
                content = content.replace(
                    /^(Exec=)(.*)$/m,
                    `$1$2 ${CDP_FLAG}`
                );
            }

            const userDesktopDir = path.join(os.homedir(), '.local', 'share', 'applications');
            const targetPath = desktopPath.includes('.local') ? desktopPath :
                path.join(userDesktopDir, path.basename(desktopPath));

            fs.mkdirSync(userDesktopDir, { recursive: true });
            fs.writeFileSync(targetPath, content);

            this.log(`Modified Linux .desktop: ${targetPath}`);
            return { success: true, modified: true, message: `Modified: ${path.basename(targetPath)}` };
        } catch (e) {
            this.log(`Error modifying .desktop: ${e.message}`);
            return { success: false, modified: false, message: e.message };
        }
    }

    // add flag to shortcut if absent, or update port if incorrect
    async ensureShortcutHasFlag(shortcut) {
        // Check if we need to update the port (e.g., from 9222 to 9000)
        const hasCorrectPort = shortcut.args && shortcut.args.includes(`--remote-debugging-port=${BASE_CDP_PORT}`);

        if (shortcut.hasFlag && hasCorrectPort) {
            this.log(`Shortcut already has correct CDP port ${BASE_CDP_PORT}`);
            return { success: true, modified: false, message: 'Already has correct CDP flag' };
        }

        if (shortcut.hasFlag && !hasCorrectPort) {
            this.log(`Shortcut has CDP flag but wrong port, updating to ${BASE_CDP_PORT}...`);
        }

        if (this.platform === 'win32') {
            return await this._modifyWindowsShortcut(shortcut.path);
        } else if (this.platform === 'darwin') {
            return await this._createMacOSWrapper();
        } else {
            return await this._modifyLinuxDesktop(shortcut.path);
        }
    }

    // get current workspace to relaunch the same workspace
    getWorkspaceFolders() {
        const folders = vscode.workspace.workspaceFolders;
        if (!folders || folders.length === 0) return [];
        return folders.map(f => f.uri.fsPath);
    }

    // relaunch ide via the new shortcut
    async relaunchViaShortcut(shortcut) {
        const workspaceFolders = this.getWorkspaceFolders();

        this.log(`Relaunching via: ${shortcut.path}`);
        this.log(`Workspaces: ${workspaceFolders.join(', ') || '(none)'}`);

        if (this.platform === 'win32') {
            return await this._relaunchWindows(shortcut, workspaceFolders);
        } else if (this.platform === 'darwin') {
            return await this._relaunchMacOS(shortcut, workspaceFolders);
        } else {
            return await this._relaunchLinux(shortcut, workspaceFolders);
        }
    }

    async _relaunchWindows(shortcut, workspaceFolders) {
        const folderArgs = workspaceFolders.map(f => `"${f}"`).join(' ');
        const ideName = this.getIDEName();

        let targetExe = shortcut.target || '';

        if (!targetExe) {
            try {
                const info = await this._readWindowsShortcut(shortcut.path);
                targetExe = info.target;
            } catch (e) {
                this.log(`Could not read target from shortcut: ${e.message}`);
            }
        }

        const batchFileName = `relaunch_${ideName.replace(/\s+/g, '_')}_${Date.now()}.bat`;
        const batchPath = path.join(os.tmpdir(), batchFileName);

        let commandLine = '';
        if (!targetExe || targetExe.endsWith('.lnk')) {
            this.log('Fallback: Could not resolve EXE, using shortcut path');
            commandLine = `start "" "${shortcut.path}" ${folderArgs}`;
        } else {
            const safeTarget = `"${targetExe}"`;
            commandLine = `start "" ${safeTarget} ${CDP_FLAG} ${folderArgs}`;
        }

        const batchContent = `@echo off
REM Auto Accept - IDE Relaunch Script
timeout /t 5 /nobreak >nul
${commandLine}
del "%~f0" & exit
`;

        try {
            fs.writeFileSync(batchPath, batchContent, 'utf8');
            this.log(`Created relaunch batch: ${batchPath}`);
            this.log(`Command: ${commandLine}`);

            const child = spawn('explorer.exe', [batchPath], {
                detached: true,
                stdio: 'ignore',
                windowsHide: true
            });
            child.unref();
            this.log('Explorer asked to run batch. Waiting for quit...');

            setTimeout(() => {
                this.log('Closing current window...');
                vscode.commands.executeCommand('workbench.action.quit');
            }, 1000);

            return { success: true };
        } catch (e) {
            this.log(`Relaunch failed: ${e.message}`);
            return { success: false, error: e.message };
        }
    }

    async _relaunchMacOS(shortcut, workspaceFolders) {
        const folderArgs = workspaceFolders.map(f => `"${f}"`).join(' ');

        const scriptPath = path.join(os.tmpdir(), 'relaunch_ide.sh');
        const launchCommand = shortcut.type === 'wrapper'
            ? `"${shortcut.path}" ${folderArgs}`
            : `open -a "${shortcut.path}" --args ${CDP_FLAG} ${folderArgs}`;

        const scriptContent = `#!/bin/bash
# Auto Accept - macOS Relaunch Script
sleep 5
${launchCommand}
# Ensure the app is focused
if [[ "${shortcut.path}" == *.app ]]; then
    app_name=$(basename "${shortcut.path}" .app)
    osascript -e "tell application \\"$app_name\\" to activate"
fi
`;

        try {
            fs.writeFileSync(scriptPath, scriptContent, { mode: 0o755 });
            this.log(`Created macOS relaunch script: ${scriptPath}`);

            const child = spawn('/bin/bash', [scriptPath], {
                detached: true,
                stdio: 'ignore'
            });
            child.unref();

            setTimeout(() => {
                this.log('Triggering IDE quit for macOS relaunch...');
                vscode.commands.executeCommand('workbench.action.quit');
            }, 2000);

            return { success: true };
        } catch (e) {
            this.log(`macOS relaunch error: ${e.message}`);
            return { success: false, error: e.message };
        }
    }

    async _relaunchLinux(shortcut, workspaceFolders) {
        const folderArgs = workspaceFolders.map(f => `"${f}"`).join(' ');
        const ideName = this.getIDEName().toLowerCase();

        let execCommand = '';
        if (shortcut.execLine) {
            execCommand = shortcut.execLine.replace(/%[fFuUdDnNickvm]/g, '').trim();
        }

        const scriptPath = path.join(os.tmpdir(), 'relaunch_ide.sh');
        const desktopFileName = path.basename(shortcut.path, '.desktop');

        const scriptContent = `#!/bin/bash
sleep 2

# Method 1: gio launch
if command -v gio &> /dev/null; then
    gio launch "${shortcut.path}" ${folderArgs} 2>/dev/null && exit 0
fi

# Method 2: Direct execution from Exec line
${execCommand ? `${execCommand} ${folderArgs} 2>/dev/null && exit 0` : '# No Exec line available'}

# Method 3: gtk-launch fallback
if command -v gtk-launch &> /dev/null; then
    gtk-launch "${desktopFileName}" ${folderArgs} 2>/dev/null && exit 0
fi

# Method 4: Try to find and run the IDE binary directly
for bin in "/usr/bin/${ideName}" "/usr/share/${ideName}/bin/${ideName}" "/opt/${ideName}/bin/${ideName}"; do
    if [ -x "$bin" ]; then
        "$bin" ${CDP_FLAG} ${folderArgs} &
        exit 0
    fi
done

echo "Failed to launch IDE" >&2
exit 1
`;

        try {
            fs.writeFileSync(scriptPath, scriptContent, { mode: 0o755 });
            this.log(`Created Linux relaunch script: ${scriptPath}`);

            const child = spawn('/bin/bash', [scriptPath], {
                detached: true,
                stdio: 'ignore'
            });
            child.unref();

            setTimeout(() => {
                vscode.commands.executeCommand('workbench.action.quit');
            }, 1500);

            return { success: true };
        } catch (e) {
            this.log(`Linux relaunch error: ${e.message}`);
            return { success: false, error: e.message };
        }
    }

    // main function
    async relaunchWithCDP() {
        this.log('Starting relaunchWithCDP flow...');

        // Step 1: Check if CDP is already available
        const cdpAvailable = await this.isCDPRunning();
        if (cdpAvailable) {
            this.log('CDP already running, no relaunch needed');
            return { success: true, action: 'none', message: 'CDP already available' };
        }

        // Step 2: Find shortcuts dynamically
        let shortcuts = await this.findIDEShortcuts();
        const ideName = this.getIDEName();

        // Step 3: If no shortcuts found on Windows, create one
        if (shortcuts.length === 0 && this.platform === 'win32') {
            this.log('No shortcuts found. Searching for executable to create shortcut...');

            const exePath = await this._findWindowsExecutable(ideName);
            if (exePath) {
                const createResult = await this._createWindowsShortcut(ideName, exePath);
                if (createResult.success) {
                    this.log(`Created shortcut: ${createResult.path}`);
                    shortcuts = [{
                        path: createResult.path,
                        hasFlag: true,
                        type: 'desktop',
                        target: createResult.target,
                        args: `${CDP_FLAG} ${CDP_ADDITIONAL_FLAGS}`
                    }];
                } else {
                    this.log(`Failed to create shortcut: ${createResult.message}`);
                    return {
                        success: false,
                        action: 'error',
                        message: `Could not create shortcut: ${createResult.message}`
                    };
                }
            } else {
                return {
                    success: false,
                    action: 'error',
                    message: `Could not find ${ideName}.exe. Please ensure the application is installed.`
                };
            }
        } else if (shortcuts.length === 0) {
            this.log('No shortcuts found');
            return {
                success: false,
                action: 'error',
                message: 'No IDE shortcuts found. Please create a shortcut first.'
            };
        }

        // Prefer desktop shortcut for easier modification, then startmenu
        const primaryShortcut = shortcuts.find(s => s.type === 'desktop') ||
            shortcuts.find(s => s.type === 'startmenu') ||
            shortcuts.find(s => s.type === 'wrapper' || s.type === 'user') ||
            shortcuts[0];

        this.log(`Using primary shortcut: ${primaryShortcut.path} (type: ${primaryShortcut.type})`);

        // Step 4: Ensure shortcut has CDP flag
        const modifyResult = await this.ensureShortcutHasFlag(primaryShortcut);
        if (!modifyResult.success) {
            return {
                success: false,
                action: 'error',
                message: `Failed to modify shortcut: ${modifyResult.message}`
            };
        }

        if (modifyResult.modified) {
            primaryShortcut.hasFlag = true;
        }

        // Step 5: Relaunch via shortcut
        this.log('Relaunching IDE...');
        const relaunchResult = await this.relaunchViaShortcut(primaryShortcut);

        if (relaunchResult.success) {
            return {
                success: true,
                action: 'relaunched',
                message: modifyResult.modified
                    ? 'Shortcut updated. Relaunching with CDP enabled...'
                    : 'Relaunching with CDP enabled...'
            };
        } else {
            return {
                success: false,
                action: 'error',
                message: `Relaunch failed: ${relaunchResult.error}`
            };
        }
    }

    // legacy compatibility
    async launchAndReplace() {
        return await this.relaunchWithCDP();
    }

    // prompt user for relaunch
    async showRelaunchPrompt() {
        this.log('Showing relaunch prompt');

        const choice = await vscode.window.showInformationMessage(
            'Auto Accept requires a quick one-time setup to enable background mode. This will restart your IDE with necessary permissions.',
            { modal: false },
            'Setup & Restart',
            'Not Now'
        );

        this.log(`User chose: ${choice}`);

        if (choice === 'Setup & Restart') {
            const result = await this.relaunchWithCDP();

            if (!result.success) {
                vscode.window.showErrorMessage(`Setup failed: ${result.message}`);
            }

            return result.success ? 'relaunched' : 'failed';
        }

        return 'cancelled';
    }

    // legacy compatibility
    async showLaunchPrompt() {
        return await this.showRelaunchPrompt();
    }

    getLogFilePath() {
        return this.logFile;
    }
}

module.exports = { Relauncher, BASE_CDP_PORT };
