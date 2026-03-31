const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash('password123', 10);

  const alice = await prisma.user.upsert({
    where: { userName: 'alice' },
    update: {},
    create: {
      email: 'alice@example.com',
      userName: 'alice',
      passwordHash,
      verified: false,
      profile: {
        create: {
          bio: null,
          skills: [],
          hourlyRate: null
        }
      }
    }
  });

  const bob = await prisma.user.upsert({
    where: { userName: 'bob' },
    update: {},
    create: {
      email: 'bob@example.com',
      userName: 'bob',
      passwordHash,
      verified: false,
      profile: {
        create: {
          bio: null,
          skills: [],
          hourlyRate: null
        }
      }
    }
  });

  await prisma.portfolioProfile.upsert({
    where: { userId: bob.id },
    update: {},
    create: {
      userId: bob.id,
      title: 'Full-stack developer',
      location: 'Remote'
    }
  });

  // Minimal gig to validate gig/application flows
  await prisma.clientPost.create({
    data: {
      clientId: alice.id,
      clientName: 'Acme Inc',
      title: 'Build a landing page',
      description: 'Need a responsive landing page…',
      category: 'web',
      budget: '500.00',
      projectType: 'fixed',
      duration: '1 week',
      skillsRequired: ['react', 'css'],
      location: 'Remote',
      difficulty: 'beginner',
      deadline: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      status: 'open'
    }
  });

  console.log('Seed complete:', { alice: alice.email, bob: bob.email });
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

