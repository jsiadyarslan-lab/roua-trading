#!/bin/bash
# شغّله مرة واحدة بعد كل clone جديد
echo "📦 تثبيت git hooks..."
cp .github/hooks/pre-push .git/hooks/pre-push
chmod +x .git/hooks/pre-push
echo "✅ تم — الـ hooks ستعمل تلقائياً قبل كل push"
