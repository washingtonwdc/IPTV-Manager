import bcrypt from 'bcrypt';
import crypto from 'crypto';
import db from '../database/db.js';
import { immediateTransaction } from '../database/sqliteWrites.js';
import { encrypt } from '../utils/crypto.js';
import { BCRYPT_ROUNDS } from '../config/constants.js';

/**
 * Controller de Auto-Cadastro Público para Testes IPTV (24 Horas)
 * Inspirado no fluxo e parâmetros de https://www.testersbygold.fun/plajezev/prod808033
 */

function sanitizarNomeUsuario(nome, email) {
  let base = '';
  if (email && email.includes('@')) {
    base = email.split('@')[0].replace(/[^a-zA-Z0-9_]/g, '').toLowerCase();
  } else if (nome) {
    base = nome.replace(/[^a-zA-Z0-9_]/g, '').toLowerCase();
  }
  if (!base || base.length < 3) {
    base = 'user';
  }
  base = base.substring(0, 10);
  const randomSuffix = crypto.randomBytes(3).toString('hex');
  return `gold_${base}_${randomSuffix}`;
}

function gerarSenhaAleatoria(tamanho = 8) {
  const chars = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let senha = '';
  for (let i = 0; i < tamanho; i++) {
    senha += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return senha;
}

export async function registerPublicTrial(req, res) {
  try {
    const { name, email, phone, country } = req.body;

    if (!name || !email) {
      return res.status(400).json({
        success: false,
        error: 'missing_fields',
        message: 'Nome e E-mail são obrigatórios.'
      });
    }

    // 1. Gera credenciais seguras para o teste
    const username = sanitizarNomeUsuario(name, email);
    const plainPassword = gerarSenhaAleatoria(9);
    const hashedPassword = await bcrypt.hash(plainPassword, BCRYPT_ROUNDS);
    const encryptedPlainPassword = encrypt(plainPassword);

    // 2. Calcula expiração para exatamente 24 horas (86.400 segundos)
    const nowUnix = Math.floor(Date.now() / 1000);
    const expiryUnix = nowUnix + (24 * 3600);
    const expiryDateIso = new Date(expiryUnix * 1000).toISOString();

    const cleanPhone = (phone || '').replace(/[^0-9+]/g, '');
    const cleanCountry = country || 'BR';
    const notes = `Teste 24h | ${name.trim()} | Tel: ${cleanPhone || 'N/A'}`;

    let newUserId = null;

    // 3. Insere o usuário na tabela SQLite de usuários do IPTV Manager
    immediateTransaction(db, () => {
      const stmt = db.prepare(`
        INSERT INTO users (
          username,
          password,
          plain_password,
          is_active,
          webui_access,
          provider_access,
          hdhr_enabled,
          max_connections,
          expiry_date,
          allowed_countries,
          notes
        ) VALUES (?, ?, ?, 1, 0, 0, 0, 1, ?, ?, ?)
      `);

      const info = stmt.run(
        username,
        hashedPassword,
        encryptedPlainPassword,
        expiryUnix,
        cleanCountry,
        notes
      );
      newUserId = info.lastInsertRowid;

      // 4. Se existir algum usuário modelo (como o admin ou o primeiro usuário com canais),
      // clona automaticamente as categorias e canais para este teste
      try {
        const sourceUser = db.prepare(`
          SELECT user_id, COUNT(*) as cnt 
          FROM user_channels 
          GROUP BY user_id 
          ORDER BY cnt DESC 
          LIMIT 1
        `).get();

        if (sourceUser && sourceUser.user_id && sourceUser.user_id !== newUserId) {
          const sourceCategories = db.prepare('SELECT * FROM user_categories WHERE user_id = ?').all(sourceUser.user_id);
          const catMap = {}; // oldCatId -> newCatId

          const insertCat = db.prepare('INSERT INTO user_categories (user_id, name, sort_order, is_adult, type) VALUES (?, ?, ?, ?, ?)');
          for (const cat of sourceCategories) {
            const resCat = insertCat.run(newUserId, cat.name, cat.sort_order, cat.is_adult, cat.type);
            catMap[cat.id] = resCat.lastInsertRowid;
          }

          const sourceChannels = db.prepare('SELECT * FROM user_channels WHERE user_id = ?').all(sourceUser.user_id);
          const insertChan = db.prepare(`
            INSERT INTO user_channels (user_id, user_category_id, provider_channel_id, sort_order, custom_name, is_hidden, assignment_origin)
            VALUES (?, ?, ?, ?, ?, ?, 'auto_trial')
          `);

          for (const ch of sourceChannels) {
            const mappedCatId = catMap[ch.user_category_id];
            if (mappedCatId) {
              insertChan.run(newUserId, mappedCatId, ch.provider_channel_id, ch.sort_order, ch.custom_name, ch.is_hidden);
            }
          }
        }
      } catch (errClone) {
        // Ignora erro de clonagem se o painel ainda não tiver canais configurados
        console.warn('[Auto-Cadastro] Aviso na associação inicial de canais:', errClone.message);
      }
    });

    // 5. Monta URLs e dados Xtream Codes
    const protocol = req.protocol || 'http';
    const hostHeader = req.get('host') || '127.0.0.1:3000';
    const baseUrl = `${protocol}://${hostHeader}`;
    const m3uUrl = `${baseUrl}/get.php?username=${username}&password=${plainPassword}&type=m3u_plus&output=mpegts`;
    const epgUrl = `${baseUrl}/xmltv.php?username=${username}&password=${plainPassword}`;

    return res.status(201).json({
      success: true,
      message: 'Teste de 24 Horas gerado com sucesso!',
      user_id: newUserId,
      client_name: name,
      credentials: {
        host: baseUrl,
        username: username,
        password: plainPassword,
        m3u_url: m3uUrl,
        epg_url: epgUrl,
        max_connections: 1,
        valid_until: expiryDateIso,
        valid_hours: 24
      }
    });

  } catch (error) {
    console.error('[Auto-Cadastro] Erro ao registrar teste:', error);
    return res.status(500).json({
      success: false,
      error: 'server_error',
      message: 'Não foi possível gerar o teste no momento. Tente novamente em instantes.'
    });
  }
}

export function getPublicConfig(req, res) {
  const protocol = req.protocol || 'http';
  const hostHeader = req.get('host') || '127.0.0.1:3000';
  return res.json({
    service_name: 'Gold Card TV - Testers',
    trial_duration_hours: 24,
    max_connections: 1,
    base_url: `${protocol}://${hostHeader}`,
    support_whatsapp: '5511999999999'
  });
}
