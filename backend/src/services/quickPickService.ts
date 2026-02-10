import { pool } from '../db/pool';
import { logger } from '../lib/logger';
import * as crypto from 'crypto';

// ============================================
// TYPES & INTERFACES
// ============================================

export interface QuickPickCategory {
  id: string;
  tenantId: string;
  name: string;
  displayOrder: number;
  icon: string | null;
  color: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface QuickPickItem {
  id: string;
  tenantId: string;
  categoryId: string;
  categoryName?: string;
  code: string;
  codeType: 'CPT' | 'ICD10';
  description: string;
  shortName: string | null;
  isFavorite: boolean;
  usageCount: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProviderQuickPick {
  id: string;
  tenantId: string;
  providerId: string;
  itemId: string;
  customOrder: number | null;
  isHidden: boolean;
  isFavorite: boolean;
  usageCount: number;
  lastUsedAt: string | null;
}

export interface QuickPickBundle {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  items: BundleItem[];
  isActive: boolean;
  usageCount: number;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BundleItem {
  code: string;
  codeType: 'CPT' | 'ICD10';
  description?: string;
}

export interface EncounterCode {
  id: string;
  tenantId: string;
  encounterId: string;
  quickpickItemId: string | null;
  code: string;
  codeType: 'CPT' | 'ICD10';
  description: string;
  isPrimary: boolean;
  modifier: string | null;
  units: number;
  addedBy: string | null;
  addedAt: string;
}

export interface QuickPickFilters {
  category?: string;
  codeType?: 'CPT' | 'ICD10';
  search?: string;
  favoritesOnly?: boolean;
}

// ============================================
// QUICK PICK SERVICE CLASS
// ============================================

export class QuickPickService {
  // ============================================
  // CATEGORY OPERATIONS
  // ============================================

  /**
   * Get all quick pick categories
   */
  async getCategories(tenantId: string): Promise<QuickPickCategory[]> {
    try {
      const result = await pool.query(
        `SELECT
          id,
          tenant_id as "tenantId",
          name,
          display_order as "displayOrder",
          icon,
          color,
          is_active as "isActive",
          created_at as "createdAt",
          updated_at as "updatedAt"
        FROM quickpick_categories
        WHERE tenant_id = $1 AND is_active = true
        ORDER BY display_order ASC, name ASC`,
        [tenantId]
      );

      return result.rows;
    } catch (error) {
      logger.error('Error fetching quick pick categories:', error);
      throw error;
    }
  }

  /**
   * Create a new category
   */
  async createCategory(
    tenantId: string,
    data: {
      name: string;
      displayOrder?: number;
      icon?: string;
      color?: string;
    }
  ): Promise<QuickPickCategory> {
    try {
      const result = await pool.query(
        `INSERT INTO quickpick_categories (tenant_id, name, display_order, icon, color)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING
           id,
           tenant_id as "tenantId",
           name,
           display_order as "displayOrder",
           icon,
           color,
           is_active as "isActive",
           created_at as "createdAt",
           updated_at as "updatedAt"`,
        [tenantId, data.name, data.displayOrder || 0, data.icon || null, data.color || null]
      );

      logger.info('Created quick pick category', { tenantId, name: data.name });
      return result.rows[0];
    } catch (error) {
      logger.error('Error creating quick pick category:', error);
      throw error;
    }
  }

  // ============================================
  // QUICK PICK ITEM OPERATIONS
  // ============================================

  /**
   * Get quick picks for a provider with optional filtering
   */
  async getQuickPicks(
    tenantId: string,
    providerId: string | null,
    filters?: QuickPickFilters
  ): Promise<QuickPickItem[]> {
    try {
      let query = `
        SELECT
          qi.id,
          qi.tenant_id as "tenantId",
          qi.category_id as "categoryId",
          qc.name as "categoryName",
          qi.code,
          qi.code_type as "codeType",
          qi.description,
          qi.short_name as "shortName",
          COALESCE(pq.is_favorite, qi.is_favorite) as "isFavorite",
          COALESCE(pq.usage_count, qi.usage_count) as "usageCount",
          qi.is_active as "isActive",
          qi.created_at as "createdAt",
          qi.updated_at as "updatedAt",
          COALESCE(pq.custom_order, qc.display_order * 1000 + qi.usage_count) as sort_order
        FROM quickpick_items qi
        JOIN quickpick_categories qc ON qi.category_id = qc.id
        LEFT JOIN provider_quickpicks pq ON qi.id = pq.item_id AND pq.provider_id = $2
        WHERE qi.tenant_id = $1
          AND qi.is_active = true
          AND qc.is_active = true
          AND (pq.is_hidden IS NULL OR pq.is_hidden = false)
      `;

      const params: (string | boolean)[] = [tenantId, providerId || ''];

      if (filters?.category) {
        params.push(filters.category);
        query += ` AND qc.id = $${params.length}`;
      }

      if (filters?.codeType) {
        params.push(filters.codeType);
        query += ` AND qi.code_type = $${params.length}`;
      }

      if (filters?.search) {
        params.push(`%${filters.search}%`);
        query += ` AND (qi.code ILIKE $${params.length} OR qi.description ILIKE $${params.length} OR qi.short_name ILIKE $${params.length})`;
      }

      if (filters?.favoritesOnly) {
        query += ` AND COALESCE(pq.is_favorite, qi.is_favorite) = true`;
      }

      query += ` ORDER BY sort_order DESC, qi.code ASC`;

      const result = await pool.query(query, params);

      return result.rows.map((row) => ({
        id: row.id,
        tenantId: row.tenantId,
        categoryId: row.categoryId,
        categoryName: row.categoryName,
        code: row.code,
        codeType: row.codeType,
        description: row.description,
        shortName: row.shortName,
        isFavorite: row.isFavorite,
        usageCount: row.usageCount,
        isActive: row.isActive,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      }));
    } catch (error) {
      logger.error('Error fetching quick picks:', error);
      throw error;
    }
  }

  /**
   * Search all codes (both quick picks and full code database)
   */
  async searchCodes(
    tenantId: string,
    query: string,
    codeType?: 'CPT' | 'ICD10',
    limit: number = 50
  ): Promise<QuickPickItem[]> {
    try {
      const searchTerm = `%${query}%`;
      let sqlQuery = `
        SELECT
          qi.id,
          qi.tenant_id as "tenantId",
          qi.category_id as "categoryId",
          qc.name as "categoryName",
          qi.code,
          qi.code_type as "codeType",
          qi.description,
          qi.short_name as "shortName",
          qi.is_favorite as "isFavorite",
          qi.usage_count as "usageCount",
          qi.is_active as "isActive",
          qi.created_at as "createdAt",
          qi.updated_at as "updatedAt"
        FROM quickpick_items qi
        JOIN quickpick_categories qc ON qi.category_id = qc.id
        WHERE qi.tenant_id = $1
          AND qi.is_active = true
          AND (qi.code ILIKE $2 OR qi.description ILIKE $2 OR qi.short_name ILIKE $2)
      `;

      const params: (string | number)[] = [tenantId, searchTerm];

      if (codeType) {
        params.push(codeType);
        sqlQuery += ` AND qi.code_type = $${params.length}`;
      }

      params.push(limit);
      sqlQuery += ` ORDER BY qi.usage_count DESC, qi.code ASC LIMIT $${params.length}`;

      const result = await pool.query(sqlQuery, params);

      return result.rows;
    } catch (error) {
      logger.error('Error searching codes:', error);
      throw error;
    }
  }

  /**
   * Record usage of a quick pick item
   */
  async recordUsage(
    tenantId: string,
    itemId: string,
    providerId: string
  ): Promise<void> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Update global usage count
      await client.query(
        `UPDATE quickpick_items
         SET usage_count = usage_count + 1, updated_at = NOW()
         WHERE id = $1 AND tenant_id = $2`,
        [itemId, tenantId]
      );

      // Update or insert provider-specific usage
      await client.query(
        `INSERT INTO provider_quickpicks (tenant_id, provider_id, item_id, usage_count, last_used_at)
         VALUES ($1, $2, $3, 1, NOW())
         ON CONFLICT (provider_id, item_id) DO UPDATE
         SET usage_count = provider_quickpicks.usage_count + 1,
             last_used_at = NOW(),
             updated_at = NOW()`,
        [tenantId, providerId, itemId]
      );

      await client.query('COMMIT');

      logger.debug('Recorded quick pick usage', { tenantId, itemId, providerId });
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error recording usage:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Update provider favorites
   */
  async updateFavorites(
    tenantId: string,
    providerId: string,
    favorites: { itemId: string; isFavorite: boolean }[]
  ): Promise<void> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      for (const fav of favorites) {
        await client.query(
          `INSERT INTO provider_quickpicks (tenant_id, provider_id, item_id, is_favorite)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (provider_id, item_id) DO UPDATE
           SET is_favorite = $4, updated_at = NOW()`,
          [tenantId, providerId, fav.itemId, fav.isFavorite]
        );
      }

      await client.query('COMMIT');

      logger.info('Updated provider favorites', { tenantId, providerId, count: favorites.length });
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error updating favorites:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Create a new quick pick item
   */
  async createQuickPickItem(
    tenantId: string,
    data: {
      categoryId: string;
      code: string;
      codeType: 'CPT' | 'ICD10';
      description: string;
      shortName?: string;
    }
  ): Promise<QuickPickItem> {
    try {
      const result = await pool.query(
        `INSERT INTO quickpick_items (tenant_id, category_id, code, code_type, description, short_name)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING
           id,
           tenant_id as "tenantId",
           category_id as "categoryId",
           code,
           code_type as "codeType",
           description,
           short_name as "shortName",
           is_favorite as "isFavorite",
           usage_count as "usageCount",
           is_active as "isActive",
           created_at as "createdAt",
           updated_at as "updatedAt"`,
        [tenantId, data.categoryId, data.code, data.codeType, data.description, data.shortName || null]
      );

      logger.info('Created quick pick item', { tenantId, code: data.code });
      return result.rows[0];
    } catch (error) {
      logger.error('Error creating quick pick item:', error);
      throw error;
    }
  }

  // ============================================
  // BUNDLE OPERATIONS
  // ============================================

  /**
   * Get all bundles
   */
  async getBundles(tenantId: string): Promise<QuickPickBundle[]> {
    try {
      const result = await pool.query(
        `SELECT
          id,
          tenant_id as "tenantId",
          name,
          description,
          items,
          is_active as "isActive",
          usage_count as "usageCount",
          created_by as "createdBy",
          created_at as "createdAt",
          updated_at as "updatedAt"
        FROM quickpick_bundles
        WHERE tenant_id = $1 AND is_active = true
        ORDER BY usage_count DESC, name ASC`,
        [tenantId]
      );

      return result.rows.map((row) => ({
        ...row,
        items: row.items || [],
      }));
    } catch (error) {
      logger.error('Error fetching bundles:', error);
      throw error;
    }
  }

  /**
   * Create a new bundle
   */
  async createBundle(
    tenantId: string,
    userId: string,
    data: {
      name: string;
      description?: string;
      items: BundleItem[];
    }
  ): Promise<QuickPickBundle> {
    try {
      const result = await pool.query(
        `INSERT INTO quickpick_bundles (tenant_id, name, description, items, created_by)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING
           id,
           tenant_id as "tenantId",
           name,
           description,
           items,
           is_active as "isActive",
           usage_count as "usageCount",
           created_by as "createdBy",
           created_at as "createdAt",
           updated_at as "updatedAt"`,
        [tenantId, data.name, data.description || null, JSON.stringify(data.items), userId]
      );

      logger.info('Created quick pick bundle', { tenantId, name: data.name });
      return result.rows[0];
    } catch (error) {
      logger.error('Error creating bundle:', error);
      throw error;
    }
  }

  /**
   * Apply a bundle to an encounter
   */
  async applyBundle(
    tenantId: string,
    bundleId: string,
    encounterId: string,
    userId: string
  ): Promise<EncounterCode[]> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Get bundle
      const bundleResult = await client.query(
        `SELECT items FROM quickpick_bundles WHERE id = $1 AND tenant_id = $2`,
        [bundleId, tenantId]
      );

      if (!bundleResult.rowCount) {
        throw new Error('Bundle not found');
      }

      const items = bundleResult.rows[0]?.items as BundleItem[];
      const addedCodes: EncounterCode[] = [];

      // Add each code to the encounter
      for (const item of items) {
        const codeId = crypto.randomUUID();

        // Look up full description from quickpick_items
        const itemResult = await client.query(
          `SELECT id, description FROM quickpick_items
           WHERE tenant_id = $1 AND code = $2 AND code_type = $3`,
          [tenantId, item.code, item.codeType]
        );

        const description = itemResult.rows[0]?.description || item.description || item.code;
        const quickpickItemId = itemResult.rows[0]?.id || null;

        const result = await client.query(
          `INSERT INTO encounter_codes (id, tenant_id, encounter_id, quickpick_item_id, code, code_type, description, added_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           RETURNING
             id,
             tenant_id as "tenantId",
             encounter_id as "encounterId",
             quickpick_item_id as "quickpickItemId",
             code,
             code_type as "codeType",
             description,
             is_primary as "isPrimary",
             modifier,
             units,
             added_by as "addedBy",
             added_at as "addedAt"`,
          [codeId, tenantId, encounterId, quickpickItemId, item.code, item.codeType, description, userId]
        );

        addedCodes.push(result.rows[0]);

        // Record usage for the quick pick item if found
        if (quickpickItemId) {
          await client.query(
            `UPDATE quickpick_items SET usage_count = usage_count + 1 WHERE id = $1`,
            [quickpickItemId]
          );
        }
      }

      // Update bundle usage count
      await client.query(
        `UPDATE quickpick_bundles SET usage_count = usage_count + 1, updated_at = NOW() WHERE id = $1`,
        [bundleId]
      );

      await client.query('COMMIT');

      logger.info('Applied bundle to encounter', { tenantId, bundleId, encounterId, codesAdded: addedCodes.length });
      return addedCodes;
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error applying bundle:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  // ============================================
  // ENCOUNTER CODE OPERATIONS
  // ============================================

  /**
   * Add codes to an encounter
   */
  async addToEncounter(
    tenantId: string,
    encounterId: string,
    codes: { code: string; codeType: 'CPT' | 'ICD10'; description?: string; isPrimary?: boolean; modifier?: string; units?: number }[],
    userId: string
  ): Promise<EncounterCode[]> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const addedCodes: EncounterCode[] = [];

      for (const codeData of codes) {
        const codeId = crypto.randomUUID();

        // Look up quick pick item for reference and description
        const itemResult = await client.query(
          `SELECT id, description FROM quickpick_items
           WHERE tenant_id = $1 AND code = $2 AND code_type = $3`,
          [tenantId, codeData.code, codeData.codeType]
        );

        const description = codeData.description || itemResult.rows[0]?.description || codeData.code;
        const quickpickItemId = itemResult.rows[0]?.id || null;

        // If this is being set as primary for ICD10, unmark others
        if (codeData.isPrimary && codeData.codeType === 'ICD10') {
          await client.query(
            `UPDATE encounter_codes SET is_primary = false
             WHERE tenant_id = $1 AND encounter_id = $2 AND code_type = 'ICD10'`,
            [tenantId, encounterId]
          );
        }

        const result = await client.query(
          `INSERT INTO encounter_codes (id, tenant_id, encounter_id, quickpick_item_id, code, code_type, description, is_primary, modifier, units, added_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
           RETURNING
             id,
             tenant_id as "tenantId",
             encounter_id as "encounterId",
             quickpick_item_id as "quickpickItemId",
             code,
             code_type as "codeType",
             description,
             is_primary as "isPrimary",
             modifier,
             units,
             added_by as "addedBy",
             added_at as "addedAt"`,
          [
            codeId,
            tenantId,
            encounterId,
            quickpickItemId,
            codeData.code,
            codeData.codeType,
            description,
            codeData.isPrimary || false,
            codeData.modifier || null,
            codeData.units || 1,
            userId,
          ]
        );

        addedCodes.push(result.rows[0]);

        // Record usage for quick pick item if found
        if (quickpickItemId) {
          await client.query(
            `UPDATE quickpick_items SET usage_count = usage_count + 1 WHERE id = $1`,
            [quickpickItemId]
          );
        }
      }

      await client.query('COMMIT');

      logger.info('Added codes to encounter', { tenantId, encounterId, codesAdded: addedCodes.length });
      return addedCodes;
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error adding codes to encounter:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get codes for an encounter
   */
  async getEncounterCodes(tenantId: string, encounterId: string): Promise<EncounterCode[]> {
    try {
      const result = await pool.query(
        `SELECT
          id,
          tenant_id as "tenantId",
          encounter_id as "encounterId",
          quickpick_item_id as "quickpickItemId",
          code,
          code_type as "codeType",
          description,
          is_primary as "isPrimary",
          modifier,
          units,
          added_by as "addedBy",
          added_at as "addedAt"
        FROM encounter_codes
        WHERE tenant_id = $1 AND encounter_id = $2
        ORDER BY code_type DESC, is_primary DESC, added_at ASC`,
        [tenantId, encounterId]
      );

      return result.rows;
    } catch (error) {
      logger.error('Error fetching encounter codes:', error);
      throw error;
    }
  }

  /**
   * Remove a code from an encounter
   */
  async removeFromEncounter(tenantId: string, codeId: string): Promise<void> {
    try {
      await pool.query(
        `DELETE FROM encounter_codes WHERE id = $1 AND tenant_id = $2`,
        [codeId, tenantId]
      );

      logger.info('Removed code from encounter', { tenantId, codeId });
    } catch (error) {
      logger.error('Error removing code from encounter:', error);
      throw error;
    }
  }

  /**
   * Update a code on an encounter
   */
  async updateEncounterCode(
    tenantId: string,
    codeId: string,
    updates: { isPrimary?: boolean; modifier?: string; units?: number }
  ): Promise<EncounterCode | null> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Get current code to check type
      const currentResult = await client.query(
        `SELECT encounter_id, code_type FROM encounter_codes WHERE id = $1 AND tenant_id = $2`,
        [codeId, tenantId]
      );

      if (!currentResult.rowCount) {
        await client.query('ROLLBACK');
        return null;
      }

      const { encounter_id: encounterId, code_type: codeType } = currentResult.rows[0];

      // If setting as primary for ICD10, unmark others
      if (updates.isPrimary && codeType === 'ICD10') {
        await client.query(
          `UPDATE encounter_codes SET is_primary = false
           WHERE tenant_id = $1 AND encounter_id = $2 AND code_type = 'ICD10' AND id != $3`,
          [tenantId, encounterId, codeId]
        );
      }

      const result = await client.query(
        `UPDATE encounter_codes
         SET
           is_primary = COALESCE($3, is_primary),
           modifier = COALESCE($4, modifier),
           units = COALESCE($5, units),
           updated_at = NOW()
         WHERE id = $1 AND tenant_id = $2
         RETURNING
           id,
           tenant_id as "tenantId",
           encounter_id as "encounterId",
           quickpick_item_id as "quickpickItemId",
           code,
           code_type as "codeType",
           description,
           is_primary as "isPrimary",
           modifier,
           units,
           added_by as "addedBy",
           added_at as "addedAt"`,
        [codeId, tenantId, updates.isPrimary, updates.modifier, updates.units]
      );

      await client.query('COMMIT');

      return result.rows[0] || null;
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error updating encounter code:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  // ============================================
  // SEED DATA
  // ============================================

  /**
   * Seed quick pick data for a tenant
   */
  async seedQuickPickData(tenantId: string): Promise<void> {
    try {
      await pool.query(`SELECT seed_quickpick_data($1)`, [tenantId]);
      logger.info('Seeded quick pick data', { tenantId });
    } catch (error) {
      logger.error('Error seeding quick pick data:', error);
      throw error;
    }
  }

  // ============================================
  // PROVIDER PREFERENCES
  // ============================================

  /**
   * Hide a quick pick for a provider
   */
  async hideQuickPick(tenantId: string, providerId: string, itemId: string): Promise<void> {
    try {
      await pool.query(
        `INSERT INTO provider_quickpicks (tenant_id, provider_id, item_id, is_hidden)
         VALUES ($1, $2, $3, true)
         ON CONFLICT (provider_id, item_id) DO UPDATE
         SET is_hidden = true, updated_at = NOW()`,
        [tenantId, providerId, itemId]
      );

      logger.info('Hid quick pick for provider', { tenantId, providerId, itemId });
    } catch (error) {
      logger.error('Error hiding quick pick:', error);
      throw error;
    }
  }

  /**
   * Unhide a quick pick for a provider
   */
  async unhideQuickPick(tenantId: string, providerId: string, itemId: string): Promise<void> {
    try {
      await pool.query(
        `UPDATE provider_quickpicks
         SET is_hidden = false, updated_at = NOW()
         WHERE provider_id = $1 AND item_id = $2 AND tenant_id = $3`,
        [providerId, itemId, tenantId]
      );

      logger.info('Unhid quick pick for provider', { tenantId, providerId, itemId });
    } catch (error) {
      logger.error('Error unhiding quick pick:', error);
      throw error;
    }
  }

  /**
   * Set custom order for a provider's quick picks
   */
  async setCustomOrder(
    tenantId: string,
    providerId: string,
    orderedItems: { itemId: string; order: number }[]
  ): Promise<void> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      for (const item of orderedItems) {
        await client.query(
          `INSERT INTO provider_quickpicks (tenant_id, provider_id, item_id, custom_order)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (provider_id, item_id) DO UPDATE
           SET custom_order = $4, updated_at = NOW()`,
          [tenantId, providerId, item.itemId, item.order]
        );
      }

      await client.query('COMMIT');

      logger.info('Set custom order for provider quick picks', { tenantId, providerId, count: orderedItems.length });
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error setting custom order:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get most frequently used codes for a provider
   */
  async getTopCodes(
    tenantId: string,
    providerId: string,
    codeType?: 'CPT' | 'ICD10',
    limit: number = 10
  ): Promise<QuickPickItem[]> {
    try {
      let query = `
        SELECT
          qi.id,
          qi.tenant_id as "tenantId",
          qi.category_id as "categoryId",
          qc.name as "categoryName",
          qi.code,
          qi.code_type as "codeType",
          qi.description,
          qi.short_name as "shortName",
          COALESCE(pq.is_favorite, qi.is_favorite) as "isFavorite",
          COALESCE(pq.usage_count, 0) as "usageCount",
          qi.is_active as "isActive",
          qi.created_at as "createdAt",
          qi.updated_at as "updatedAt"
        FROM quickpick_items qi
        JOIN quickpick_categories qc ON qi.category_id = qc.id
        LEFT JOIN provider_quickpicks pq ON qi.id = pq.item_id AND pq.provider_id = $2
        WHERE qi.tenant_id = $1
          AND qi.is_active = true
          AND COALESCE(pq.usage_count, 0) > 0
      `;

      const params: (string | number)[] = [tenantId, providerId];

      if (codeType) {
        params.push(codeType);
        query += ` AND qi.code_type = $${params.length}`;
      }

      params.push(limit);
      query += ` ORDER BY COALESCE(pq.usage_count, 0) DESC LIMIT $${params.length}`;

      const result = await pool.query(query, params);

      return result.rows;
    } catch (error) {
      logger.error('Error fetching top codes:', error);
      throw error;
    }
  }
}

export const quickPickService = new QuickPickService();
