const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const db = mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'rotasol'
});

db.connect((err) => {
    if (err) {
        console.error('Erro ao conectar ao banco de dados:', err);
        return;
    }
    console.log('Conectado ao banco de dados MySQL');
});

const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Token de acesso necessário' });
    }

    jwt.verify(token, process.env.JWT_SECRET || 'rotasol_secret', (err, user) => {
        if (err) {
            return res.status(403).json({ error: 'Token inválido' });
        }
        req.user = user;
        next();
    });
};

app.post('/api/login', async (req, res) => {
    const { usuario, senha } = req.body;

    if (!usuario || !senha) {
        return res.status(400).json({ error: 'Usuário e senha são obrigatórios' });
    }

    try {
        const query = 'SELECT * FROM usuarios WHERE usuario = ? AND ativo = 1';
        db.query(query, [usuario], async (err, results) => {
            if (err) {
                return res.status(500).json({ error: 'Erro no servidor' });
            }

            if (results.length === 0) {
                return res.status(401).json({ error: 'Credenciais inválidas' });
            }

            const user = results[0];

            const validPassword = await bcrypt.compare(senha, user.senha);
            if (!validPassword) {
                return res.status(401).json({ error: 'Credenciais inválidas' });
            }
            const updateQuery = 'UPDATE usuarios SET ultimo_login = NOW() WHERE id = ?';
            db.query(updateQuery, [user.id]);

            const token = jwt.sign(
                { id: user.id, email: user.email, tipo: user.tipo },
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
                    usuario: user.usuario
                }
            });
        });
    } catch (error) {
        res.status(500).json({ error: 'Erro no servidor' });
    }
});

app.post('/api/register', async (req, res) => {
    const { nome_completo, email, usuario, senha } = req.body;

    if (!nome_completo || !email || !usuario || !senha) {
        return res.status(400).json({ error: 'Todos os campos são obrigatórios' });
    }

    try {
        const hashedPassword = await bcrypt.hash(senha, 10);

        const query = 'INSERT INTO usuarios (nome_completo, email, usuario, senha, tipo) VALUES (?, ?, ?, ?, "cliente")';
        db.query(query, [nome_completo, email, usuario, hashedPassword], (err, results) => {
            if (err) {
                if (err.code === 'ER_DUP_ENTRY') {
                    return res.status(400).json({ error: 'Email ou usuário já existe' });
                }
                return res.status(500).json({ error: 'Erro ao criar usuário' });
            }

            const clienteQuery = 'INSERT INTO clientes (usuario_id) VALUES (?)';
            db.query(clienteQuery, [results.insertId], (err) => {
                if (err) {
                    console.error('Erro ao criar cliente:', err);
                }
                
                res.status(201).json({ 
                    message: 'Usuário criado com sucesso', 
                    id: results.insertId 
                });
            });
        });
    } catch (error) {
        res.status(500).json({ error: 'Erro no servidor' });
    }
});

app.get('/api/pontos-coleta', (req, res) => {
    const query = 'SELECT * FROM localizacoes WHERE ativo = 1';
    db.query(query, (err, results) => {
        if (err) {
            return res.status(500).json({ error: 'Erro ao buscar pontos de coleta' });
        }
        res.json(results);
    });
});

app.get('/api/pontos-coleta/:cidade', (req, res) => {
    const { cidade } = req.params;
    const query = 'SELECT * FROM localizacoes WHERE cidade LIKE ? AND ativo = 1';
    db.query(query, [`%${cidade}%`], (err, results) => {
        if (err) {
            return res.status(500).json({ error: 'Erro ao buscar pontos de coleta' });
        }
        res.json(results);
    });
});

app.get('/api/parceiros', (req, res) => {
    const query = 'SELECT * FROM parceiros WHERE ativo = 1';
    db.query(query, (err, results) => {
        if (err) {
            return res.status(500).json({ error: 'Erro ao buscar parceiros' });
        }
        res.json(results);
    });
});

app.get('/api/estoque', (req, res) => {
    const query = `
        SELECT l.nome as local, l.capacidade, 
               COALESCE(SUM(CASE WHEN d.status = 'disponivel' THEN d.quantidade ELSE 0 END), 0) as disponivel,
               MAX(d.data_entrada) as ultima_coleta
        FROM localizacoes l
        LEFT JOIN doacoes d ON l.id = d.localizacao_id
        WHERE l.ativo = 1
        GROUP BY l.id, l.nome, l.capacidade
    `;
    
    db.query(query, (err, results) => {
        if (err) {
            return res.status(500).json({ error: 'Erro ao buscar estoque' });
        }
        
        const formattedResults = results.map(item => ({
            local: item.local,
            disponivel: item.disponivel,
            capacidade: item.capacidade,
            coleta: item.ultima_coleta ? new Date(item.ultima_coleta).toLocaleDateString('pt-BR') : 'N/A'
        }));
        
        res.json(formattedResults);
    });
});

app.get('/api/visitas', authenticateToken, (req, res) => {
    let query = `
        SELECT v.*, l.nome as local_nome, l.endereco as local_endereco,
               u.nome_completo as cliente_nome
        FROM visitas v
        JOIN localizacoes l ON v.localizacao_id = l.id
        JOIN clientes c ON v.cliente_id = c.id
        JOIN usuarios u ON c.usuario_id = u.id
        WHERE u.id = ?
    `;

    db.query(query, [req.user.id], (err, results) => {
        if (err) {
            return res.status(500).json({ error: 'Erro ao buscar visitas' });
        }
        res.json(results);
    });
});

app.post('/api/visitas', authenticateToken, (req, res) => {
    const { localizacao_id, data_visita, observacoes } = req.body;
    
    const clienteQuery = 'SELECT id FROM clientes WHERE usuario_id = ?';
    db.query(clienteQuery, [req.user.id], (err, results) => {
        if (err || results.length === 0) {
            return res.status(500).json({ error: 'Erro ao identificar cliente' });
        }
        
        const cliente_id = results[0].id;
        const visitaQuery = `
            INSERT INTO visitas (cliente_id, localizacao_id, data_visita, observacoes, status)
            VALUES (?, ?, ?, ?, 'agendada')
        `;
        
        db.query(visitaQuery, [cliente_id, localizacao_id, data_visita, observacoes], (err, results) => {
            if (err) {
                return res.status(500).json({ error: 'Erro ao agendar visita' });
            }
            res.status(201).json({ message: 'Visita agendada com sucesso', id: results.insertId });
        });
    });
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'paginainicial.html'));
});

app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'teladelogin.html'));
});


app.get('/api/health', (req, res) => {
    res.json({ status: 'API está funcionando', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});

process.on('unhandledRejection', (err) => {
    console.error('Erro não tratado:', err);
    process.exit(1);
});