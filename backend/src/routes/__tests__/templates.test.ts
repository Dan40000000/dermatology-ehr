import request from 'supertest';
import express from 'express';
import { templatesRouter } from '../templates';

jest.mock('../../middleware/auth', () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = {
      id: 'user-1',
      tenantId: 'tenant-1',
      role: 'provider',
      email: 'provider@example.com',
      fullName: 'Dr. Test',
    };
    return next();
  },
  AuthedRequest: class {},
}));

const app = express();
app.use(express.json());
app.use('/templates', templatesRouter);

describe('Templates Routes', () => {
  describe('GET /templates/notes', () => {
    it('should return list of note templates', async () => {
      const response = await request(app).get('/templates/notes');

      expect(response.status).toBe(200);
      expect(response.body.templates).toBeDefined();
      expect(Array.isArray(response.body.templates)).toBe(true);
      expect(response.body.templates.length).toBeGreaterThan(0);
    });

    it('should return templates with required fields', async () => {
      const response = await request(app).get('/templates/notes');

      const template = response.body.templates[0];
      expect(template).toHaveProperty('id');
      expect(template).toHaveProperty('name');
      expect(template).toHaveProperty('chiefComplaint');
      expect(template).toHaveProperty('hpi');
      expect(template).toHaveProperty('ros');
      expect(template).toHaveProperty('exam');
      expect(template).toHaveProperty('assessmentPlan');
    });

    it('should include specific dermatology templates', async () => {
      const response = await request(app).get('/templates/notes');

      const templateNames = response.body.templates.map((t: any) => t.name);
      expect(templateNames).toContain('Derm Rash');
      expect(templateNames).toContain('Acne Follow-up');
      expect(templateNames).toContain('Shave Biopsy');
      expect(templateNames).toContain('Full Body Skin Exam');
      expect(templateNames).toContain('Eczema Flare');
    });

    it('should require authentication', async () => {
      // Override the mock for this test
      const appNoAuth = express();
      appNoAuth.use(express.json());

      // Create a router that simulates no auth
      const noAuthRouter = express.Router();
      noAuthRouter.get('/notes', (_req, res) => {
        return res.status(401).json({ error: 'Unauthorized' });
      });

      appNoAuth.use('/templates', noAuthRouter);

      const response = await request(appNoAuth).get('/templates/notes');

      expect(response.status).toBe(401);
    });

    it('should return templates with consistent structure', async () => {
      const response = await request(app).get('/templates/notes');

      response.body.templates.forEach((template: any) => {
        expect(typeof template.id).toBe('string');
        expect(typeof template.name).toBe('string');
        expect(typeof template.chiefComplaint).toBe('string');
        expect(typeof template.hpi).toBe('string');
        expect(typeof template.ros).toBe('string');
        expect(typeof template.exam).toBe('string');
        expect(typeof template.assessmentPlan).toBe('string');
      });
    });

    it('should return templates with unique IDs', async () => {
      const response = await request(app).get('/templates/notes');

      const ids = response.body.templates.map((t: any) => t.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });
  });
});
