"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// prisma/seed.ts
var import_client = require("@prisma/client");
var crypto = __toESM(require("crypto"));
var argon2 = __toESM(require("argon2"));
var prisma = new import_client.PrismaClient();
async function hashPassword(password) {
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 65536,
    // 64 MB
    timeCost: 3,
    parallelism: 1
  });
}
async function main() {
  console.log("\u{1F331} Starting database seed...");
  const existingOrg = await prisma.organization.findFirst();
  if (existingOrg) {
    console.log("\u26A0\uFE0F  Database already seeded. Skipping...");
    return;
  }
  const adminEmail = process.env.ADMIN_EMAIL || "thomas@tagarmor.com";
  const adminPassword = process.env.ADMIN_PASSWORD || "d9zuzaZ9b2BMjm6x";
  const adminUsername = process.env.ADMIN_USERNAME || "thomas";
  const orgName = process.env.ORG_NAME || "NEON Organization";
  console.log("\u{1F4C1} Creating organization...");
  const organization = await prisma.organization.create({
    data: {
      id: crypto.randomUUID(),
      name: orgName,
      slug: "neon",
      complianceMode: import_client.ComplianceMode.HIPAA,
      settings: {}
    }
  });
  console.log("\u{1F3E2} Creating default department...");
  const department = await prisma.department.create({
    data: {
      id: crypto.randomUUID(),
      orgId: organization.id,
      name: "Administration",
      description: "System administrators",
      rank: 100,
      settings: {}
    }
  });
  console.log("\u{1F464} Creating admin role...");
  const adminRole = await prisma.role.create({
    data: {
      id: crypto.randomUUID(),
      orgId: organization.id,
      departmentId: department.id,
      name: "Super Administrator",
      description: "Full system access with super admin privileges",
      rank: 100,
      permissions: [
        "super_admin",
        "admin:full",
        "users:manage",
        "org:manage",
        "org:view_settings",
        "org:manage_settings",
        "org:manage_roles",
        "departments:manage",
        "roles:manage",
        "meetings:manage",
        "files:manage",
        "backup:manage",
        "audit:view"
      ],
      settings: {}
    }
  });
  console.log("\u{1F511} Creating admin user...");
  await prisma.user.create({
    data: {
      id: crypto.randomUUID(),
      orgId: organization.id,
      departmentId: department.id,
      roleId: adminRole.id,
      email: adminEmail,
      username: adminUsername,
      displayName: "System Administrator",
      passwordHash: await hashPassword(adminPassword),
      status: import_client.UserStatus.ACTIVE,
      settings: {}
    }
  });
  console.log("\u2705 Database seeded successfully!");
  console.log("");
  console.log("\u{1F4CB} Admin credentials:");
  console.log(`   Email: ${adminEmail}`);
  console.log(`   Username: ${adminUsername}`);
  console.log(`   Password: ${adminPassword}`);
  console.log("");
  console.log("\u26A0\uFE0F  Please change the admin password after first login!");
}
main().catch((e) => {
  console.error("\u274C Seed failed:", e);
  process.exit(1);
}).finally(async () => {
  await prisma.$disconnect();
});
