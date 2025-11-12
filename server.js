const express = require('express');
const mysql = require('mysql2');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const session = require('express-session');

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

app.use(session({
  secret: 'rotasol_secret_session_123',
  resave: false,
  saveUninitialized: false,
  cookie: { 
    secure: false,
    maxAge: 24 * 60 * 60 * 1000
  }
}));

app.use(passport.initialize());
app.use(passport.session());

const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'rotasol'
};

const pool = mysql.createPool({
    ...dbConfig,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

const db = pool.promise();

async function testConnection() {
    try {
        const connection = await db.getConnection();
        console.log('✅ Conectado ao banco de dados MySQL');
        connection.release();
    } catch (error) {
        console.error('❌ Erro ao conectar ao banco de dados:', error.message);
        console.log('📋 Verifique se:');
        console.log('1. O MySQL está rodando');
        console.log('2. O banco "rotasol" existe');
        console.log('3. As credenciais estão corretas no arquivo .env');
    }
}

testConnection();

passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.NODE_ENV === 'production' 
        ? "https://seusite.com/auth/google/callback"
        : "http://localhost:3000/auth/google/callback"
}, async (accessToken, refreshToken, profile, done) => {
    // ... resto do código
}));
    try {
        console.log('📧 Dados do Google recebidos:', profile.emails[0].value);
        console.log('📸 Foto do perfil disponível:', profile.photos && profile.photos[0] ? profile.photos[0].value : 'NÃO');
        
        const [users] = await db.execute(
            'SELECT * FROM usuarios WHERE email = ?',
            [profile.emails[0].value]
        );

        if (users.length > 0) {
            console.log('✅ Usuário encontrado no banco:', users[0].email);
            
            if (profile.photos && profile.photos[0]) {
                const fotoUrl = profile.photos[0].value;
                console.log('🔄 Atualizando foto do perfil:', fotoUrl);
                await db.execute(
                    'UPDATE usuarios SET foto_perfil = ? WHERE id = ?',
                    [fotoUrl, users[0].id]
                );
                users[0].foto_perfil = fotoUrl;
            }

            const user = {
                id: users[0].id,
                nome_completo: users[0].nome_completo,
                email: users[0].email,
                usuario: users[0].usuario,
                tipo: users[0].tipo,
                foto_perfil: users[0].foto_perfil
            };
            
            console.log('👤 Usuário retornado:', user);
            return done(null, user);
        }

        console.log('👤 Criando novo usuário...');
        const fotoPerfil = profile.photos && profile.photos[0] ? profile.photos[0].value : null;
        
        console.log('📝 Inserindo usuário com foto:', fotoPerfil);
        const [result] = await db.execute(
            `INSERT INTO usuarios (nome_completo, email, usuario, ativo, tipo, foto_perfil) 
             VALUES (?, ?, ?, 1, 'doador', ?)`,
            [
                profile.displayName,
                profile.emails[0].value,
                profile.emails[0].value.split('@')[0],
                fotoPerfil
            ]
        );

        await db.execute(
            'INSERT INTO clientes (usuario_id) VALUES (?)',
            [result.insertId]
        );

        const newUser = {
            id: result.insertId,
            nome_completo: profile.displayName,
            email: profile.emails[0].value,
            usuario: profile.emails[0].value.split('@')[0],
            tipo: 'doador',
            foto_perfil: fotoPerfil
        };

        console.log('✅ Novo usuário criado:', newUser);
        return done(null, newUser);
    } catch (error) {
        console.error('❌ Erro no Google login:', error);
        return done(error, null);
    }
}));

passport.serializeUser((user, done) => {
    console.log('🔐 Serializando usuário:', user.id);
    done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
    try {
        console.log('🔓 Desserializando usuário:', id);
        const [users] = await db.execute('SELECT * FROM usuarios WHERE id = ?', [id]);
        
        if (users.length === 0) {
            return done(new Error('Usuário não encontrado'), null);
        }
        
        const user = {
            id: users[0].id,
            nome_completo: users[0].nome_completo,
            email: users[0].email,
            usuario: users[0].usuario,
            tipo: users[0].tipo,
            foto_perfil: users[0].foto_perfil
        };
        
        done(null, user);
    } catch (error) {
        console.error('❌ Erro ao desserializar usuário:', error);
        done(error, null);
    }
});

const authenticateToken = async (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Token de acesso necessário' });
    }

    try {
        const user = jwt.verify(token, process.env.JWT_SECRET || 'rotasol_secret');
        req.user = user;
        next();
    } catch (error) {
        return res.status(403).json({ error: 'Token inválido' });
    }
};

