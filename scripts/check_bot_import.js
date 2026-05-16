const fs = require('fs');
const path = require('path');

function checkBotImport(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
            checkBotImport(fullPath);
        } else if (file.endsWith('.tsx') || file.endsWith('.ts')) {
            const content = fs.readFileSync(fullPath, 'utf8');
            if (content.includes('<Bot') || content.includes('icon={Bot}')) {
                const hasImport = content.includes('Bot') && (content.includes('lucide-react') || content.includes('lucide-react/dist/esm/icons/bot'));
                if (!hasImport) {
                    console.log(`MISSING IMPORT in ${fullPath}`);
                }
            }
        }
    }
}

checkBotImport('apps/web/src');
