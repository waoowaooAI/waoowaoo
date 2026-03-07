import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
setTimeout(() => { console.error('TIMEOUT'); process.exit(1); }, 15000);

const userId = '3d84c341-87d7-4165-971d-a3f6c576aa21';
const needle = 'gemini-compatible:5b';

// 1. Check userPreference default models
const pref = await p.userPreference.findUnique({
    where: { userId },
    select: { analysisModel: true, characterModel: true, locationModel: true, storyboardModel: true, editModel: true, videoModel: true }
});
console.log('=== UserPreference defaults ===');
let found = false;
for (const [k, v] of Object.entries(pref || {})) {
    if (typeof v === 'string' && v.includes(needle)) {
        console.log('  FOUND in', k, ':', v);
        found = true;
    }
}
if (!found) console.log('  (clean)');

// 2. Check novelPromotionData JSON for any reference
const projects = await p.project.findMany({
    where: { userId },
    select: { id: true, name: true, novelPromotionData: true }
});
console.log('\n=== Project novelPromotionData ===');
for (const proj of projects) {
    const data = JSON.stringify(proj.novelPromotionData || {});
    if (data.includes(needle)) {
        // Find which keys reference it
        const parsed = proj.novelPromotionData;
        for (const [k, v] of Object.entries(parsed || {})) {
            if (typeof v === 'string' && v.includes(needle)) {
                console.log('  FOUND in project', proj.id, '(' + proj.name + ') field:', k, '=', v);
            }
        }
    }
}

await p.$disconnect();
process.exit(0);
