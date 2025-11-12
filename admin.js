let currentPage = 1;
let currentPageDoacoes = 1;
let itemsPerPage = 10;
let currentSort = { field: 'nome', direction: 'asc' };
let currentSortDoacoes = { field: 'data_doacao', direction: 'desc' };
let usuariosData = [];
let doacoesData = [];
let filteredUsuarios = [];
let filteredDoacoes = [];

document.addEventListener('DOMContentLoaded', function() {
    checkAdminAuth();
    setupEventListeners();
    loadDashboardStats();
    loadUsuarios();
    loadDoacoes();
    loadContatos();
    setupCharts();
});

async function checkAdminAuth() {
    const token = localStorage.getItem('adminToken');
    const adminUsuario = localStorage.getItem('adminUsuario');
    
    if (!token || !adminUsuario) {
        console.log('❌ Nenhum token encontrado, redirecionando para login...');
        window.location.href = 'admin-login.html';
        return;
    }
    
    document.getElementById('adminName').textContent = adminUsuario;
    
    try {
        const response = await fetch('/api/admin/me', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (!response.ok) {
            throw new Error('Token inválido');
        }
        
        console.log('✅ Token válido, admin autenticado');
        
    } catch (error) {
        console.error('❌ Erro de autenticação:', error);
        logout();
    }
}

function setupEventListeners() {
    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            const section = this.getAttribute('data-section');
            showSection(section);
        });
    });
    
    document.getElementById('logoutBtn').addEventListener('click', logout);
    
    document.getElementById('searchUsuarios').addEventListener('input', function() {
        filterUsuarios();
    });
    
    document.getElementById('filterStatus').addEventListener('change', filterUsuarios);
    document.getElementById('filterData').addEventListener('change', filterUsuarios);
    
    document.getElementById('searchDoacoes').addEventListener('input', function() {
        filterDoacoes();
    });
    
    document.getElementById('filterTipoDoacao').addEventListener('change', filterDoacoes);
    document.getElementById('filterDataDoacao').addEventListener('change', filterDoacoes);
    
    document.querySelectorAll('#tabelaUsuarios th[data-sort]').forEach(th => {
        th.addEventListener('click', function() {
            const field = this.getAttribute('data-sort');
            sortUsuarios(field);
        });
    });
    
    document.querySelectorAll('#tabelaDoacoes th[data-sort]').forEach(th => {
        th.addEventListener('click', function() {
            const field = this.getAttribute('data-sort');
            sortDoacoes(field);
        });
    });
    
    document.getElementById('prevPage').addEventListener('click', function() {
        if (currentPage > 1) {
            currentPage--;
            renderUsuariosTable();
        }
    });
    
    document.getElementById('nextPage').addEventListener('click', function() {
        const totalPages = Math.ceil(filteredUsuarios.length / itemsPerPage);
        if (currentPage < totalPages) {
            currentPage++;
            renderUsuariosTable();
        }
    });
    
    document.getElementById('prevPageDoacoes').addEventListener('click', function() {
        if (currentPageDoacoes > 1) {
            currentPageDoacoes--;
            renderDoacoesTable();
        }
    });
    
    document.getElementById('nextPageDoacoes').addEventListener('click', function() {
        const totalPages = Math.ceil(filteredDoacoes.length / itemsPerPage);
        if (currentPageDoacoes < totalPages) {
            currentPageDoacoes++;
            renderDoacoesTable();
        }
    });
    
    document.getElementById('exportUsuarios').addEventListener('click', exportUsuarios);
    document.getElementById('exportDoacoes').addEventListener('click', exportDoacoes);
    document.getElementById('gerarRelatorio').addEventListener('click', gerarRelatorioCompleto);
    
    document.querySelector('.close-modal').addEventListener('click', closeModal);
    document.getElementById('userModal').addEventListener('click', function(e) {
        if (e.target === this) {
            closeModal();
        }
    });
}

function showSection(section) {

    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
    });
    document.querySelector(`.nav-link[data-section="${section}"]`).parentElement.classList.add('active');
    
    document.querySelectorAll('.content-section').forEach(sectionEl => {
        sectionEl.classList.remove('active');
    });
    document.getElementById(`${section}-section`).classList.add('active');
    
    const titles = {
        'usuarios': 'Usuários',
        'doacoes': 'Doações',
        'relatorios': 'Relatórios',
        'contatos': 'Contatos'
    };
    
    const subtitles = {
        'usuarios': 'Gerencie os usuários do sistema',
        'doacoes': 'Visualize todas as doações realizadas',
        'relatorios': 'Acompanhe estatísticas e métricas',
        'contatos': 'Mensagens recebidas do formulário de contato'
    };
    
    document.getElementById('pageTitle').textContent = titles[section];
    document.getElementById('pageSubtitle').textContent = subtitles[section];
    
    if (section === 'relatorios') {
        loadChartsData();
    }
}

