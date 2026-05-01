import type { User } from '../types';
import { hasRole } from './roles';

const FEEDBACK_VIEWER_EMAILS = new Set(['perrysoftwarellc@gmail.com', 'dan@perrysoftwarellc.com']);

export function canViewProfessionalFeedback(user: Pick<User, 'email' | 'role' | 'roles' | 'secondaryRoles'> | null | undefined): boolean {
  const email = String(user?.email || '').trim().toLowerCase();
  return hasRole(user, 'admin') && FEEDBACK_VIEWER_EMAILS.has(email);
}
