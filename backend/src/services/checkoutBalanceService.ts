import { pool } from "../db/pool";

type Queryable = {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: any[]; rowCount?: number | null }>;
};

export async function getAppointmentCheckoutBalanceCents(
  tenantId: string,
  appointmentId: string,
  queryable: Queryable = pool,
): Promise<number> {
  const billResult = await queryable.query(
    `SELECT
       COUNT(b.id)::int as bill_count,
       COALESCE(SUM(COALESCE(b.balance_cents, 0)), 0)::int as balance_cents
     FROM encounters e
     JOIN bills b ON b.encounter_id = e.id AND b.tenant_id = e.tenant_id
     WHERE e.tenant_id = $1
       AND e.appointment_id = $2
       AND b.status NOT IN ('paid', 'written_off', 'cancelled')`,
    [tenantId, appointmentId],
  );

  const billCount = Number(billResult.rows[0]?.bill_count || 0);
  if (billCount > 0) {
    return Math.max(0, Number(billResult.rows[0]?.balance_cents || 0));
  }

  const selfPayResult = await queryable.query(
    `SELECT COALESCE(SUM(COALESCE(c.amount_cents, c.fee_cents * COALESCE(c.quantity, 1), 0)), 0)::int as balance_cents
     FROM encounters e
     JOIN charges c ON c.encounter_id = e.id AND c.tenant_id = e.tenant_id
     WHERE e.tenant_id = $1
       AND e.appointment_id = $2
       AND (
         c.status = 'self_pay'
         OR COALESCE(NULLIF(to_jsonb(c)->>'billing_route', ''), '') = 'self_pay'
       )`,
    [tenantId, appointmentId],
  );

  return Math.max(0, Number(selfPayResult.rows[0]?.balance_cents || 0));
}
