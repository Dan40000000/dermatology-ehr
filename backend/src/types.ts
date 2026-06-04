export type Role =
  | "admin"
  | "provider"
  | "ma"
  | "front_desk"
  | "billing"
  | "nurse"
  | "manager"
  | "scheduler"
  | "hr"
  | "staff"
  | "medical_assistant"
  | "compliance_officer"
  | string;

export interface TenantUser {
  id: string;
  tenantId: string;
  email: string;
  phone?: string | null;
  passwordHash: string;
  role: Role;
  secondaryRoles?: Role[];
  roles?: Role[];
  fullName: string;
  forcePasswordReset?: boolean;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface AuthenticatedRequestUser {
  id: string;
  tenantId: string;
  role: Role;
  secondaryRoles?: Role[];
  roles?: Role[];
  email: string;
  phone?: string | null;
  fullName: string;
  passwordResetRequired?: boolean;
}
