export interface DermConfig {
  database: {
    host: string;
    port: number;
    database: string;
    user: string;
    password: string;
  };
  environment: 'development' | 'staging' | 'production';
  apiUrl?: string;
  backupDir?: string;
}

export interface User {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  role: string;
  tenant_id: string;
  is_active: boolean;
  created_at: Date;
}

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  plan: string;
  is_active: boolean;
  created_at: Date;
  settings?: Record<string, any>;
}

export interface SystemStats {
  users: {
    total: number;
    active: number;
    by_role: Record<string, number>;
  };
  patients: {
    total: number;
    new_this_month: number;
  };
  appointments: {
    total: number;
    today: number;
    this_week: number;
    upcoming: number;
  };
  tenants: {
    total: number;
    active: number;
  };
  database: {
    size: string;
    connections: number;
  };
}

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  database: {
    connected: boolean;
    responseTime: number;
  };
  api?: {
    reachable: boolean;
    responseTime: number;
  };
  checks: Array<{
    name: string;
    status: 'pass' | 'fail';
    message?: string;
  }>;
}
