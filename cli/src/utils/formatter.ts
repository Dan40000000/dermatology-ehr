import Table from 'cli-table3';
import chalk from 'chalk';

export function createTable(head: string[], options?: any): Table.Table {
  return new Table({
    head: head.map(h => chalk.cyan(h)),
    style: {
      head: [],
      border: ['gray'],
    },
    ...options,
  });
}

export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.substring(0, maxLength - 3) + '...';
}

export function formatBoolean(value: boolean): string {
  return value ? chalk.green('Yes') : chalk.red('No');
}

export function formatStatus(status: string): string {
  const statusColors: Record<string, any> = {
    active: chalk.green,
    inactive: chalk.red,
    pending: chalk.yellow,
    completed: chalk.green,
    failed: chalk.red,
    healthy: chalk.green,
    degraded: chalk.yellow,
    unhealthy: chalk.red,
  };

  const color = statusColors[status.toLowerCase()] || chalk.white;
  return color(status);
}
