import * as fs from 'fs-extra';
import * as path from 'path';
import * as os from 'os';
import { DermConfig } from '../types';

const CONFIG_FILE_NAME = '.dermrc';
const CONFIG_PATH = path.join(os.homedir(), CONFIG_FILE_NAME);

export function getConfigPath(): string {
  return CONFIG_PATH;
}

export async function loadConfig(): Promise<DermConfig | null> {
  try {
    if (await fs.pathExists(CONFIG_PATH)) {
      const content = await fs.readFile(CONFIG_PATH, 'utf-8');
      return JSON.parse(content);
    }
  } catch (error) {
    console.error('Error loading config:', error);
  }
  return null;
}

export async function saveConfig(config: DermConfig): Promise<void> {
  try {
    await fs.writeFile(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
  } catch (error) {
    console.error('Error saving config:', error);
    throw error;
  }
}

export async function getConfig(): Promise<DermConfig> {
  // Try to load from config file first
  let config = await loadConfig();

  if (!config) {
    // Fall back to environment variables
    config = {
      database: {
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '5432'),
        database: process.env.DB_NAME || 'dermatology_db',
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || '',
      },
      environment: (process.env.NODE_ENV as any) || 'development',
      apiUrl: process.env.API_URL,
      backupDir: process.env.BACKUP_DIR || path.join(os.homedir(), '.derm-backups'),
    };
  }

  return config;
}

export function detectEnvironment(): 'development' | 'staging' | 'production' {
  const env = process.env.NODE_ENV;
  if (env === 'production') return 'production';
  if (env === 'staging') return 'staging';
  return 'development';
}
