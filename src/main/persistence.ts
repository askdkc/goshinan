import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  DEFAULT_SETTINGS,
  type AppSettings,
  type Difficulty,
  type Language,
} from "../shared/contracts";
import { GoGame, type GameSnapshot } from "../domain/game";

const isLanguage = (value: unknown): value is Language =>
  value === "en" || value === "ja";
const isDifficulty = (value: unknown): value is Difficulty =>
  Number.isInteger(value) && Number(value) >= 1 && Number(value) <= 9;

const sanitizeSettings = (value: unknown): AppSettings => {
  if (typeof value !== "object" || value === null)
    return { ...DEFAULT_SETTINGS };
  const candidate = value as Partial<AppSettings>;
  return {
    difficulty: isDifficulty(candidate.difficulty)
      ? candidate.difficulty
      : DEFAULT_SETTINGS.difficulty,
    language: isLanguage(candidate.language)
      ? candidate.language
      : DEFAULT_SETTINGS.language,
    showCandidates:
      typeof candidate.showCandidates === "boolean"
        ? candidate.showCandidates
        : DEFAULT_SETTINGS.showCandidates,
    showOwnership:
      typeof candidate.showOwnership === "boolean"
        ? candidate.showOwnership
        : DEFAULT_SETTINGS.showOwnership,
  };
};

export class PersistenceStore {
  private readonly settingsPath: string;
  private readonly sessionPath: string;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(private readonly directory: string) {
    this.settingsPath = path.join(directory, "settings.json");
    this.sessionPath = path.join(directory, "session.json");
  }

  private async readJson(filePath: string): Promise<unknown> {
    try {
      return JSON.parse(await readFile(filePath, "utf8")) as unknown;
    } catch {
      return undefined;
    }
  }

  private async writeJson(filePath: string, value: unknown): Promise<void> {
    const operation = async (): Promise<void> => {
      await mkdir(this.directory, { recursive: true });
      const temporary = `${filePath}.tmp`;
      await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, {
        encoding: "utf8",
        mode: 0o600,
      });
      await rename(temporary, filePath);
    };
    this.writeQueue = this.writeQueue.then(operation, operation);
    await this.writeQueue;
  }

  async getSettings(): Promise<AppSettings> {
    return sanitizeSettings(await this.readJson(this.settingsPath));
  }

  async updateSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
    const current = await this.getSettings();
    const next = sanitizeSettings({ ...current, ...patch });
    await this.writeJson(this.settingsPath, next);
    return next;
  }

  async saveSession(snapshot: GameSnapshot): Promise<void> {
    const validated = GoGame.fromSnapshot(snapshot).toSnapshot();
    await this.writeJson(this.sessionPath, validated);
  }

  async loadSession(): Promise<GameSnapshot | null> {
    const value = await this.readJson(this.sessionPath);
    if (value === undefined) return null;
    try {
      return GoGame.fromSnapshot(value as GameSnapshot).toSnapshot();
    } catch {
      return null;
    }
  }
}