app.get('/auth/google',
    passport.authenticate('google', { 
        scope: ['profile', 'email'],
        prompt: 'select_account'
    })
);

app.get('/auth/google/callback',
    passport.authenticate('google', { 
        failureRedirect: '/login?error=google_failed',
        failureMessage: true 
    }),
    (req, res) => {
        try {
            console.log('✅ Login Google bem-sucedido para:', req.user.email);
            console.log('📸 Foto do usuário:', req.user.foto_perfil);
            
            const token = jwt.sign(
                { 
                    id: req.user.id, 
                    email: req.user.email,
                    usuario: req.user.usuario,
                    tipo: req.user.tipo,
                    nome: req.user.nome_completo,
                    foto: req.user.foto_perfil
                },
                process.env.JWT_SECRET || 'rotasol_secret',
                { expiresIn: '24h' }
            );
            
            const params = new URLSearchParams({
                token: token,
                nome: req.user.nome_completo,
                email: req.user.email
            });
            
            if (req.user.foto_perfil) {
                params.append('foto', req.user.foto_perfil);
            }
            
            const redirectUrl = `/login-success.html?${params.toString()}`;
            console.log('🔗 Redirecionando para:', redirectUrl);
            
            res.redirect(redirectUrl);
        } catch (error) {
            console.error('❌ Erro no callback do Google:', error);
            res.redirect('/login?error=google_failed');
        }
    }
);

app.get('/auth/logout', (req, res) => {
    req.logout((err) => {
        if (err) {
            console.error('Erro no logout:', err);
        }
        req.session.destroy(() => {
            res.redirect('/login?action=clear_storage');
        });
    });
});

app.get('/auth/google/debug', (req, res) => {
    res.json({
        message: 'Rota Google está funcionando',
        clientId: "502619427263-d9l6r2bm84cd2ajkuconljj6fel1ptiv.apps.googleusercontent.com".substring(0, 10) + '...',
        callbackURL: "http://localhost:3000/auth/google/callback"
    });
});

app.get('/auth/google/test', (req, res) => {
    res.redirect('/auth/google');
});

