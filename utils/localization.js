const vscode = require('vscode');
const fs = require('fs');
const path = require('path');

class LocalizationManager {
    constructor(context) {
        this.context = context;
        this.bundle = null;
        this.language = 'auto'; // 'auto', 'en', 'zh-cn'
        this.loaded = false;

        // Load initial setting
        this.updateLanguage();

        // Listen for configuration changes
        if (context) {
            context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(e => {
                if (e.affectsConfiguration('autoAccept.languageOverride')) {
                    this.updateLanguage();
                }
            }));
        }
    }

    updateLanguage() {
        const config = vscode.workspace.getConfiguration('autoAccept');
        const newLanguage = config.get('languageOverride') || 'auto';

        if (this.language !== newLanguage || !this.loaded) {
            this.language = newLanguage;
            this.loadBundle();
        }
    }

    loadBundle() {
        if (this.language === 'auto' || !this.context) {
            this.bundle = null;
            this.loaded = true;
            return;
        }

        try {
            const bundleName = this.language === 'en' ? 'bundle.l10n.json' : `bundle.l10n.${this.language}.json`;
            const bundlePath = path.join(this.context.extensionPath, 'l10n', bundleName);

            if (fs.existsSync(bundlePath)) {
                this.bundle = JSON.parse(fs.readFileSync(bundlePath, 'utf8'));
                console.log(`Auto Accept: Loaded language override bundle: ${bundleName}`);
            } else {
                console.warn(`Auto Accept: Language bundle not found: ${bundlePath}`);
                this.bundle = null;
            }
        } catch (e) {
            console.error(`Auto Accept: Failed to load language bundle: ${e.message}`);
            this.bundle = null;
        }
        this.loaded = true;
    }

    t(message, ...args) {
        if (this.language !== 'auto' && this.bundle && this.bundle[message]) {
            let result = this.bundle[message];
            // Simple format replacement {0}, {1}, etc.
            if (args.length > 0) {
                args.forEach((arg, index) => {
                    result = result.replace(new RegExp(`\\{${index}\\}`, 'g'), arg);
                });
            }
            return result;
        }

        // Fallback to vscode.l10n
        return vscode.l10n.t(message, ...args);
    }
}

// Singleton instance
let instance = null;

function init(context) {
    instance = new LocalizationManager(context);
    // Export instance for debugging if needed
    return instance;
}

function t(message, ...args) {
    if (!instance) {
        // Fallback if accessed before init (shouldn't happen in normal flow)
        return vscode.l10n.t(message, ...args);
    }
    return instance.t(message, ...args);
}

module.exports = {
    init,
    t
};
