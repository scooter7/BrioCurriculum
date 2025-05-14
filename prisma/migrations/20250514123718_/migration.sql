/*
  Warnings:

  - You are about to drop the column `completed` on the `action_items` table. All the data in the column will be lost.
  - You are about to drop the column `dueDate` on the `action_items` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_action_items" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Not Started',
    "startDate" DATETIME,
    "endDate" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "curriculumId" TEXT NOT NULL,
    CONSTRAINT "action_items_curriculumId_fkey" FOREIGN KEY ("curriculumId") REFERENCES "curricula" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_action_items" ("createdAt", "curriculumId", "id", "title", "updatedAt") SELECT "createdAt", "curriculumId", "id", "title", "updatedAt" FROM "action_items";
DROP TABLE "action_items";
ALTER TABLE "new_action_items" RENAME TO "action_items";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