app.get('/api/debug-user/:email', async (req, res) => {
    try {
        const { email } = req.params;
        
        const [users] = await db.execute(
            'SELECT id, nome_completo, email, foto_perfil FROM usuarios WHERE email = ?',
            [email]
        );

        if (users.length === 0) {
            return res.status(404).json({ error: 'Usuário não encontrado' });
        }

        res.json({
            user: users[0],
            hasPhoto: !!users[0].foto_perfil,
            photoUrl: users[0].foto_perfil
        });
    } catch (error) {
        console.error('Erro ao buscar usuário:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

app.get('/api/check-photo-column', async (req, res) => {
    try {
        const [columns] = await db.execute(
            `SELECT COLUMN_NAME 
             FROM INFORMATION_SCHEMA.COLUMNS 
             WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'usuarios' AND COLUMN_NAME = 'foto_perfil'`,
            [dbConfig.database]
        );

        if (columns.length === 0) {
            console.log('📋 Criando coluna foto_perfil...');
            await db.execute(
                'ALTER TABLE usuarios ADD COLUMN foto_perfil TEXT NULL AFTER tipo'
            );
            res.json({ message: 'Coluna foto_perfil criada com sucesso' });
        } else {
            res.json({ message: 'Coluna foto_perfil já existe' });
        }
    } catch (error) {
        console.error('Erro ao verificar coluna:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

app.post('/api/login', async (req, res) => {
    try {
        const { usuario, senha } = req.body;

        if (!usuario || !senha) {
            return res.status(400).json({ error: 'Usuário e senha são obrigatórios' });
        }

        const [users] = await db.execute(
            'SELECT * FROM usuarios WHERE usuario = ? AND ativo = 1',
            [usuario]
        );

        if (users.length === 0) {
            return res.status(401).json({ error: 'Credenciais inválidas' });
        }

        const user = users[0];

        const validPassword = await bcrypt.compare(senha, user.senha);
        if (!validPassword) {
            return res.status(401).json({ error: 'Credenciais inválidas' });
        }

        await db.execute(
            'UPDATE usuarios SET ultimo_login = NOW() WHERE id = ?',
            [user.id]
        );

        const token = jwt.sign(
            { 
                id: user.id, 
                email: user.email, 
                tipo: user.tipo,
                usuario: user.usuario 
            },
            process.env.JWT_SECRET || 'rotasol_secret',
            { expiresIn: '24h' }
        );

        res.json({
            token,
            user: {
                id: user.id,
                nome: user.nome_completo,
                email: user.email,
                tipo: user.tipo,
                usuario: user.usuario,
                foto: user.foto_perfil
            }
        });

    } catch (error) {
        console.error('Erro no login:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

app.post('/api/register', async (req, res) => {
    try {
        const { nome_completo, email, usuario, senha } = req.body;

        if (!nome_completo || !email || !usuario || !senha) {
            return res.status(400).json({ error: 'Todos os campos são obrigatórios' });
        }

        const [existingUsers] = await db.execute(
            'SELECT id FROM usuarios WHERE usuario = ? OR email = ?',
            [usuario, email]
        );

        if (existingUsers.length > 0) {
            return res.status(400).json({ error: 'Usuário ou email já existe' });
        }

        const hashedPassword = await bcrypt.hash(senha, 10);

        const [result] = await db.execute(
            'INSERT INTO usuarios (nome_completo, email, usuario, senha) VALUES (?, ?, ?, ?)',
            [nome_completo, email, usuario, hashedPassword]
        );

        await db.execute(
            'INSERT INTO clientes (usuario_id) VALUES (?)',
            [result.insertId]
        );

        res.status(201).json({ 
            message: 'Usuário criado com sucesso', 
            id: result.insertId 
        });

    } catch (error) {
        console.error('Erro no registro:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

app.get('/api/me', authenticateToken, async (req, res) => {
    try {
        const [users] = await db.execute(
            'SELECT id, nome_completo, email, usuario, tipo, foto_perfil FROM usuarios WHERE id = ?',
            [req.user.id]
        );

        if (users.length === 0) {
            return res.status(404).json({ error: 'Usuário não encontrado' });
        }

        const user = users[0];
        console.log('📸 Foto no banco para usuário', user.email + ':', user.foto_perfil);

        res.json(user);
    } catch (error) {
        console.error('Erro ao buscar usuário:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

app.post('/api/doacoes', authenticateToken, async (req, res) => {
    try {
        const { tipo_doacao, quantidade, unidade_medida, localizacao_id, observacoes } = req.body;

        if (!tipo_doacao || !quantidade || !unidade_medida || !localizacao_id) {
            return res.status(400).json({ 
                error: 'Todos os campos obrigatórios devem ser preenchidos' 
            });
        }

        const conversaoTipos = {
            'Alimentos não perecíveis': 1.0,
            'Roupas': 0.5,
            'Calçados': 0.5,
            'Produtos de higiene': 0.5,
            'Brinquedos': 0.5,
            'Cobertores': 2.0,
            'Outros': 1.0
        };

        const conversaoUnidades = {
            'unidades': 1,
            'kg': 1,
            'litros': 1,
            'caixas': 5,
            'sacos': 4
        };

        const valorTipo = conversaoTipos[tipo_doacao] || 1.0;
        const valorUnidade = conversaoUnidades[unidade_medida] || 1;
        const quantidadeNumerica = parseFloat(quantidade) || 0;
        
        const valorTotalEstoque = valorTipo * valorUnidade * quantidadeNumerica;

        console.log(`📊 Conversão de estoque: ${quantidade} ${unidade_medida} de ${tipo_doacao} = ${valorTotalEstoque} unidades equivalentes`);

        const [result] = await db.execute(
            'INSERT INTO doacoes (usuario_id, tipo_doacao, quantidade, unidade_medida, localizacao_id, observacoes, status, valor_estoque) VALUES (?, ?, ?, ?, ?, ?, "pendente", ?)',
            [req.user.id, tipo_doacao, quantidade, unidade_medida, localizacao_id, observacoes || '', valorTotalEstoque]
        );

        try {
            await db.execute(
                `INSERT INTO estoque (localizacao_id, tipo_item, quantidade, unidade_medida, valor_estoque, status) 
                 VALUES (?, ?, ?, ?, ?, 'disponivel')
                 ON DUPLICATE KEY UPDATE 
                 quantidade = quantidade + VALUES(quantidade),
                 valor_estoque = valor_estoque + VALUES(valor_estoque)`,
                [localizacao_id, tipo_doacao, quantidadeNumerica, unidade_medida, valorTotalEstoque]
            );
            
            console.log(`✅ Estoque atualizado: +${valorTotalEstoque} unidades equivalentes de ${tipo_doacao}`);
            
        } catch (estoqueError) {
            console.log('Tabela estoque não encontrada ou erro ao atualizar:', estoqueError.message);
        }

        res.status(201).json({ 
            message: 'Doação registrada com sucesso!', 
            id: result.insertId,
            codigo: `D${result.insertId.toString().padStart(6, '0')}`,
            conversao: {
                tipo_doacao: tipo_doacao,
                quantidade_original: quantidade,
                unidade_original: unidade_medida,
                valor_estoque: valorTotalEstoque,
                unidade_estoque: 'unidades equivalentes'
            }
        });

    } catch (error) {
        console.error('Erro ao registrar doação:', error);
        res.status(500).json({ error: 'Erro interno do servidor ao registrar doação' });
    }
});

app.get('/api/minhas-doacoes', authenticateToken, async (req, res) => {
    try {
        const [doacoes] = await db.execute(
            `SELECT d.*, l.nome as local_nome 
             FROM doacoes d 
             LEFT JOIN localizacoes l ON d.localizacao_id = l.id 
             WHERE d.usuario_id = ? 
             ORDER BY d.data_doacao DESC`,
            [req.user.id]
        );

        const [totalMes] = await db.execute(
            `SELECT COUNT(*) as total, COALESCE(SUM(quantidade), 0) as quantidade_total 
             FROM doacoes 
             WHERE usuario_id = ? AND MONTH(data_doacao) = MONTH(CURRENT_DATE()) 
             AND YEAR(data_doacao) = YEAR(CURRENT_DATE())`,
            [req.user.id]
        );

        res.json({
            doacoes,
            total: totalMes[0].total,
            quantidade_total: totalMes[0].quantidade_total
        });

    } catch (error) {
        console.error('Erro ao buscar doações:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

app.get('/api/pontos-coleta', async (req, res) => {
    try {
        const [pontos] = await db.execute(
            'SELECT * FROM localizacoes WHERE ativo = 1'
        );
        res.json(pontos);
    } catch (error) {
        console.error('Erro ao buscar pontos:', error);
        res.status(500).json({ error: 'Erro ao buscar pontos de coleta' });
    }
});

app.get('/api/estoque-geral', async (req, res) => {
    try {
        const [estoque] = await db.execute(`
            SELECT 
                tipo_item,
                SUM(valor_estoque) as quantidade_total,
                'unidades equivalentes' as unidade_medida
            FROM estoque 
            WHERE status = 'disponivel'
            GROUP BY tipo_item
            ORDER BY tipo_item
        `);
        
        res.json(estoque);
    } catch (error) {
        console.error('Erro ao buscar estoque geral:', error);
        
        try {
            const [estoqueFallback] = await db.execute(`
                SELECT 
                    tipo_item,
                    SUM(quantidade) as quantidade_total,
                    unidade_medida
                FROM estoque 
                WHERE status = 'disponivel'
                GROUP BY tipo_item, unidade_medida
                ORDER BY tipo_item
            `);
            
            res.json(estoqueFallback);
        } catch (fallbackError) {
            res.status(500).json({ error: 'Erro interno do servidor' });
        }
    }
});

app.post('/api/salvar-localizacao', authenticateToken, async (req, res) => {
    try {
        const { endereco, latitude, longitude } = req.body;

        const [result] = await db.execute(
            'INSERT INTO localizacoes_usuario (usuario_id, endereco, latitude, longitude) VALUES (?, ?, ?, ?)',
            [req.user.id, endereco, latitude, longitude]
        );
        
        res.json({ 
            message: 'Localização salva com sucesso', 
            id: result.insertId 
        });
        
    } catch (error) {
        console.error('Erro ao salvar localização:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

app.get('/api/minhas-localizacoes', authenticateToken, async (req, res) => {
    try {
        const [localizacoes] = await db.execute(
            'SELECT * FROM localizacoes_usuario WHERE usuario_id = ? ORDER BY data_registro DESC',
            [req.user.id]
        );
        
        res.json(localizacoes);
    } catch (error) {
        console.error('Erro ao buscar localizações:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

app.post('/api/visitas', authenticateToken, async (req, res) => {
    try {
        const { localizacao_id, data_visita, observacoes } = req.body;

        const [clientes] = await db.execute(
            'SELECT id FROM clientes WHERE usuario_id = ?',
            [req.user.id]
        );

        if (clientes.length === 0) {
            return res.status(400).json({ error: 'Cliente não encontrado' });
        }

        const cliente_id = clientes[0].id;

        const [result] = await db.execute(
            'INSERT INTO visitas (cliente_id, localizacao_id, data_visita, observacoes, status) VALUES (?, ?, ?, ?, "agendada")',
            [cliente_id, localizacao_id, data_visita, observacoes]
        );

        res.status(201).json({ 
            message: 'Visita agendada com sucesso', 
            id: result.insertId 
        });

    } catch (error) {
        console.error('Erro ao agendar visita:', error);
        res.status(500).json({ error: 'Erro ao agendar visita' });
    }
});

app.get('/api/parceiros', async (req, res) => {
    try {
        const [parceiros] = await db.execute(
            'SELECT * FROM parceiros WHERE ativo = 1'
        );
        res.json(parceiros);
    } catch (error) {
        console.error('Erro ao buscar parceiros:', error);
        res.status(500).json({ error: 'Erro ao buscar parceiros' });
    }
});

app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'API está funcionando', 
        timestamp: new Date().toISOString(),
        database: 'Conectado'
    });
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'paginainicial.html'));
});

app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'teladelogin.html'));
});

const requireAdminAuth = (req, res, next) => {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Token de autenticação necessário' });
    }
    
    const token = authHeader.substring(7);
    
    try {
        const decoded = Buffer.from(token, 'base64').toString('utf-8');
        const [usuario, timestamp] = decoded.split('|');
        
        if (Date.now() - parseInt(timestamp) > 24 * 60 * 60 * 1000) {
            return res.status(401).json({ error: 'Token expirado' });
        }
    
        if (usuario === 'admin') {
            req.admin = { usuario: 'admin', id: 1 };
            next();
        } else {
            return res.status(401).json({ error: 'Token inválido' });
        }
    } catch (error) {
        return res.status(401).json({ error: 'Token inválido' });
    }
};

app.post('/api/admin/login', async (req, res) => {
    const { usuario, senha } = req.body;
    
    console.log('🔐 Tentativa de login admin:', { usuario });
    
    if (!usuario || !senha) {
        return res.status(400).json({ error: 'Usuário e senha são obrigatórios' });
    }
    
    if (usuario === 'admin' && senha === 'admin123') {
        const token = Buffer.from(`admin|${Date.now()}`).toString('base64');
        
        console.log('✅ Login admin bem-sucedido');
        
        res.json({
            token,
            admin: {
                id: 1,
                usuario: 'admin'
            }
        });
    } else {
        console.log('❌ Login admin falhou');
        res.status(401).json({ error: 'Credenciais inválidas' });
    }
});

app.get('/api/admin/me', requireAdminAuth, (req, res) => {
    res.json({
        admin: {
            id: req.admin.id,
            usuario: req.admin.usuario
        }
    });
});

app.get('/api/admin/stats', requireAdminAuth, async (req, res) => {
    try {
        const [totalUsuarios] = await db.execute('SELECT COUNT(*) as total FROM usuarios');
        const [totalDoacoes] = await db.execute('SELECT COUNT(*) as total FROM doacoes');
        const [valorTotal] = await db.execute(`
            SELECT COALESCE(SUM(valor_estoque), 0) as total 
            FROM estoque 
            WHERE status = 'disponivel'
        `);

        res.json({
            totalUsuarios: totalUsuarios[0].total,
            totalDoacoes: totalDoacoes[0].total,
            valorTotal: valorTotal[0].total || 0
        });
    } catch (error) {
        console.error('Erro ao carregar estatísticas:', error);
        res.status(500).json({ error: 'Erro ao carregar estatísticas' });
    }
});

app.get('/api/admin/usuarios', requireAdminAuth, async (req, res) => {
    try {
        const [usuarios] = await db.execute(`
            SELECT 
                u.id,
                u.nome_completo as nome,
                u.email,
                u.usuario,
                DATE_FORMAT(u.data_criacao, '%Y-%m-%d') as data_cadastro,
                DATE_FORMAT(u.ultimo_login, '%Y-%m-%d %H:%i') as ultimo_acesso,
                CASE WHEN u.ativo = 1 THEN 'ativo' ELSE 'inativo' END as status,
                COUNT(d.id) as quantidade_doacoes,
                COALESCE(SUM(d.valor_estoque), 0) as total_doacoes
            FROM usuarios u
            LEFT JOIN doacoes d ON u.id = d.usuario_id
            GROUP BY u.id
            ORDER BY u.nome_completo
        `);
        
        res.json(usuarios);
    } catch (error) {
        console.error('Erro ao carregar usuários:', error);
        res.status(500).json({ error: 'Erro ao carregar usuários' });
    }
});

app.get('/api/admin/usuarios/:id', requireAdminAuth, async (req, res) => {
    try {
        const userId = req.params.id;
        
        const [usuarios] = await db.execute(`
            SELECT 
                u.*,
                COUNT(d.id) as quantidade_doacoes,
                COALESCE(SUM(d.valor_estoque), 0) as total_doacoes,
                MAX(d.data_doacao) as ultima_doacao
            FROM usuarios u
            LEFT JOIN doacoes d ON u.id = d.usuario_id
            WHERE u.id = ?
            GROUP BY u.id
        `, [userId]);

        if (usuarios.length === 0) {
            return res.status(404).json({ error: 'Usuário não encontrado' });
        }

        const [doacoes] = await db.execute(`
            SELECT d.*, l.nome as local_nome
            FROM doacoes d 
            LEFT JOIN localizacoes l ON d.localizacao_id = l.id
            WHERE d.usuario_id = ? 
            ORDER BY d.data_doacao DESC
        `, [userId]);

        const usuario = usuarios[0];
        usuario.doacoes = doacoes;

        res.json(usuario);
    } catch (error) {
        console.error('Erro ao carregar detalhes do usuário:', error);
        res.status(500).json({ error: 'Erro ao carregar detalhes do usuário' });
    }
});

app.get('/api/admin/doacoes', requireAdminAuth, async (req, res) => {
    try {
        const [doacoes] = await db.execute(`
            SELECT 
                d.*,
                u.nome_completo as usuario,
                l.nome as local_nome
            FROM doacoes d
            JOIN usuarios u ON d.usuario_id = u.id
            LEFT JOIN localizacoes l ON d.localizacao_id = l.id
            ORDER BY d.data_doacao DESC
        `);
        
        res.json(doacoes);
    } catch (error) {
        console.error('Erro ao carregar doações:', error);
        res.status(500).json({ error: 'Erro ao carregar doações' });
    }
});

app.delete('/api/admin/doacoes/:id', requireAdminAuth, async (req, res) => {
    try {
        const { id } = req.params;
        
        console.log(`🗑️ Tentando remover doação ID: ${id}`);
        
        const [doacoes] = await db.execute(
            'SELECT * FROM doacoes WHERE id = ?',
            [id]
        );
        
        if (doacoes.length === 0) {
            return res.status(404).json({ error: 'Doação não encontrada' });
        }
        
        const doacao = doacoes[0];
        
        console.log(`📋 Doação a ser removida:`, {
            id: doacao.id,
            usuario_id: doacao.usuario_id,
            tipo: doacao.tipo_doacao,
            quantidade: doacao.quantidade,
            valor_estoque: doacao.valor_estoque
        });
        
        const [result] = await db.execute(
            'DELETE FROM doacoes WHERE id = ?',
            [id]
        );
        
        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Doação não encontrada' });
        }
        
        console.log(`✅ Doação ${id} removida com sucesso`);
        
        res.json({ 
            success: true,
            message: 'Doação confirmada e removida com sucesso',
            doacao_removida: {
                id: doacao.id,
                tipo: doacao.tipo_doacao,
                quantidade: doacao.quantidade
            }
        });
        
    } catch (error) {
        console.error('❌ Erro ao remover doação:', error);
        res.status(500).json({ error: 'Erro interno do servidor ao remover doação' });
    }
});

app.get('/api/admin/contatos', requireAdminAuth, async (req, res) => {
    try {
        const [contatos] = await db.execute(`
            SELECT 
                id,
                nome_completo as nome,
                email,
                assunto,
                mensagem,
                status,
                DATE_FORMAT(data_registro, '%Y-%m-%d %H:%i') as data_envio
            FROM contatos 
            ORDER BY data_registro DESC
        `);
        
        res.json(contatos);
    } catch (error) {
        console.error('Erro ao carregar contatos:', error);
        res.status(500).json({ error: 'Erro ao carregar contatos' });
    }
});

app.put('/api/admin/contatos/:id/responder', requireAdminAuth, async (req, res) => {
    try {
        const { id } = req.params;
        
        const [result] = await db.execute(
            'UPDATE contatos SET status = "respondido", data_resposta = CURRENT_TIMESTAMP WHERE id = ?',
            [id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Contato não encontrado' });
        }

        res.json({ message: 'Contato marcado como respondido' });
    } catch (error) {
        console.error('Erro ao responder contato:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

app.get('/api/admin/charts', requireAdminAuth, async (req, res) => {
    try {
        const [doacoesMes] = await db.execute(`
            SELECT 
                DATE_FORMAT(data_doacao, '%Y-%m') as mes,
                COUNT(*) as quantidade,
                SUM(valor_estoque) as valor
            FROM doacoes 
            WHERE data_doacao >= DATE_SUB(NOW(), INTERVAL 6 MONTH)
            GROUP BY DATE_FORMAT(data_doacao, '%Y-%m')
            ORDER BY mes
        `);

        const [tiposDoacao] = await db.execute(`
            SELECT 
                tipo_doacao,
                COUNT(*) as quantidade,
                SUM(valor_estoque) as valor
            FROM doacoes 
            GROUP BY tipo_doacao
            ORDER BY valor DESC
            LIMIT 6
        `);

        const [novosUsuarios] = await db.execute(`
            SELECT 
                DATE_FORMAT(data_criacao, '%Y-%m') as mes,
                COUNT(*) as quantidade
            FROM usuarios 
            WHERE data_criacao >= DATE_SUB(NOW(), INTERVAL 6 MONTH)
            GROUP BY DATE_FORMAT(data_criacao, '%Y-%m')
            ORDER BY mes
        `);

        const [locaisAtivos] = await db.execute(`
            SELECT 
                l.nome as local,
                COUNT(d.id) as quantidade_doacoes,
                SUM(d.valor_estoque) as valor_total
            FROM doacoes d
            JOIN localizacoes l ON d.localizacao_id = l.id
            GROUP BY l.id, l.nome
            ORDER BY valor_total DESC
            LIMIT 5
        `);

        res.json({
            doacoesPorMes: {
                labels: doacoesMes.map(item => {
                    const [year, month] = item.mes.split('-');
                    return `${month}/${year}`;
                }),
                valores: doacoesMes.map(item => item.quantidade)
            },
            tiposDoacao: {
                labels: tiposDoacao.map(item => item.tipo_doacao),
                valores: tiposDoacao.map(item => item.quantidade)
            },
            novosUsuarios: {
                labels: novosUsuarios.map(item => {
                    const [year, month] = item.mes.split('-');
                    return `${month}/${year}`;
                }),
                valores: novosUsuarios.map(item => item.quantidade)
            },
            locaisAtivos: {
                labels: locaisAtivos.map(item => item.local),
                valores: locaisAtivos.map(item => item.quantidade_doacoes)
            }
        });
    } catch (error) {
        console.error('Erro ao carregar dados dos gráficos:', error);
        res.status(500).json({ error: 'Erro ao carregar dados dos gráficos' });
    }
});

app.get('/api/conversoes-estoque', (req, res) => {
    const conversoes = {
        tipos: {
            'Alimentos não perecíveis': 1.0,
            'Roupas': 0.5,
            'Calçados': 0.5,
            'Produtos de higiene': 0.5,
            'Brinquedos': 0.5,
            'Cobertores': 2.0,
            'Outros': 1.0
        },
        unidades: {
            'unidades': 1,
            'kg': 1,
            'litros': 1,
            'caixas': 5,
            'sacos': 4
        }
    };
    
    res.json(conversoes);
});

app.put('/api/upload-foto-perfil', authenticateToken, async (req, res) => {
    try {
        console.log('📸 Iniciando upload de foto para usuário:', req.user.id);
        
        const { foto_base64 } = req.body;

        if (!foto_base64) {
            console.log('❌ Dados da foto não fornecidos');
            return res.status(400).json({ error: 'Dados da foto são obrigatórios' });
        }

        if (!foto_base64.startsWith('data:image/')) {
            console.log('❌ Formato de imagem inválido');
            return res.status(400).json({ error: 'Formato de imagem inválido' });
        }

        console.log('📝 Atualizando foto no banco...');

        const [result] = await db.execute(
            'UPDATE usuarios SET foto_perfil = ? WHERE id = ?',
            [foto_base64, req.user.id]
        );

        console.log('✅ Resultado da atualização:', result);

        if (result.affectedRows === 0) {
            console.log('❌ Usuário não encontrado');
            return res.status(404).json({ error: 'Usuário não encontrado' });
        }

        console.log('✅ Foto de perfil atualizada para usuário:', req.user.id);

        const [users] = await db.execute(
            'SELECT foto_perfil FROM usuarios WHERE id = ?',
            [req.user.id]
        );

        console.log('📸 Foto salva no banco:', users[0].foto_perfil ? 'SIM' : 'NÃO');

        res.json({ 
            message: 'Foto de perfil atualizada com sucesso',
            foto_url: foto_base64,
            debug: {
                usuario_id: req.user.id,
                foto_salva: !!users[0].foto_perfil
            }
        });

    } catch (error) {
        console.error('❌ Erro ao atualizar foto de perfil:', error);
        res.status(500).json({ error: 'Erro interno do servidor: ' + error.message });
    }
});

app.delete('/api/remove-foto-perfil', authenticateToken, async (req, res) => {
    try {
        console.log('🗑️ Removendo foto do usuário:', req.user.id);
        
        const [result] = await db.execute(
            'UPDATE usuarios SET foto_perfil = NULL WHERE id = ?',
            [req.user.id]
        );

        console.log('✅ Resultado da remoção:', result);

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Usuário não encontrado' });
        }

        console.log('✅ Foto de perfil removida para usuário:', req.user.id);

        res.json({ 
            message: 'Foto de perfil removida com sucesso',
            debug: {
                usuario_id: req.user.id,
                foto_removida: true
            }
        });

    } catch (error) {
        console.error('❌ Erro ao remover foto de perfil:', error);
        res.status(500).json({ error: 'Erro interno do servidor: ' + error.message });
    }
});

app.get('/api/debug-foto-usuario', authenticateToken, async (req, res) => {
    try {
        const [users] = await db.execute(
            'SELECT id, nome_completo, email, foto_perfil FROM usuarios WHERE id = ?',
            [req.user.id]
        );

        if (users.length === 0) {
            return res.status(404).json({ error: 'Usuário não encontrado' });
        }

        const user = users[0];
        
        res.json({
            usuario: {
                id: user.id,
                nome: user.nome_completo,
                email: user.email
            },
            foto_perfil: {
                existe: !!user.foto_perfil,
                tipo: user.foto_perfil ? typeof user.foto_perfil : 'null',
                tamanho: user.foto_perfil ? user.foto_perfil.length : 0,
                preview: user.foto_perfil ? user.foto_perfil.substring(0, 50) + '...' : 'null'
            },
            debug: {
                timestamp: new Date().toISOString(),
                usuario_id: req.user.id
            }
        });

    } catch (error) {
        console.error('Erro no debug:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

app.post('/api/contato', async (req, res) => {
    try {
        const { name, email, subject, message } = req.body;

        if (!name || !email || !subject || !message) {
            return res.status(400).json({ 
                error: 'Todos os campos são obrigatórios' 
            });
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({ 
                error: 'Email inválido' 
            });
        }

        const [result] = await db.execute(
            'INSERT INTO contatos (nome_completo, email, assunto, mensagem) VALUES (?, ?, ?, ?)',
            [name, email, subject, message]
        );

        console.log(`📧 Nova mensagem de contato de: ${name} (${email}) - Assunto: ${subject}`);

        res.status(201).json({ 
            success: true,
            message: 'Mensagem enviada com sucesso! Entraremos em contato em breve.',
            id: result.insertId
        });

    } catch (error) {
        console.error('❌ Erro ao processar contato:', error);
        res.status(500).json({ 
            success: false,
            error: 'Erro interno do servidor. Tente novamente mais tarde.' 
        });
    }
});

app.get('/api/contatos', authenticateToken, async (req, res) => {
    try {
        if (req.user.tipo !== 'admin') {
            return res.status(403).json({ error: 'Acesso negado' });
        }

        const [contatos] = await db.execute(`
            SELECT id, nome_completo, email, assunto, mensagem, status, 
                   DATE_FORMAT(data_registro, '%d/%m/%Y %H:%i') as data_formatada,
                   data_resposta
            FROM contatos 
            ORDER BY data_registro DESC
        `);

        res.json(contatos);

    } catch (error) {
        console.error('Erro ao buscar contatos:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

app.put('/api/contatos/:id/responder', authenticateToken, async (req, res) => {
    try {
        if (req.user.tipo !== 'admin') {
            return res.status(403).json({ error: 'Acesso negado' });
        }

        const { id } = req.params;
        const { resposta } = req.body;

        const [result] = await db.execute(
            'UPDATE contatos SET status = "respondido", resposta = ?, data_resposta = CURRENT_TIMESTAMP WHERE id = ?',
            [resposta, id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Contato não encontrado' });
        }

        res.json({ message: 'Resposta enviada com sucesso' });

    } catch (error) {
        console.error('Erro ao responder contato:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

app.get('/admin-painel.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin-painel.html'));
});

app.get('/admin-login.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin-login.html'));
});

app.listen(PORT, () => {
    console.log(`🚀 Servidor rodando na porta ${PORT}`);
    console.log(`📊 Painel: http://localhost:${PORT}`);
    console.log(`🔐 Login: http://localhost:${PORT}/login`);
    console.log(`👑 Admin: http://localhost:${PORT}/admin-login.html`);
    console.log(`🔗 Teste Google: http://localhost:${PORT}/auth/google/test`);
    console.log(`📋 Verificar coluna foto: http://localhost:${PORT}/api/check-photo-column`);
    console.log(`\n📝 Credenciais Admin:`);
    console.log(`   👤 Usuário: admin`);
    console.log(`   🔑 Senha: admin123`);
});

process.on('unhandledRejection', (err) => {
    console.error('❌ Erro não tratado:', err);
    process.exit(1);
});