const pontosColeta = {
  "criciúma": "Rua das Flores, 123 - Centro",
  "içara": "Av. Central, 456 - Bairro Jardim",
  "araranguá": "Rodovia do Sol, 789 - Bairro Sul"
};

const empresasDoadoras = [
  "Mercado Solidário",
  "Construtora Esperança",
  "Farmácia Vida",
  "Tech do Bem",
  "AgroDona"
];

const estoqueAtual = [
  {
    local: "Criciúma",
    disponivel: 75,
    capacidade: 100,
    coleta: "10/08/2025"
  },
  {
    local: "Içara",
    disponivel: 40,
    capacidade: 80,
    coleta: "12/08/2025"
  },
  {
    local: "Araranguá",
    disponivel: 20,
    capacidade: 60,
    coleta: "14/08/2025"
  }
];

let routingControl = null;
let currentRoute = null;
let userLocation = null;
let autocompleteTimeout = null;

function buscarPonto() {
  const cidadeInput = document.getElementById("cidade").value.toLowerCase().trim();
  const resultado = document.getElementById("pontoProximo");

  if (pontosColeta[cidadeInput]) {
    resultado.textContent = `Ponto de coleta: ${pontosColeta[cidadeInput]}`;
  } else {
    resultado.textContent = "Cidade não encontrada ou ainda sem ponto de coleta.";
  }
}

function preencherEmpresas() {
  const lista = document.getElementById("listaEmpresas");
  lista.innerHTML = "";

  empresasDoadoras.forEach(empresa => {
    const li = document.createElement("li");
    li.textContent = empresa;
    lista.appendChild(li);
  });
}

function preencherEstoque() {
  const tabela = document.getElementById("tabelaEstoque");
  tabela.innerHTML = "";

  estoqueAtual.forEach(estoque => {
    const tr = document.createElement("tr");

    const tdLocal = document.createElement("td");
    tdLocal.textContent = estoque.local;

    const tdDisponivel = document.createElement("td");
    tdDisponivel.textContent = estoque.disponivel;

    const tdCapacidade = document.createElement("td");
    tdCapacidade.textContent = estoque.capacidade;

    const tdFaltando = document.createElement("td");
    tdFaltando.textContent = estoque.capacidade - estoque.disponivel;

    const tdColeta = document.createElement("td");
    tdColeta.textContent = estoque.coleta;

    tr.appendChild(tdLocal);
    tr.appendChild(tdDisponivel);
    tr.appendChild(tdCapacidade);
    tr.appendChild(tdFaltando);
    tr.appendChild(tdColeta);

    tabela.appendChild(tr);
  });
}

window.onload = function () {
  preencherEmpresas();
  preencherEstoque();
};
app.get('/api/locais-coleta', async (req, res) => {
    try {
        const [locais] = await db.execute(`
            SELECT 
                id,
                nome,
                endereco,
                latitude,
                longitude,
                telefone,
                horario_funcionamento,
                capacidade_total,
                estoque_atual,
                unidade_medida,
                porcentagem_ocupacao,
                status_ocupacao,
                data_proxima_entrega,
                descricao_proxima_entrega,
                tipos_itens_aceitos,
                data_atualizacao
            FROM locais_coleta 
            WHERE ativo = 1 
            ORDER BY nome
        `);
        
        res.json(locais);
    } catch (error) {
        console.error('Erro ao buscar locais:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

app.put('/api/locais-coleta/:id/estoque', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { estoque_atual } = req.body;
        
        const [result] = await db.execute(
            'UPDATE locais_coleta SET estoque_atual = ?, data_atualizacao = CURRENT_TIMESTAMP WHERE id = ?',
            [estoque_atual, id]
        );
        
        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Local não encontrado' });
        }
        
        res.json({ message: 'Estoque atualizado com sucesso' });
    } catch (error) {
        console.error('Erro ao atualizar estoque:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

app.post('/api/locais-coleta/:id/adicionar-doacao', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { quantidade } = req.body;
        
        const [result] = await db.execute(
            'UPDATE locais_coleta SET estoque_atual = estoque_atual + ?, data_atualizacao = CURRENT_TIMESTAMP WHERE id = ?',
            [quantidade, id]
        );
        
        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Local não encontrado' });
        }
        
        res.json({ message: 'Doação adicionada ao estoque com sucesso' });
    } catch (error) {
        console.error('Erro ao adicionar doação:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

app.put('/api/locais-coleta/:id/agendar-entrega', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { data_entrega, descricao } = req.body;
        
        const [result] = await db.execute(
            'UPDATE locais_coleta SET data_proxima_entrega = ?, descricao_proxima_entrega = ?, data_atualizacao = CURRENT_TIMESTAMP WHERE id = ?',
            [data_entrega, descricao, id]
        );
        
        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Local não encontrado' });
        }
        
        res.json({ message: 'Entrega agendada com sucesso' });
    } catch (error) {
        console.error('Erro ao agendar entrega:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

document.addEventListener('DOMContentLoaded', function() {
    const loadingScreen = document.getElementById('loadingScreen');
    const loadingBar = document.getElementById('loadingBar');

    let progress = 0;
    const interval = setInterval(() => {
        progress += 10;
        loadingBar.style.width = progress + '%';
        
        if (progress >= 100) {
            clearInterval(interval);
            setTimeout(() => {
                loadingScreen.style.display = 'none';
                checkUserLogin();
                initMap();
                setTimeout(() => {
                    loadEstoqueGeral();
                    setupEstoqueEvents();
                }, 1500);
            }, 500);
        }
    }, 200);
});