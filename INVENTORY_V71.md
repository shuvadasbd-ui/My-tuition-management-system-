# V71 কোড ইনভেন্টরি (পরিকল্পনা §১) — v70 ZIP থেকে যাচাই করা

| বিষয় | বাস্তবে যা পাওয়া গেছে |
|---|---|
| অ্যাপ শুরু | `index.html` → `app.js` (defer)। `app.js` কখনো হাতে বদলানো হয় না; `js/manifest.json`-এর ক্রমে `npm run build` তৈরি করে |
| মডিউল | `js/00..22` (core, payments, home, students, settings, commands, khata, khata-tools, safety, main, radar, smart, galaxy, think, future, khata-brain, ai, bio) + এই রিলিজে `23-schema, 24-qgen, 25-results, 26-fees, 27-backup2` |
| ডেটা | শুধু `localStorage` (`tr_*` কী) + ব্যাকআপ-স্ন্যাপশটের জন্য IndexedDB (`js/10-safety.js`)। ব্যাকআপ-তালিকা: `BACKUP_KEYS` (`js/05-settings.js`) |
| AI | `js/21-ai.js` → `netlify/functions/ai.mjs` (`netlify/lib/ai.mjs`)। API কী শুধু Netlify env-এ; সার্ভারে সীমা: সিস্টেম ≤৬০০০ অক্ষর, `max_tokens` ≤ `AI_MAX_TOKENS` (ডিফল্ট ৯০০), ৮.৫ সেকেন্ড টাইমআউট |
| প্রিন্ট/PDF | সাপ্তাহিক রুটিনের `@media print`; খাতার PDF canvas দিয়ে; প্রশ্নপত্রের প্রিন্ট এই রিলিজে যোগ |
| ব্যাকআপ | ফাইল (`exportBackup`/`importBackup`, ঐচ্ছিক AES পাসওয়ার্ড), স্বয়ংক্রিয় এনক্রিপ্টেড অনলাইন (`js/14-autobackup.js` + `netlify/functions/backup.mjs`), দৈনিক ডিভাইস-স্ন্যাপশট |
| টেস্ট | `npm test` (Node test runner + Playwright UI)। v70-তে ১০৬টা, এই রিলিজে ১৩৩টা — সব পাস |
| PWA | `sw.js` (cache `tuition-routine-v75`), `manifest.json`; লাইভ সিঙ্ক নেই |

## আগে থেকে থাকা — তাই নতুন করে বানানো হয়নি
- মেকআপ ক্লাস তালিকা (`tr_makeups`) → ইতিহাস রাখতে উন্নত করা হয়েছে (মোছার বদলে `doneAt`)।
- পেমেন্ট/রসিদ/বকেয়া → `feeEffective` দিয়ে ছাড়/চার্জ যোগ; পুরোনো হিসাবের সূত্র একই জায়গায় আনা হয়েছে।
- অনুপস্থিতি-সতর্কতা (`computeAbsenceRiskToday`) → বাকি আছে; নতুন `computeAbsenceStreaks` সব শিক্ষার্থীর জন্য, পিছানো ক্লাসও বাদ।
- ব্যাকআপ/রিস্টোর (রোলব্যাকসহ) → স্কিমা, চেকসাম, ডিফ-প্রিভিউ ও মার্জ যোগ।
