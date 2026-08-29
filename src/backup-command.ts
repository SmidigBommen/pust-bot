import "dotenv/config";
import { createBackup } from "./backup.js";

const databasePath = process.env.DATABASE_PATH ?? "./data/pust.sqlite";
const backupDirectory = process.env.BACKUP_DIRECTORY ?? "./data/backups";

const destination = await createBackup(databasePath, backupDirectory);
console.log(`Backup opprettet og verifisert: ${destination}`);

