import ora, { Ora } from 'ora';
import chalk from 'chalk';

export function createSpinner(text: string): Ora {
  return ora({
    text,
    color: 'cyan',
  });
}

export async function withSpinner<T>(
  text: string,
  action: () => Promise<T>
): Promise<T> {
  const spinner = createSpinner(text).start();
  try {
    const result = await action();
    spinner.succeed(chalk.green(text));
    return result;
  } catch (error) {
    spinner.fail(chalk.red(text));
    throw error;
  }
}
