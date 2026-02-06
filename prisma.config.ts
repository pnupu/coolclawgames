import "dotenv/config";
import { defineConfig } from "prisma/config";
import path from "node:path";

// Also load .env.local (Next.js convention) for local dev
import { config } from "dotenv";
config({ path: path.resolve(process.cwd(), ".env.local") });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env.DATABASE_URL!,
  },
});
