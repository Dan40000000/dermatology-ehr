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
  passwordHash: string;
  role: Role;
  secondaryRoles?: Role[];
  roles?: Role[];
  fullName: string;
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
  fullName: string;
}
