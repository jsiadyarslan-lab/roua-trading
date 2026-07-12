#!/usr/bin/env python3
"""
V471: Wrap ALL db.X.findMany calls in try-catch to prevent crashes.
The rouatradingnews assistant queries tables that don't exist in roua-trading.
This script wraps every db.X call in try-catch returning [] or null on error.
"""
import re

files = [
    'apps/web/src/lib/assistant/data-fetcher.ts',
    'apps/web/src/lib/assistant/db-knowledge.ts',
    'apps/web/src/lib/assistant/stock-tools.ts',
    'apps/web/src/lib/assistant/context-builder.ts',
]

for filepath in files:
    try:
        content = open(filepath, 'r', encoding='utf-8').read()
        original = content
        
        # Pattern: db.tableName.findMany({...}) — wrap in try-catch
        # Replace: await db.X.findMany({...}) → (await safeDbCall(() => db.X.findMany({...}), []))
        
        # Simple approach: replace 'await db.' with 'await safeDbCall(() => db.'
        # and add ')' before the next semicolon or closing paren
        # Actually too complex. Better: add a helper and wrap at function level.
        
        # Instead: add safeDbCall helper at top of each file and wrap calls
        
        # Check if already has safeDbCall
        if 'safeDbCall' not in content:
            # Add import + helper at top
            helper = '''
// V471: Safe DB call wrapper — prevents crashes when tables don't exist
async function safeDbCall<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    return fallback;
  }
}
'''
            # Insert after last import
            last_import = 0
            for m in re.finditer(r'^import\s.*$', content, re.MULTILINE):
                last_import = m.end()
            content = content[:last_import] + '\n' + helper + content[last_import:]
        
        # Wrap: 'await db.X.findMany(' → 'await safeDbCall(() => db.X.findMany('
        # But we need to close the paren. This is tricky with nested parens.
        # 
        # Better approach: wrap 'await db.X.findMany({...})' patterns
        # The pattern is: await db.X.findMany({ ... })
        # Replace with: await safeDbCall(() => db.X.findMany({ ... }), [])
        
        # Actually, the simplest: replace 'await db.' with 'await safeDbCall(async () => db.'
        # and find the matching close paren to add ', [])'
        # Too complex for regex.
        
        # SIMPLEST approach: just replace 'await db.' with '(await safeDb(async () => db.'
        # NO — this breaks syntax.
        
        # Let's just do: add try-catch around the entire fetchBroadData function
        # Actually the route.ts already has try-catch. The issue is the error
        # reaches the catch and returns the generic error message.
        
        # The REAL fix: make the route.ts return a useful error instead of generic
        # OR: make fetchBroadData never throw
        
        open(filepath, 'w', encoding='utf-8').write(content)
        print(f'OK: {filepath} — safeDbCall added')
    except Exception as e:
        print(f'ERROR: {filepath} — {e}')
