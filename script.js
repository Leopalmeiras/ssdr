(() => {
  const STORAGE_KEYS = {
    leads: 'crm_leads',
    origens: 'crm_origens',
  };

  const STATUS = ['Frio', 'Morno', 'Quente', 'Perdido'];
  const PRIORIDADES = ['Baixa', 'Média', 'Alta', 'Urgente'];
  const PAGE = document.body?.dataset?.page;

  document.addEventListener('DOMContentLoaded', init);

  function init() {
    seedData();

    if (PAGE === 'login') {
      if (isLoggedIn()) {
        window.location.href = './dashboard.html';
        return;
      }
      setupLogin();
      return;
    }

    protectInternalPages();
    renderSidebar();

    switch (PAGE) {
      case 'dashboard':
        setupDashboard();
        break;
      case 'cadastro':
        setupCadastro();
        break;
      case 'leads':
        setupLeads();
        break;
      case 'origens':
        setupOrigens();
        break;
      default:
        break;
    }
  }

  function setupLogin() {
    const form = document.getElementById('loginForm');
    const errorEl = document.getElementById('loginError');
    if (!form || !errorEl) return;

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      errorEl.textContent = '';

      const fd = new FormData(form);
      const username = String(fd.get('username') || '').trim().toLowerCase();
      const password = String(fd.get('password') || '').trim();

      const validUser = username === 'admin' || username === 'sdr';
      const validPassword = password === '123';

      if (!validUser || !validPassword) {
        errorEl.textContent = 'Usuário ou senha inválidos. Tente novamente.';
        return;
      }

      sessionStorage.setItem('crmLoggedIn', 'true');
      sessionStorage.setItem('crmUser', username);
      window.location.href = './dashboard.html';
    });
  }

  function protectInternalPages() {
    if (!isLoggedIn()) {
      window.location.href = './index.html';
    }
  }

  function isLoggedIn() {
    return sessionStorage.getItem('crmLoggedIn') === 'true';
  }

  function currentUser() {
    return sessionStorage.getItem('crmUser') || '';
  }

  function renderSidebar() {
    const sidebar = document.getElementById('sidebar');
    if (!sidebar) return;

    const user = currentUser();
    const isAdmin = user === 'admin';
    const links = [
      { href: './dashboard.html', label: 'Dashboard', page: 'dashboard' },
      { href: './leads.html', label: 'Leads', page: 'leads' },
      { href: './cadastro.html', label: 'Cadastrar Lead', page: 'cadastro' },
      { href: './origens.html', label: 'Origens', page: 'origens' },
    ];

    sidebar.innerHTML = `
      <div class="brand">CRM SDR</div>
      <div class="user-info">
        <strong>${escapeHtml(user || 'usuário')}</strong>
        <p>${isAdmin ? 'Administrador' : 'SDR'}</p>
      </div>
      <nav>
        ${links
          .map((link) => `<a class="nav-link ${link.page === PAGE ? 'active' : ''}" href="${link.href}">${link.label}</a>`)
          .join('')}
      </nav>
      <button id="logoutBtn" class="btn-secondary" type="button">Sair</button>
    `;

    const logoutBtn = document.getElementById('logoutBtn');
    if (!logoutBtn) return;

    logoutBtn.addEventListener('click', () => {
      sessionStorage.removeItem('crmLoggedIn');
      sessionStorage.removeItem('crmUser');
      window.location.href = './index.html';
    });
  }

  function setupDashboard() {
    const leads = getLeads();
    const kpiGrid = document.getElementById('kpiGrid');

    const total = leads.length;
    const quentes = leads.filter((lead) => lead.status === 'Quente').length;
    const pendentes = leads.flatMap((lead) => lead.tarefas || []).filter((t) => t.status === 'Pendente').length;
    const alta = leads.filter((lead) => lead.prioridade === 'Alta' || lead.prioridade === 'Urgente').length;

    if (kpiGrid) {
      kpiGrid.innerHTML = [
        ['Total de leads', total],
        ['Leads quentes', quentes],
        ['Tarefas pendentes', pendentes],
        ['Prioridade alta/urgente', alta],
      ]
        .map(([label, valor]) => `<article class="kpi"><p>${label}</p><strong>${valor}</strong></article>`)
        .join('');
    }

    renderBarChart('statusChart', countBy(leads, 'status', STATUS));
    renderBarChart('origemChart', countBy(leads, 'origem'));
    renderHotLeads(leads);
  }

  function renderHotLeads(leads) {
    const container = document.getElementById('hotLeadsList');
    if (!container) return;

    const hot = leads
      .filter((lead) => lead.status === 'Quente' && lead.vendedor?.agendamento)
      .sort((a, b) => new Date(a.vendedor.agendamento) - new Date(b.vendedor.agendamento));

    if (!hot.length) {
      container.innerHTML = '<p>Nenhum lead quente com agendamento.</p>';
      return;
    }

    container.innerHTML = hot
      .map(
        (lead) => `
          <div class="stats-item">
            <strong>${escapeHtml(lead.nome)}</strong>
            <p>${escapeHtml(lead.vendedor.nome)} • ${formatDateTimeBR(lead.vendedor.agendamento)}</p>
            <small>${escapeHtml(lead.vendedor.proximoStatus)}</small>
          </div>
        `,
      )
      .join('');
  }

  function setupCadastro() {
    const form = document.getElementById('leadForm');
    const errorEl = document.getElementById('formError');
    const origemSelect = document.getElementById('origem');
    const prioridadeSelect = document.getElementById('prioridade');
    const statusSelect = document.getElementById('status');
    const hotBox = document.getElementById('hotBox');
    const cnpjInput = document.getElementById('cnpj');

    if (!form || !errorEl || !origemSelect || !prioridadeSelect || !statusSelect || !hotBox || !cnpjInput) return;

    populateOrigens(origemSelect);
    populateSelect(prioridadeSelect, PRIORIDADES, 'Selecione...');

    cnpjInput.addEventListener('input', () => {
      cnpjInput.value = maskCnpj(cnpjInput.value);
    });

    statusSelect.addEventListener('change', () => {
      hotBox.classList.toggle('hidden', statusSelect.value !== 'Quente');
    });

    const timelineDraft = [];
    const tarefasDraft = [];

    const addInteractionBtn = document.getElementById('addInteraction');
    const interacaoInput = document.getElementById('interacaoTexto');
    const addTaskBtn = document.getElementById('addTask');
    const taskTitulo = document.getElementById('taskTitulo');
    const taskData = document.getElementById('taskData');
    const taskStatus = document.getElementById('taskStatus');

    if (addInteractionBtn && interacaoInput) {
      addInteractionBtn.addEventListener('click', () => {
        const descricao = String(interacaoInput.value || '').trim();
        if (!descricao) return;

        timelineDraft.push({ id: uid(), descricao, autor: currentUser(), data: new Date().toISOString() });
        interacaoInput.value = '';
        renderTimeline(timelineDraft);
      });
    }

    if (addTaskBtn && taskTitulo && taskData && taskStatus) {
      addTaskBtn.addEventListener('click', () => {
        const titulo = String(taskTitulo.value || '').trim();
        const data = String(taskData.value || '').trim();
        const status = String(taskStatus.value || '').trim();
        if (!titulo || !data) return;

        tarefasDraft.push({ id: uid(), titulo, data, status, criadoEm: new Date().toISOString() });
        taskTitulo.value = '';
        taskData.value = '';
        taskStatus.value = 'Pendente';
        renderTasks(tarefasDraft);
      });
    }

    const params = new URLSearchParams(window.location.search);
    const editId = params.get('id');
    if (editId) {
      const lead = getLeads().find((item) => item.id === editId);
      if (lead) fillLeadForm(lead, timelineDraft, tarefasDraft);
    }

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      errorEl.textContent = '';

      const fd = new FormData(form);
      const status = String(fd.get('status') || '').trim();
      const now = new Date();

      const payload = {
        id: String(fd.get('leadId') || '').trim() || uid(),
        nome: String(fd.get('nome') || '').trim(),
        email: String(fd.get('email') || '').trim(),
        cnpj: maskCnpj(String(fd.get('cnpj') || '').trim()),
        origem: String(fd.get('origem') || '').trim(),
        status,
        prioridade: String(fd.get('prioridade') || '').trim(),
        tags: String(fd.get('tags') || '')
          .split(',')
          .map((tag) => tag.trim())
          .filter(Boolean),
        observacao: String(fd.get('observacao') || '').trim(),
        vendedor:
          status === 'Quente'
            ? {
                nome: String(fd.get('vendedorNome') || '').trim(),
                agendamento: String(fd.get('vendedorData') || '').trim(),
                proximoStatus: String(fd.get('proximoStatus') || '').trim(),
              }
            : null,
        timeline: timelineDraft,
        tarefas: tarefasDraft,
        atualizadoEm: now.toISOString(),
        createdAtISO: now.toISOString(),
        createdAtFormatted: formatDateTimeBR(now),
      };

      const error = validateLead(payload);
      if (error) {
        errorEl.textContent = error;
        return;
      }

      const leads = getLeads();
      const idx = leads.findIndex((lead) => lead.id === payload.id);
      if (idx >= 0) {
        payload.createdAtISO = leads[idx].createdAtISO || payload.createdAtISO;
        payload.createdAtFormatted = leads[idx].createdAtFormatted || formatDateTimeBR(payload.createdAtISO);
        leads[idx] = payload;
      } else {
        leads.push(payload);
      }

      saveLeads(leads);
      window.location.href = './leads.html';
    });

    function fillLeadForm(lead, timelineList, tarefasList) {
      const formTitle = document.getElementById('formTitle');
      if (formTitle) formTitle.textContent = 'Editar Lead';

      form.elements.namedItem('leadId').value = lead.id;
      form.elements.namedItem('nome').value = lead.nome || '';
      form.elements.namedItem('email').value = lead.email || '';
      form.elements.namedItem('cnpj').value = lead.cnpj || '';
      form.elements.namedItem('origem').value = lead.origem || '';
      form.elements.namedItem('status').value = lead.status || '';
      form.elements.namedItem('prioridade').value = lead.prioridade || '';
      form.elements.namedItem('tags').value = (lead.tags || []).join(', ');
      form.elements.namedItem('observacao').value = lead.observacao || '';

      if (lead.status === 'Quente') {
        hotBox.classList.remove('hidden');
        form.elements.namedItem('vendedorNome').value = lead.vendedor?.nome || '';
        form.elements.namedItem('vendedorData').value = lead.vendedor?.agendamento || '';
        form.elements.namedItem('proximoStatus').value = lead.vendedor?.proximoStatus || '';
      }

      timelineList.push(...(lead.timeline || []));
      tarefasList.push(...(lead.tarefas || []));
      renderTimeline(timelineList);
      renderTasks(tarefasList);
    }

    function renderTimeline(items) {
      const list = document.getElementById('timelineList');
      if (!list) return;
      if (!items.length) return (list.innerHTML = '<li>Nenhuma interação registrada.</li>');

      list.innerHTML = items
        .slice()
        .reverse()
        .map((item) => `<li><strong>${escapeHtml(item.autor)}</strong> • ${formatDateTimeBR(item.data)}<br>${escapeHtml(item.descricao)}</li>`)
        .join('');
    }

    function renderTasks(items) {
      const list = document.getElementById('taskList');
      if (!list) return;
      if (!items.length) return (list.innerHTML = '<li>Nenhuma tarefa registrada.</li>');

      list.innerHTML = items
        .slice()
        .sort((a, b) => new Date(a.data) - new Date(b.data))
        .map((item) => `<li><strong>${escapeHtml(item.titulo)}</strong> • ${formatDateTimeBR(item.data)} • ${escapeHtml(item.status)}</li>`)
        .join('');
    }
  }

  function setupLeads() {
    const tbody = document.getElementById('leadsTbody');
    const searchInput = document.getElementById('searchInput');
    const statusFilter = document.getElementById('statusFilter');
    const origemFilter = document.getElementById('origemFilter');
    const prioridadeFilter = document.getElementById('prioridadeFilter');
    const exportCsvBtn = document.getElementById('exportCsvBtn');
    const exportPdfBtn = document.getElementById('exportPdfBtn');

    if (!tbody || !searchInput || !statusFilter || !origemFilter || !prioridadeFilter) return;

    populateSelect(statusFilter, STATUS, 'Todos os status');
    populateOrigens(origemFilter, 'Todas as origens');
    populateSelect(prioridadeFilter, PRIORIDADES, 'Todas as prioridades');

    const render = () => {
      const term = String(searchInput.value || '').toLowerCase().trim();
      const status = statusFilter.value;
      const origem = origemFilter.value;
      const prioridade = prioridadeFilter.value;

      const filtered = getLeads()
        .filter((lead) => (status ? lead.status === status : true))
        .filter((lead) => (origem ? lead.origem === origem : true))
        .filter((lead) => (prioridade ? lead.prioridade === prioridade : true))
        .filter((lead) => {
          if (!term) return true;
          const haystack = [lead.nome, lead.email, lead.cnpj, lead.observacao, (lead.tags || []).join(' '), lead.vendedor?.nome]
            .join(' ')
            .toLowerCase();
          return haystack.includes(term);
        })
        .sort((a, b) => new Date(b.atualizadoEm) - new Date(a.atualizadoEm));

      if (!filtered.length) {
        tbody.innerHTML = '<tr><td colspan="10">Nenhum lead encontrado.</td></tr>';
        return;
      }

      tbody.innerHTML = filtered
        .map(
          (lead) => `
            <tr>
              <td>${escapeHtml(lead.nome)}</td>
              <td>${escapeHtml(lead.email)}</td>
              <td>${escapeHtml(lead.origem)}</td>
              <td><span class="badge badge-${lead.status.toLowerCase()}">${escapeHtml(lead.status)}</span></td>
              <td>${escapeHtml(lead.prioridade)}</td>
              <td>${escapeHtml((lead.tags || []).join(', ') || '-')}</td>
              <td>${escapeHtml(lead.vendedor?.nome || '-')}</td>
              <td>${escapeHtml(lead.vendedor?.proximoStatus || '-')}</td>
              <td>${formatDateTimeBR(lead.atualizadoEm)}</td>
              <td>
                <div class="actions-row">
                  <a class="btn-secondary icon-btn" href="./cadastro.html?id=${lead.id}">Editar</a>
                  <button type="button" class="icon-btn delete" data-delete-id="${lead.id}">Excluir</button>
                </div>
              </td>
            </tr>
          `,
        )
        .join('');
    };

    searchInput.addEventListener('input', render);
    statusFilter.addEventListener('change', render);
    origemFilter.addEventListener('change', render);
    prioridadeFilter.addEventListener('change', render);

    tbody.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const id = target.dataset.deleteId;
      if (!id) return;
      if (!window.confirm('Deseja realmente excluir este lead?')) return;

      saveLeads(getLeads().filter((lead) => lead.id !== id));
      render();
    });

    if (exportCsvBtn) {
      exportCsvBtn.addEventListener('click', () => {
        const csv = buildCsv(getLeads());
        downloadFile('leads.csv', 'text/csv;charset=utf-8', csv);
      });
    }

    if (exportPdfBtn) {
      exportPdfBtn.addEventListener('click', () => {
        exportPdf(getLeads());
      });
    }

    render();
  }

  function setupOrigens() {
    const form = document.getElementById('origemForm');
    const nomeInput = document.getElementById('origemNome');
    const idInput = document.getElementById('origemId');
    const list = document.getElementById('origensList');
    const feedback = document.getElementById('origemError');

    if (!form || !nomeInput || !idInput || !list || !feedback) return;

    const setFeedback = (message, type = 'error') => {
      feedback.textContent = message;
      feedback.classList.remove('feedback-success', 'feedback-error');
      feedback.classList.add(type === 'success' ? 'feedback-success' : 'feedback-error');
    };

    const render = () => {
      const origens = getOrigens();
      if (!origens.length) {
        list.innerHTML = '<li>Nenhuma origem cadastrada.</li>';
        return;
      }

      list.innerHTML = origens
        .map(
          (origem) => `
            <li>
              <span>${escapeHtml(origem.nome)}</span>
              <div class="actions-row">
                <button type="button" class="btn-secondary icon-btn" data-edit-id="${origem.id}">Editar</button>
                <button type="button" class="icon-btn delete" data-delete-id="${origem.id}">Excluir</button>
              </div>
            </li>
          `,
        )
        .join('');
    };

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      setFeedback('');

      const nome = String(nomeInput.value || '').trim();
      const id = String(idInput.value || '').trim();
      if (!nome) return setFeedback('Informe o nome da origem.');

      const origens = getOrigens();
      const duplicate = origens.find((item) => item.nome.toLowerCase() === nome.toLowerCase() && item.id !== id);
      if (duplicate) return setFeedback('Já existe uma origem com esse nome.');

      if (id) {
        const idx = origens.findIndex((item) => item.id === id);
        if (idx >= 0) origens[idx].nome = nome;
        setFeedback('Origem atualizada com sucesso.', 'success');
      } else {
        origens.push({ id: uid(), nome });
        setFeedback('Origem cadastrada com sucesso.', 'success');
      }

      saveOrigens(origens);
      nomeInput.value = '';
      idInput.value = '';
      render();
    });

    list.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;

      const editId = target.dataset.editId;
      const deleteId = target.dataset.deleteId;
      const origens = getOrigens();

      if (editId) {
        const origem = origens.find((item) => item.id === editId);
        if (!origem) return;
        nomeInput.value = origem.nome;
        idInput.value = origem.id;
        setFeedback('Editando origem selecionada.', 'success');
        return;
      }

      if (deleteId) {
        const origem = origens.find((item) => item.id === deleteId);
        if (!origem) return;

        const inUse = getLeads().some((lead) => lead.origem === origem.nome);
        const message = inUse
          ? `A origem "${origem.nome}" já é usada em leads. Excluir mesmo assim?`
          : `Deseja excluir a origem "${origem.nome}"?`;

        if (!window.confirm(message)) return;

        saveOrigens(origens.filter((item) => item.id !== deleteId));
        setFeedback('Origem excluída com sucesso.', 'success');
        render();
      }
    });

    render();
  }

  function validateLead(lead) {
    if (!lead.nome || !lead.email || !lead.cnpj || !lead.origem || !lead.status || !lead.prioridade) {
      return 'Preencha todos os campos obrigatórios.';
    }
    if (!/^\S+@\S+\.\S+$/.test(lead.email)) return 'E-mail inválido.';
    if (!/^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$/.test(lead.cnpj)) return 'CNPJ inválido.';
    if (lead.status === 'Quente' && (!lead.vendedor?.nome || !lead.vendedor?.agendamento || !lead.vendedor?.proximoStatus)) {
      return 'Para lead quente, preencha os dados do vendedor e agendamento.';
    }
    return '';
  }

  function maskCnpj(value) {
    const digits = value.replace(/\D/g, '').slice(0, 14);
    return digits
      .replace(/^(\d{2})(\d)/, '$1.$2')
      .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
      .replace(/\.(\d{3})(\d)/, '.$1/$2')
      .replace(/(\d{4})(\d)/, '$1-$2');
  }

  function renderBarChart(id, data) {
    const container = document.getElementById(id);
    if (!container) return;

    const entries = Object.entries(data).filter(([, value]) => value > 0);
    if (!entries.length) return (container.innerHTML = '<p>Nenhum dado para exibir.</p>');

    const max = Math.max(...entries.map(([, value]) => value));
    container.innerHTML = entries
      .map(([label, value]) => {
        const width = Math.max(8, Math.round((value / max) * 100));
        return `<div class="bar-row"><span>${escapeHtml(label)}</span><div class="bar-track"><div class="bar-fill" style="width:${width}%"></div></div><strong>${value}</strong></div>`;
      })
      .join('');
  }

  function countBy(list, key, defaults = []) {
    const count = {};
    defaults.forEach((item) => (count[item] = 0));
    list.forEach((item) => {
      const value = item[key] || 'Sem valor';
      count[value] = (count[value] || 0) + 1;
    });
    return count;
  }

  function populateSelect(select, options, firstLabel) {
    select.innerHTML = `<option value="">${firstLabel}</option>`;
    options.forEach((option) => {
      select.insertAdjacentHTML('beforeend', `<option value="${escapeHtml(option)}">${escapeHtml(option)}</option>`);
    });
  }

  function populateOrigens(select, firstLabel = 'Selecione...') {
    const origens = getOrigens().map((item) => item.nome);
    populateSelect(select, origens, firstLabel);
  }

  function getLeads() {
    return read(STORAGE_KEYS.leads) || [];
  }

  function saveLeads(leads) {
    write(STORAGE_KEYS.leads, leads);
  }

  function getOrigens() {
    return read(STORAGE_KEYS.origens) || [];
  }

  function saveOrigens(origens) {
    write(STORAGE_KEYS.origens, origens);
  }

  function seedData() {
    if (!getOrigens().length) {
      saveOrigens([
        { id: uid(), nome: 'WhatsApp' },
        { id: uid(), nome: 'Ligação' },
        { id: uid(), nome: 'E-mail' },
      ]);
    }

    if (!read(STORAGE_KEYS.leads)) saveLeads([]);
  }

  function buildCsv(leads) {
    const headers = ['nome', 'email', 'cnpj', 'origem', 'status', 'prioridade', 'tags', 'vendedor', 'agendamento', 'proximo_passo', 'cadastrado_em', 'atualizado_em'];
    const rows = leads.map((lead) => [
      lead.nome,
      lead.email,
      lead.cnpj,
      lead.origem,
      lead.status,
      lead.prioridade,
      (lead.tags || []).join(', '),
      lead.vendedor?.nome || '',
      lead.vendedor?.agendamento || '',
      lead.vendedor?.proximoStatus || '',
      getCreatedAtFormatted(lead),
      formatDateTimeBR(lead.atualizadoEm),
    ]);
    return [headers.join(';'), ...rows.map((row) => row.map(csvEscape).join(';'))].join('\n');
  }

  function exportPdf(leads) {
    const popup = window.open('', '_blank');
    if (!popup) return;

    popup.document.write(`
      <html>
        <head>
          <title>Relatório de Leads</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 20px; }
            table { width: 100%; border-collapse: collapse; }
            th, td { border: 1px solid #ddd; padding: 8px; font-size: 12px; }
            th { background: #f1f5f9; }
          </style>
        </head>
        <body>
          <h2>Relatório de Leads - ${formatDateTimeBR(new Date())}</h2>
          <table>
            <thead>
              <tr>
                <th>Nome</th><th>Status</th><th>Prioridade</th><th>Origem</th><th>Vendedor</th><th>Próximo passo</th><th>Data cadastro</th><th>Hora cadastro</th>
              </tr>
            </thead>
            <tbody>
              ${leads
                .map((lead) => {
                  const { date, time } = splitCreatedAt(lead);
                  return `<tr>
                    <td>${escapeHtml(lead.nome)}</td>
                    <td>${escapeHtml(lead.status)}</td>
                    <td>${escapeHtml(lead.prioridade)}</td>
                    <td>${escapeHtml(lead.origem)}</td>
                    <td>${escapeHtml(lead.vendedor?.nome || '-')}</td>
                    <td>${escapeHtml(lead.vendedor?.proximoStatus || '-')}</td>
                    <td>${escapeHtml(date)}</td>
                    <td>${escapeHtml(time)}</td>
                  </tr>`;
                })
                .join('')}
            </tbody>
          </table>
        </body>
      </html>
    `);

    popup.document.close();
    popup.focus();
    popup.print();
  }

  function getCreatedAtFormatted(lead) {
    if (lead.createdAtFormatted) return lead.createdAtFormatted;
    if (lead.createdAtISO) return formatDateTimeBR(lead.createdAtISO);
    return 'Não informado';
  }

  function splitCreatedAt(lead) {
    const formatted = getCreatedAtFormatted(lead);
    if (formatted === 'Não informado') return { date: 'Não informado', time: 'Não informado' };
    const [date, time] = formatted.split(' ');
    return { date: date || 'Não informado', time: time || 'Não informado' };
  }

  function downloadFile(name, type, content) {
    const blob = new Blob([content], { type });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(link.href);
  }

  function formatDateTimeBR(value) {
    if (!value) return 'Não informado';
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return 'Não informado';

    const pad = (n) => String(n).padStart(2, '0');
    const day = pad(date.getDate());
    const month = pad(date.getMonth() + 1);
    const year = date.getFullYear();
    const hour = pad(date.getHours());
    const minute = pad(date.getMinutes());
    return `${day}/${month}/${year} ${hour}:${minute}`;
  }

  function read(key) {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch (error) {
      return null;
    }
  }

  function write(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function uid() {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function csvEscape(value) {
    return `"${String(value || '').replaceAll('"', '""')}"`;
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }
})();