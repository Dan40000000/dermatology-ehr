export type Role = "admin" | "provider" | "ma" | "front_desk";

export interface TenantUser {
  id: string;
  tenantId: string;
  email: string;
  passwordHash: string;
  role: Role;
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
  email: string;
  fullName: string;
}
