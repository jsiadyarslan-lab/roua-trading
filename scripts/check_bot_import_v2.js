const fs = require('fs');
const path = require('path');

const regex = /<Bot\b|icon=\{Bot\}|icon=\{Bot\b/;

function checkBotImport(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
            checkBotImport(fullPath);
        } else if (file.endsWith('.tsx')) {
            const content = fs.readFileSync(fullPath, 'utf8');
            if (regex.test(content)) {
                const hasImport = content.includes('Bot') && (content.includes('lucide-react'));
                if (!hasImport) {
                    console.log(`MISSING IMPORT in ${fullPath}`);
                }
            }
        }
    }
}

checkBotImport('apps/web/src');
