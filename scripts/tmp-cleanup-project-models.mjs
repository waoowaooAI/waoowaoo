import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
setTimeout(() => { console.error('TIMEOUT'); process.exit(1); }, 30000);

const userId = '3d84c341-87d7-4165-971d-a3f6c576aa21';
const needle = 'gemini-compatible:5b127c32-136e-4e5a-af74-8bae3e28be7a';
const modelFields = ['characterModel', 'locationModel', 'storyboardModel', 'editModel'];

// projectData is a relation, query directly
const npProjects = await p.project.findMany({
    where: { project: { userId } },
    select: { id: true, projectId: true, characterModel: true, locationModel: true, storyboardModel: true, editModel: true, project: { select: { name: true } } }
});

let totalCleaned = 0;

for (const np of npProjects) {
    const updates = {};
    const cleanedFields = [];

    for (const field of modelFields) {
        if (typeof np[field] === 'string' && np[field].includes(needle)) {
            updates[field] = '';
            cleanedFields.push(`${field}: ${np[field]}`);
        }
    }

    if (cleanedFields.length > 0) {
        await p.project.update({
            where: { id: np.id },
            data: updates
        });
        console.log(`✓ ${np.project.name} (${np.projectId}): cleared ${cleanedFields.length} fields`);
        cleanedFields.forEach(f => console.log(`    - ${f}`));
        totalCleaned++;
    }
}

console.log(`\nDone. Cleaned ${totalCleaned} projects.`);
await p.$disconnect();
process.exit(0);
