import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { backup, DatabaseSync } from "node:sqlite";

export async function createBackup(
  databasePath: string,
  backupDirectory: string,
  now = new Date(),
): Promise<string> {
  if (!existsSync(databasePath)) {
    throw new Error(`Databasen finnes ikke: ${databasePath}`);
  }
  mkdirSync(backupDirectory, { recursive: true });
  const timestamp = now.toISOString().replaceAll(":", "-").replace(".000Z", "Z");
  const destination = join(backupDirectory, `pust-${timestamp}.sqlite`);
  const source = new DatabaseSync(databasePath, { readOnly: true });

  try {
    await backup(source, destination);
  } finally {
    source.close();
  }

  const verification = new DatabaseSync(destination, { readOnly: true });
  try {
    const result = verification.prepare("PRAGMA integrity_check").get() as {
      integrity_check: string;
    };
    if (result.integrity_check !== "ok") {
      throw new Error(`Backup feilet integritetssjekk: ${result.integrity_check}`);
    }
  } finally {
    verification.close();
  }
  return destination;
}

