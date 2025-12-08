/**
 * Database Seed Script
 *
 * Creates initial organization, department, role, and admin user
 */

import { PrismaClient, ComplianceMode, UserStatus } from '@prisma/client';
import * as crypto from 'crypto';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

// Hash password using Argon2id (same as API)
async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 65536, // 64 MB
    timeCost: 3,
    parallelism: 1,
  });
}

async function main() {
  console.log('🌱 Starting database seed...');

  // Check if already seeded
  const existingOrg = await prisma.organization.findFirst();
  if (existingOrg) {
    console.log('⚠️  Database already seeded. Skipping...');
    return;
  }

  // Get environment variables for admin setup
  const adminEmail = process.env.ADMIN_EMAIL || 'thomas@tagarmor.com';
  const adminPassword = process.env.ADMIN_PASSWORD || 'd9zuzaZ9b2BMjm6x';
  const adminUsername = process.env.ADMIN_USERNAME || 'thomas';
  const orgName = process.env.ORG_NAME || 'NEON Organization';

  // Create organization
  console.log('📁 Creating organization...');
  const organization = await prisma.organization.create({
    data: {
      id: crypto.randomUUID(),
      name: orgName,
      slug: 'neon',
      complianceMode: ComplianceMode.HIPAA,
      settings: {},
    },
  });

  // Create default department
  console.log('🏢 Creating default department...');
  const department = await prisma.department.create({
    data: {
      id: crypto.randomUUID(),
      orgId: organization.id,
      name: 'Administration',
      description: 'System administrators',
      rank: 100,
      settings: {},
    },
  });

  // Create admin role
  console.log('👤 Creating admin role...');
  const adminRole = await prisma.role.create({
    data: {
      id: crypto.randomUUID(),
      orgId: organization.id,
      departmentId: department.id,
      name: 'Super Administrator',
      description: 'Full system access with super admin privileges',
      rank: 100,
      permissions: [
        'super_admin',
        'admin:full',
        'users:manage',
        'org:manage',
        'org:view_settings',
        'org:manage_settings',
        'org:manage_roles',
        'departments:manage',
        'roles:manage',
        'meetings:manage',
        'files:manage',
        'backup:manage',
        'audit:view',
      ],
      settings: {},
    },
  });

  // Create admin user
  console.log('🔑 Creating admin user...');
  await prisma.user.create({
    data: {
      id: crypto.randomUUID(),
      orgId: organization.id,
      departmentId: department.id,
      roleId: adminRole.id,
      email: adminEmail,
      username: adminUsername,
      displayName: 'System Administrator',
      passwordHash: await hashPassword(adminPassword),
      status: UserStatus.ACTIVE,
      settings: {},
    },
  });

  console.log('✅ Database seeded successfully!');
  console.log('');
  console.log('📋 Admin credentials:');
  console.log(`   Email: ${adminEmail}`);
  console.log(`   Username: ${adminUsername}`);
  console.log(`   Password: ${adminPassword}`);
  console.log('');
  console.log('⚠️  Please change the admin password after first login!');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
