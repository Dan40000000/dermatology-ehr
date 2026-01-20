import chalk from 'chalk';

export const logger = {
  info: (message: string) => {
    console.log(chalk.blue('ℹ'), message);
  },

  success: (message: string) => {
    console.log(chalk.green('✓'), message);
  },

  error: (message: string, error?: any) => {
    console.error(chalk.red('✗'), message);
    if (error) {
      if (error.message) {
        console.error(chalk.red('  Error:'), error.message);
      } else {
        console.error(chalk.red('  Error:'), error);
      }
    }
  },

  warning: (message: string) => {
    console.warn(chalk.yellow('⚠'), message);
  },

  debug: (message: string) => {
    if (process.env.DEBUG) {
      console.log(chalk.gray('DEBUG:'), message);
    }
  },

  heading: (message: string) => {
    console.log('\n' + chalk.bold.cyan(message));
  },

  subheading: (message: string) => {
    console.log(chalk.cyan(message));
  },

  divider: () => {
    console.log(chalk.gray('─'.repeat(50)));
  },

  blank: () => {
    console.log();
  },
};
