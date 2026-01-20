import inquirer from 'inquirer';

export async function confirmAction(message: string, defaultValue = false): Promise<boolean> {
  const { confirmed } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirmed',
      message,
      default: defaultValue,
    },
  ]);
  return confirmed;
}

export async function promptForInput(message: string, defaultValue?: string): Promise<string> {
  const { value } = await inquirer.prompt([
    {
      type: 'input',
      name: 'value',
      message,
      default: defaultValue,
    },
  ]);
  return value;
}

export async function promptForPassword(message: string): Promise<string> {
  const { password } = await inquirer.prompt([
    {
      type: 'password',
      name: 'password',
      message,
      mask: '*',
    },
  ]);
  return password;
}

export async function promptForSelect<T extends string>(
  message: string,
  choices: Array<{ name: string; value: T }>
): Promise<T> {
  const { selected } = await inquirer.prompt([
    {
      type: 'list',
      name: 'selected',
      message,
      choices,
    },
  ]);
  return selected;
}

export async function promptForMultiSelect<T extends string>(
  message: string,
  choices: Array<{ name: string; value: T; checked?: boolean }>
): Promise<T[]> {
  const { selected } = await inquirer.prompt([
    {
      type: 'checkbox',
      name: 'selected',
      message,
      choices,
    },
  ]);
  return selected;
}

export async function promptForUserDetails() {
  return inquirer.prompt([
    {
      type: 'input',
      name: 'email',
      message: 'Email address:',
      validate: (input) => {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(input) || 'Please enter a valid email address';
      },
    },
    {
      type: 'input',
      name: 'firstName',
      message: 'First name:',
      validate: (input) => input.trim().length > 0 || 'First name is required',
    },
    {
      type: 'input',
      name: 'lastName',
      message: 'Last name:',
      validate: (input) => input.trim().length > 0 || 'Last name is required',
    },
    {
      type: 'list',
      name: 'role',
      message: 'Role:',
      choices: [
        { name: 'Admin', value: 'admin' },
        { name: 'Doctor', value: 'doctor' },
        { name: 'Nurse', value: 'nurse' },
        { name: 'Receptionist', value: 'receptionist' },
      ],
    },
    {
      type: 'password',
      name: 'password',
      message: 'Password:',
      mask: '*',
      validate: (input) => input.length >= 8 || 'Password must be at least 8 characters',
    },
  ]);
}

export async function promptForTenantDetails() {
  return inquirer.prompt([
    {
      type: 'input',
      name: 'name',
      message: 'Tenant name:',
      validate: (input) => input.trim().length > 0 || 'Tenant name is required',
    },
    {
      type: 'input',
      name: 'slug',
      message: 'Tenant slug (lowercase, no spaces):',
      validate: (input) => {
        const slugRegex = /^[a-z0-9-]+$/;
        return slugRegex.test(input) || 'Slug must contain only lowercase letters, numbers, and hyphens';
      },
    },
    {
      type: 'list',
      name: 'plan',
      message: 'Plan:',
      choices: [
        { name: 'Free', value: 'free' },
        { name: 'Basic', value: 'basic' },
        { name: 'Professional', value: 'professional' },
        { name: 'Enterprise', value: 'enterprise' },
      ],
    },
  ]);
}