function logout() {
    localStorage.removeItem('adminToken');
    localStorage.removeItem('adminUsuario');
    window.location.href = 'admin-login.html';
}

async function loadDashboardStats() {
    try {
        const token = localStorage.getItem('adminToken');
        const response = await fetch('/api/admin/stats', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (!response.ok) {
            throw new Error('Erro ao carregar estatísticas');
        }
        
        const data = await response.json();
        document.getElementById('totalUsuarios').textContent = data.totalUsuarios || 0;
        document.getElementById('totalDoacoes').textContent = data.totalDoacoes || 0;
        document.getElementById('valorTotal').textContent = formatCurrency(data.valorTotal || 0);
        
    } catch (error) {
        console.error('Erro ao carregar estatísticas:', error);
        document.getElementById('totalUsuarios').textContent = '0';
        document.getElementById('totalDoacoes').textContent = '0';
        document.getElementById('valorTotal').textContent = 'R$ 0';
    }
}

async function loadUsuarios() {
    try {
        const token = localStorage.getItem('adminToken');
        const response = await fetch('/api/admin/usuarios', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (!response.ok) {
            throw new Error('Erro ao carregar usuários');
        }
        
        const data = await response.json();
        usuariosData = data;
        filteredUsuarios = [...usuariosData];
        renderUsuariosTable();
        
    } catch (error) {
        console.error('Erro ao carregar usuários:', error);
        document.getElementById('usuariosTbody').innerHTML = 
            '<tr><td colspan="7" class="loading-text">Erro ao carregar usuários</td></tr>';
    }
}

function filterUsuarios() {
    const searchTerm = document.getElementById('searchUsuarios').value.toLowerCase();
    const statusFilter = document.getElementById('filterStatus').value;
    const dataFilter = document.getElementById('filterData').value;
    
    filteredUsuarios = usuariosData.filter(usuario => {

        const matchesSearch = 
            (usuario.nome && usuario.nome.toLowerCase().includes(searchTerm)) ||
            (usuario.email && usuario.email.toLowerCase().includes(searchTerm));
        
        const matchesStatus = !statusFilter || usuario.status === statusFilter;
        
        let matchesDate = true;
        if (dataFilter && usuario.data_cadastro) {
            const dataCadastro = new Date(usuario.data_cadastro);
            const hoje = new Date();
            const diasAtras = new Date();
            diasAtras.setDate(hoje.getDate() - parseInt(dataFilter));
            
            matchesDate = dataCadastro >= diasAtras;
        }
        
        return matchesSearch && matchesStatus && matchesDate;
    });
    
    currentPage = 1;
    renderUsuariosTable();
}

function sortUsuarios(field) {
    if (currentSort.field === field) {
        currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
    } else {
        currentSort.field = field;
        currentSort.direction = 'asc';
    }
    
    document.querySelectorAll('#tabelaUsuarios th i').forEach(icon => {
        icon.className = 'fas fa-sort';
    });
    
    const currentTh = document.querySelector(`#tabelaUsuarios th[data-sort="${field}"]`);
    if (currentTh) {
        const icon = currentTh.querySelector('i');
        if (icon) {
            icon.className = currentSort.direction === 'asc' ? 'fas fa-sort-up' : 'fas fa-sort-down';
        }
    }
    
    filteredUsuarios.sort((a, b) => {
        let aValue = a[field];
        let bValue = b[field];
        
        if (aValue === null || aValue === undefined) aValue = '';
        if (bValue === null || bValue === undefined) bValue = '';

        if (field.includes('data') || field.includes('acesso')) {
            aValue = new Date(aValue);
            bValue = new Date(bValue);
        }
        
        if (field.includes('total') || field.includes('quantidade')) {
            aValue = parseFloat(aValue) || 0;
            bValue = parseFloat(bValue) || 0;
        }
        
        if (aValue < bValue) return currentSort.direction === 'asc' ? -1 : 1;
        if (aValue > bValue) return currentSort.direction === 'asc' ? 1 : -1;
        return 0;
    });
    
    renderUsuariosTable();
}

function renderUsuariosTable() {
    const tbody = document.getElementById('usuariosTbody');
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const usuariosPagina = filteredUsuarios.slice(startIndex, endIndex);
    
    if (usuariosPagina.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="loading-text">Nenhum usuário encontrado</td></tr>';
        updatePaginationUsuarios();
        return;
    }
    
    let html = '';
    usuariosPagina.forEach(usuario => {
        html += `
            <tr>
                <td>${usuario.nome || 'N/A'}</td>
                <td>${usuario.email || 'N/A'}</td>
                <td>${formatCurrency(usuario.total_doacoes || 0)}</td>
                <td>${usuario.quantidade_doacoes || 0}</td>
                <td>${formatDate(usuario.ultimo_acesso)}</td>
                <td>${formatDate(usuario.data_cadastro)}</td>
                <td>
                    <button class="btn btn-primary btn-sm" onclick="showUserDetails(${usuario.id})">
                        <i class="fas fa-eye"></i> Detalhes
                    </button>
                </td>
            </tr>
        `;
    });
    
    tbody.innerHTML = html;
    updatePaginationUsuarios();
}

function updatePaginationUsuarios() {
    const totalPages = Math.ceil(filteredUsuarios.length / itemsPerPage);
    document.getElementById('pageInfo').textContent = `Página ${currentPage} de ${totalPages}`;
    
    document.getElementById('prevPage').disabled = currentPage === 1;
    document.getElementById('nextPage').disabled = currentPage === totalPages || totalPages === 0;
}

async function loadDoacoes() {
    try {
        const token = localStorage.getItem('adminToken');
        const response = await fetch('/api/admin/doacoes', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (!response.ok) {
            throw new Error('Erro ao carregar doações');
        }
        
        const data = await response.json();
        doacoesData = data;
        filteredDoacoes = [...doacoesData];
        renderDoacoesTable();
        
    } catch (error) {
        console.error('Erro ao carregar doações:', error);
        document.getElementById('doacoesTbody').innerHTML = 
            '<tr><td colspan="8" class="loading-text">Erro ao carregar doações</td></tr>';
    }
}

function filterDoacoes() {
    const searchTerm = document.getElementById('searchDoacoes').value.toLowerCase();
    const tipoFilter = document.getElementById('filterTipoDoacao').value;
    const dataFilter = document.getElementById('filterDataDoacao').value;
    
    filteredDoacoes = doacoesData.filter(doacao => {

        const matchesSearch = 
            (doacao.usuario && doacao.usuario.toLowerCase().includes(searchTerm)) ||
            (doacao.tipo_doacao && doacao.tipo_doacao.toLowerCase().includes(searchTerm)) ||
            (doacao.local_nome && doacao.local_nome.toLowerCase().includes(searchTerm));
        
        const matchesTipo = !tipoFilter || doacao.tipo_doacao === tipoFilter;
        
        let matchesDate = true;
        if (dataFilter && doacao.data_doacao) {
            const dataDoacao = new Date(doacao.data_doacao).toISOString().split('T')[0];
            matchesDate = dataDoacao === dataFilter;
        }
        
        return matchesSearch && matchesTipo && matchesDate;
    });
    
    currentPageDoacoes = 1;
    renderDoacoesTable();
}

function sortDoacoes(field) {
    if (currentSortDoacoes.field === field) {
        currentSortDoacoes.direction = currentSortDoacoes.direction === 'asc' ? 'desc' : 'asc';
    } else {
        currentSortDoacoes.field = field;
        currentSortDoacoes.direction = 'asc';
    }
    
    document.querySelectorAll('#tabelaDoacoes th i').forEach(icon => {
        icon.className = 'fas fa-sort';
    });
    
    const currentTh = document.querySelector(`#tabelaDoacoes th[data-sort="${field}"]`);
    if (currentTh) {
        const icon = currentTh.querySelector('i');
        if (icon) {
            icon.className = currentSortDoacoes.direction === 'asc' ? 'fas fa-sort-up' : 'fas fa-sort-down';
        }
    }
    
    filteredDoacoes.sort((a, b) => {
        let aValue = a[field];
        let bValue = b[field];
        
        if (aValue === null || aValue === undefined) aValue = '';
        if (bValue === null || bValue === undefined) bValue = '';
        
        if (field.includes('data')) {
            aValue = new Date(aValue);
            bValue = new Date(bValue);
        }
        
        if (field.includes('quantidade') || field === 'valor_estoque') {
            aValue = parseFloat(aValue) || 0;
            bValue = parseFloat(bValue) || 0;
        }
        
        if (aValue < bValue) return currentSortDoacoes.direction === 'asc' ? -1 : 1;
        if (aValue > bValue) return currentSortDoacoes.direction === 'asc' ? 1 : -1;
        return 0;
    });
    
    renderDoacoesTable();
}

function renderDoacoesTable() {
    const tbody = document.getElementById('doacoesTbody');
    const startIndex = (currentPageDoacoes - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const doacoesPagina = filteredDoacoes.slice(startIndex, endIndex);
    
    if (doacoesPagina.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="loading-text">Nenhuma doação encontrada</td></tr>';
        updatePaginationDoacoes();
        return;
    }
    
    let html = '';
    doacoesPagina.forEach(doacao => {
        html += `
            <tr>
                <td>${doacao.usuario || 'N/A'}</td>
                <td>${doacao.tipo_doacao || 'N/A'}</td>
                <td>${doacao.quantidade || 0}</td>
                <td>${doacao.unidade_medida || 'N/A'}</td>
                <td>${doacao.local_nome || 'N/A'}</td>
                <td>${formatDate(doacao.data_doacao)}</td>
                <td>
                    <span class="status-badge status-${doacao.status || 'pendente'}">${doacao.status || 'pendente'}</span>
                </td>
                <td>
                    <button class="btn btn-success btn-sm" onclick="confirmarDoacao(${doacao.id}, '${doacao.tipo_doacao || ''}', '${doacao.quantidade || 0}')">
                        <i class="fas fa-check"></i> Confirmar
                    </button>
                </td>
            </tr>
        `;
    });
    
    tbody.innerHTML = html;
    updatePaginationDoacoes();
}

function updatePaginationDoacoes() {
    const totalPages = Math.ceil(filteredDoacoes.length / itemsPerPage);
    document.getElementById('pageInfoDoacoes').textContent = `Página ${currentPageDoacoes} de ${totalPages}`;
    
    document.getElementById('prevPageDoacoes').disabled = currentPageDoacoes === 1;
    document.getElementById('nextPageDoacoes').disabled = currentPageDoacoes === totalPages || totalPages === 0;
}

async function loadContatos() {
    try {
        const token = localStorage.getItem('adminToken');
        const response = await fetch('/api/admin/contatos', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (!response.ok) {
            throw new Error('Erro ao carregar contatos');
        }
        
        const data = await response.json();
        renderContatosTable(data);
        
    } catch (error) {
        console.error('Erro ao carregar contatos:', error);
        document.getElementById('contatosTbody').innerHTML = 
            '<tr><td colspan="7" class="loading-text">Erro ao carregar mensagens</td></tr>';
    }
}

function renderContatosTable(contatos) {
    const tbody = document.getElementById('contatosTbody');
    
    if (contatos.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="loading-text">Nenhuma mensagem encontrada</td></tr>';
        return;
    }
    
    let html = '';
    contatos.forEach(contato => {
        const mensagemResumida = contato.mensagem && contato.mensagem.length > 50 ? 
            contato.mensagem.substring(0, 50) + '...' : (contato.mensagem || 'N/A');
            
        html += `
            <tr>
                <td>${contato.nome || 'N/A'}</td>
                <td>${contato.email || 'N/A'}</td>
                <td>${contato.assunto || 'N/A'}</td>
                <td title="${contato.mensagem || ''}">${mensagemResumida}</td>
                <td>${formatDate(contato.data_envio)}</td>
                <td>
                    <span class="status-badge status-${contato.status || 'pendente'}">${contato.status || 'pendente'}</span>
                </td>
                <td>
                    <button class="btn btn-primary btn-sm" onclick="marcarComoRespondido(${contato.id})">
                        <i class="fas fa-check"></i> Respondido
                    </button>
                </td>
            </tr>
        `;
    });
    
    tbody.innerHTML = html;
}

function setupCharts() {

    const ctxDoacoesMes = document.getElementById('chartDoacoesMes');
    const ctxTiposDoacao = document.getElementById('chartTiposDoacao');
    const ctxNovosUsuarios = document.getElementById('chartNovosUsuarios');
    const ctxLocaisAtivos = document.getElementById('chartLocaisAtivos');
    
    if (ctxDoacoesMes) {
        window.chartDoacoesMes = new Chart(ctxDoacoesMes, {
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    label: 'Doações por Mês',
                    data: [],
                    borderColor: '#4a6cf7',
                    backgroundColor: 'rgba(74, 108, 247, 0.1)',
                    tension: 0.4,
                    fill: true
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false
            }
        });
    }
    
    if (ctxTiposDoacao) {
        window.chartTiposDoacao = new Chart(ctxTiposDoacao, {
            type: 'doughnut',
            data: {
                labels: [],
                datasets: [{
                    data: [],
                    backgroundColor: [
                        '#4a6cf7', '#ffce3e', '#48bb78', '#ecc94b', '#f56565', '#6e8efb'
                    ]
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false
            }
        });
    }
    
    if (ctxNovosUsuarios) {
        window.chartNovosUsuarios = new Chart(ctxNovosUsuarios, {
            type: 'bar',
            data: {
                labels: [],
                datasets: [{
                    label: 'Novos Usuários',
                    data: [],
                    backgroundColor: '#4a6cf7'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false
            }
        });
    }
    
    if (ctxLocaisAtivos) {
        window.chartLocaisAtivos = new Chart(ctxLocaisAtivos, {
            type: 'bar',
            data: {
                labels: [],
                datasets: [{
                    label: 'Doações por Local',
                    data: [],
                    backgroundColor: '#4a6cf7'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                indexAxis: 'y'
            }
        });
    }
}

async function loadChartsData() {
    try {
        const token = localStorage.getItem('adminToken');
        const response = await fetch('/api/admin/charts', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (!response.ok) {
            throw new Error('Erro ao carregar dados dos gráficos');
        }
        
        const data = await response.json();
        
        if (window.chartDoacoesMes && data.doacoesPorMes) {
            window.chartDoacoesMes.data.labels = data.doacoesPorMes.labels;
            window.chartDoacoesMes.data.datasets[0].data = data.doacoesPorMes.valores;
            window.chartDoacoesMes.update();
        }
        
        if (window.chartTiposDoacao && data.tiposDoacao) {
            window.chartTiposDoacao.data.labels = data.tiposDoacao.labels;
            window.chartTiposDoacao.data.datasets[0].data = data.tiposDoacao.valores;
            window.chartTiposDoacao.update();
        }
        
        if (window.chartNovosUsuarios && data.novosUsuarios) {
            window.chartNovosUsuarios.data.labels = data.novosUsuarios.labels;
            window.chartNovosUsuarios.data.datasets[0].data = data.novosUsuarios.valores;
            window.chartNovosUsuarios.update();
        }
        
        if (window.chartLocaisAtivos && data.locaisAtivos) {
            window.chartLocaisAtivos.data.labels = data.locaisAtivos.labels;
            window.chartLocaisAtivos.data.datasets[0].data = data.locaisAtivos.valores;
            window.chartLocaisAtivos.update();
        }
        
    } catch (error) {
        console.error('Erro ao carregar dados dos gráficos:', error);
    }
}

async function showUserDetails(userId) {
    try {
        const token = localStorage.getItem('adminToken');
        const response = await fetch(`/api/admin/usuarios/${userId}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (!response.ok) {
            throw new Error('Erro ao carregar detalhes do usuário');
        }
        
        const usuario = await response.json();
        renderUserModal(usuario);
        
    } catch (error) {
        console.error('Erro ao carregar detalhes do usuário:', error);
        alert('Erro ao carregar detalhes do usuário');
    }
}

function renderUserModal(usuario) {
    const modalBody = document.getElementById('userModalBody');
    
    let html = `
        <div class="user-details" style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
            <div class="detail-card" style="background: #f8f9fa; padding: 20px; border-radius: 8px;">
                <h3 style="margin-bottom: 15px; color: #4a6cf7;">Informações Pessoais</h3>
                <div class="detail-item" style="margin-bottom: 10px;">
                    <span class="detail-label" style="font-weight: bold;">Nome:</span>
                    <span class="detail-value">${usuario.nome_completo || 'N/A'}</span>
                </div>
                <div class="detail-item" style="margin-bottom: 10px;">
                    <span class="detail-label" style="font-weight: bold;">Email:</span>
                    <span class="detail-value">${usuario.email || 'N/A'}</span>
                </div>
                <div class="detail-item" style="margin-bottom: 10px;">
                    <span class="detail-label" style="font-weight: bold;">Usuário:</span>
                    <span class="detail-value">${usuario.usuario || 'N/A'}</span>
                </div>
                <div class="detail-item" style="margin-bottom: 10px;">
                    <span class="detail-label" style="font-weight: bold;">Data de Cadastro:</span>
                    <span class="detail-value">${formatDate(usuario.data_criacao)}</span>
                </div>
                <div class="detail-item" style="margin-bottom: 10px;">
                    <span class="detail-label" style="font-weight: bold;">Último Login:</span>
                    <span class="detail-value">${formatDate(usuario.ultimo_login)}</span>
                </div>
                <div class="detail-item" style="margin-bottom: 10px;">
                    <span class="detail-label" style="font-weight: bold;">Status:</span>
                    <span class="detail-value">
                        <span class="status-badge status-${usuario.ativo ? 'ativo' : 'inativo'}">${usuario.ativo ? 'Ativo' : 'Inativo'}</span>
                    </span>
                </div>
            </div>
            
            <div class="detail-card" style="background: #f8f9fa; padding: 20px; border-radius: 8px;">
                <h3 style="margin-bottom: 15px; color: #4a6cf7;">Estatísticas de Doações</h3>
                <div class="detail-item" style="margin-bottom: 10px;">
                    <span class="detail-label" style="font-weight: bold;">Total de Doações:</span>
                    <span class="detail-value">${formatCurrency(usuario.total_doacoes || 0)}</span>
                </div>
                <div class="detail-item" style="margin-bottom: 10px;">
                    <span class="detail-label" style="font-weight: bold;">Quantidade de Doações:</span>
                    <span class="detail-value">${usuario.quantidade_doacoes || 0}</span>
                </div>
                <div class="detail-item" style="margin-bottom: 10px;">
                    <span class="detail-label" style="font-weight: bold;">Última Doação:</span>
                    <span class="detail-value">${usuario.ultima_doacao ? formatDate(usuario.ultima_doacao) : 'Nenhuma'}</span>
                </div>
            </div>
        </div>
    `;
    
    if (usuario.doacoes && usuario.doacoes.length > 0) {
        html += `
            <div class="detail-card" style="grid-column: 1 / -1; background: #f8f9fa; padding: 20px; border-radius: 8px; margin-top: 20px;">
                <h3 style="margin-bottom: 15px; color: #4a6cf7;">Histórico de Doações</h3>
                <div class="table-container" style="overflow-x: auto;">
                    <table style="width: 100%; border-collapse: collapse;">
                        <thead>
                            <tr style="background: #4a6cf7; color: white;">
                                <th style="padding: 10px; text-align: left;">Data</th>
                                <th style="padding: 10px; text-align: left;">Tipo</th>
                                <th style="padding: 10px; text-align: left;">Quantidade</th>
                                <th style="padding: 10px; text-align: left;">Local</th>
                                <th style="padding: 10px; text-align: left;">Valor Estoque</th>
                                <th style="padding: 10px; text-align: left;">Status</th>
                                <th style="padding: 10px; text-align: left;">Ações</th>
                            </tr>
                        </thead>
                        <tbody>
        `;
        
        usuario.doacoes.forEach(doacao => {
            html += `
                <tr style="border-bottom: 1px solid #ddd;">
                    <td style="padding: 10px;">${formatDate(doacao.data_doacao)}</td>
                    <td style="padding: 10px;">${doacao.tipo_doacao || 'N/A'}</td>
                    <td style="padding: 10px;">${doacao.quantidade || 0} ${doacao.unidade_medida || ''}</td>
                    <td style="padding: 10px;">${doacao.local_nome || 'N/A'}</td>
                    <td style="padding: 10px;">${formatCurrency(doacao.valor_estoque || 0)}</td>
                    <td style="padding: 10px;">
                        <span class="status-badge status-${doacao.status || 'pendente'}">${doacao.status || 'pendente'}</span>
                    </td>
                    <td style="padding: 10px;">
                        <button class="btn btn-success btn-sm" onclick="confirmarDoacao(${doacao.id}, '${doacao.tipo_doacao || ''}', '${doacao.quantidade || 0}'); closeModal();">
                            <i class="fas fa-check"></i> Confirmar
                        </button>
                    </td>
                </tr>
            `;
        });
        
        html += `
                        </tbody>
                    </table>
                </div>
                <div style="margin-top: 15px; text-align: center;">
                    <button class="btn btn-secondary" onclick="exportUserHistory(${usuario.id})" style="background: #6c757d; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer;">
                        <i class="fas fa-download"></i> Exportar Histórico
                    </button>
                </div>
            </div>
        `;
    } else {
        html += `
            <div class="detail-card" style="grid-column: 1 / -1; background: #f8f9fa; padding: 20px; border-radius: 8px; margin-top: 20px; text-align: center;">
                <h3 style="margin-bottom: 15px; color: #4a6cf7;">Histórico de Doações</h3>
                <p>Nenhuma doação registrada para este usuário.</p>
            </div>
        `;
    }

    modalBody.innerHTML = html;
    openModal();
}

function openModal() {
    document.getElementById('userModal').style.display = 'block';
}

function closeModal() {
    document.getElementById('userModal').style.display = 'none';
}

async function marcarComoRespondido(contatoId) {
    if (!confirm('Tem certeza que deseja marcar esta mensagem como respondida?')) {
        return;
    }
    
    try {
        const token = localStorage.getItem('adminToken');
        const response = await fetch(`/api/admin/contatos/${contatoId}/responder`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) {
            throw new Error('Erro ao marcar contato como respondido');
        }
        
        alert('Mensagem marcada como respondida com sucesso!');
        loadContatos(); // Recarregar contatos
        
    } catch (error) {
        console.error('Erro ao marcar contato como respondido:', error);
        alert('Erro ao marcar mensagem como respondida');
    }
}
async function confirmarDoacao(doacaoId, tipoDoacao, quantidade) {
    if (!confirm(`Tem certeza que deseja confirmar e remover esta doação?\n\nTipo: ${tipoDoacao}\nQuantidade: ${quantidade}\n\nEsta ação não pode ser desfeita.`)) {
        return;
    }
    
    try {
        const token = localStorage.getItem('adminToken');
        const response = await fetch(`/api/admin/doacoes/${doacaoId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (!response.ok) {
            throw new Error('Erro ao confirmar doação');
        }
        
        const result = await response.json();
        
        alert(`✅ ${result.message}`);
        
        loadDoacoes();
        
    } catch (error) {
        console.error('Erro ao confirmar doação:', error);
        alert('❌ Erro ao confirmar doação: ' + error.message);
    }
}

function exportUsuarios() {
    const data = filteredUsuarios.length > 0 ? filteredUsuarios : usuariosData;
    
    if (data.length === 0) {
        alert('Nenhum dado para exportar!');
        return;
    }
    
    const dadosExportacao = data.map(usuario => ({
        'Nome': usuario.nome || 'N/A',
        'Email': usuario.email || 'N/A',
        'Usuário': usuario.usuario || 'N/A',
        'Total de Doações (R$)': formatCurrency(usuario.total_doacoes || 0),
        'Quantidade de Doações': usuario.quantidade_doacoes || 0,
        'Último Acesso': formatDate(usuario.ultimo_acesso),
        'Data de Cadastro': formatDate(usuario.data_cadastro),
        'Status': usuario.status || 'N/A'
    }));
    
    const csv = convertToCSV(dadosExportacao);
    downloadCSV(csv, `usuarios_rotasol_${new Date().toISOString().split('T')[0]}.csv`);
    alert('Exportação de usuários concluída com sucesso!');
}

function exportDoacoes() {
    const data = filteredDoacoes.length > 0 ? filteredDoacoes : doacoesData;
    
    if (data.length === 0) {
        alert('Nenhum dado para exportar!');
        return;
    }
    
    const dadosExportacao = data.map(doacao => ({
        'Usuário': doacao.usuario || 'N/A',
        'Tipo de Doação': doacao.tipo_doacao || 'N/A',
        'Quantidade': doacao.quantidade || 0,
        'Unidade de Medida': doacao.unidade_medida || 'N/A',
        'Local': doacao.local_nome || 'N/A',
        'Data da Doação': formatDate(doacao.data_doacao),
        'Valor em Estoque': formatCurrency(doacao.valor_estoque || 0),
        'Status': doacao.status || 'pendente',
        'Observações': doacao.observacoes || ''
    }));
    
    const csv = convertToCSV(dadosExportacao);
    downloadCSV(csv, `doacoes_rotasol_${new Date().toISOString().split('T')[0]}.csv`);
    alert('Exportação de doações concluída com sucesso!');
}

async function exportUserHistory(userId) {
    try {
        const token = localStorage.getItem('adminToken');
        
        const response = await fetch(`/api/admin/usuarios/${userId}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (!response.ok) {
            throw new Error('Erro ao buscar dados do usuário');
        }
        
        const usuarioCompleto = await response.json();
        
        if (!usuarioCompleto.doacoes || usuarioCompleto.doacoes.length === 0) {
            alert('Nenhuma doação encontrada para este usuário!');
            return;
        }
        
        const dadosExportacao = usuarioCompleto.doacoes.map(doacao => ({
            'Data da Doação': formatDate(doacao.data_doacao),
            'Tipo de Doação': doacao.tipo_doacao || 'N/A',
            'Quantidade': doacao.quantidade || 0,
            'Unidade de Medida': doacao.unidade_medida || 'N/A',
            'Local de Entrega': doacao.local_nome || 'N/A',
            'Valor em Estoque': formatCurrency(doacao.valor_estoque || 0),
            'Status': doacao.status || 'pendente',
            'Observações': doacao.observacoes || ''
        }));
        
        const cabecalho = [
            [`Histórico de Doações - ${usuarioCompleto.nome_completo || usuarioCompleto.nome || 'Usuário'}`],
            [`Email: ${usuarioCompleto.email || 'N/A'}`],
            [`Usuário: ${usuarioCompleto.usuario || 'N/A'}`],
            [`Total de Doações: ${usuarioCompleto.quantidade_doacoes || 0}`],
            [`Valor Total: ${formatCurrency(usuarioCompleto.total_doacoes || 0)}`],
            [`Data de Geração: ${new Date().toLocaleString('pt-BR')}`],
            ['DETALHES DAS DOAÇÕES:'],
        ];
        
        const cabecalhoCSV = cabecalho.map(row => 
            row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')
        ).join('\n');
        
        const dadosCSV = convertToCSV(dadosExportacao);
        
        const csvCompleto = cabecalhoCSV + '\n' + dadosCSV;
        
        const nomeUsuario = (usuarioCompleto.usuario || usuarioCompleto.nome || 'usuario').replace(/[^a-zA-Z0-9]/g, '_');
        const filename = `historico_doacoes_${nomeUsuario}_${new Date().toISOString().split('T')[0]}.csv`;
        
        downloadCSV(csvCompleto, filename);
        alert('Histórico de doações exportado com sucesso!');
        
    } catch (error) {
        console.error('Erro ao exportar histórico:', error);
        alert('Erro ao exportar histórico do usuário: ' + error.message);
    }
}

function gerarRelatorioCompleto() {
    const relatorio = {
        dataGeracao: new Date().toLocaleString('pt-BR'),
        totalUsuarios: usuariosData.length,
        totalDoacoes: doacoesData.length,
        valorTotalDoacoes: doacoesData.reduce((sum, doacao) => sum + (parseFloat(doacao.valor_estoque) || 0), 0),
        resumoUsuarios: usuariosData.map(u => ({
            nome: u.nome,
            email: u.email,
            totalDoacoes: formatCurrency(u.total_doacoes || 0),
            quantidadeDoacoes: u.quantidade_doacoes || 0
        })),
        resumoDoacoes: doacoesData.map(d => ({
            usuario: d.usuario,
            tipo: d.tipo_doacao,
            quantidade: d.quantidade,
            data: formatDate(d.data_doacao)
        }))
    };

    const csvData = [
        ['RELATÓRIO COMPLETO - ROTASOL'],
        ['Data de geração:', relatorio.dataGeracao],
        [''],
        ['ESTATÍSTICAS GERAIS'],
        ['Total de Usuários:', relatorio.totalUsuarios],
        ['Total de Doações:', relatorio.totalDoacoes],
        ['Valor Total em Estoque:', formatCurrency(relatorio.valorTotalDoacoes)],
        [''],
        ['RESUMO DE USUÁRIOS'],
        ['Nome', 'Email', 'Total em Doações', 'Quantidade de Doações']
    ];
    
    relatorio.resumoUsuarios.forEach(usuario => {
        csvData.push([
            usuario.nome || 'N/A',
            usuario.email || 'N/A',
            usuario.totalDoacoes,
            usuario.quantidadeDoacoes
        ]);
    });
    
    csvData.push(['']);
    csvData.push(['RESUMO DE DOAÇÕES']);
    csvData.push(['Usuário', 'Tipo', 'Quantidade', 'Data']);
    
    relatorio.resumoDoacoes.forEach(doacao => {
        csvData.push([
            doacao.usuario || 'N/A',
            doacao.tipo || 'N/A',
            doacao.quantidade || 0,
            doacao.data
        ]);
    });
    
    const csv = csvData.map(row => 
        row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')
    ).join('\n');
    
    downloadCSV(csv, `relatorio_completo_rotasol_${new Date().toISOString().split('T')[0]}.csv`);
    alert('Relatório completo gerado com sucesso!');
}

function formatCurrency(value) {
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    }).format(value || 0);
}

function formatDate(dateString) {
    if (!dateString) return 'N/A';
    
    try {
        const date = new Date(dateString);
        return date.toLocaleDateString('pt-BR');
    } catch (error) {
        return dateString;
    }
}

function convertToCSV(data) {
    if (data.length === 0) return '';
    
    const headers = Object.keys(data[0]);
    const csvRows = [
        headers.join(','),
        ...data.map(row => 
            headers.map(header => {
                const value = row[header] || '';
                return `"${String(value).replace(/"/g, '""')}"`;
            }).join(',')
        )
    ];
    
    return csvRows.join('\n');
}

function downloadCSV(csv, filename) {
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}