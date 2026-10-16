import express from 'express';
import * as registerController from '../controllers/registerController.js';
import { authLimiter } from '../middleware/security.js';

const router = express.Router();

// Rota pública para submissão do formulário de cadastro de testes (24h)
router.post('/register', authLimiter, registerController.registerPublicTrial);
router.post('/public/register', authLimiter, registerController.registerPublicTrial);
router.get('/public/config', registerController.getPublicConfig);

export default router;
