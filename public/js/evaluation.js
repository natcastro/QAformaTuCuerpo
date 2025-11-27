    // --------- Data ---------
    const CALL = [
    { id: 'caller_name', label: 'Se menciona el nombre de la persona que llama', weight: 5, grade: 'yes' },
    { id: 'company_name', label: 'Se menciona el nombre de la empresa', weight: 5, grade: 'yes' },
    { id: 'acknowledge', label: 'Se reconoce y valida el problema (acknowledgement)', weight: 15, grade: 'yes' },
    { id: 'solution', label: 'Se ofrece una solución clara y viable', weight: 25, grade: 'yes' },
    { id: 'next_steps', label: 'Se explican los siguientes pasos', weight: 10, grade: 'yes' },
    { id: 'feedback_request', label: 'Se invita a dejar feedback (sin sesgo)', weight: 10, grade: 'yes' },
    { id: 'recap', label: 'Cierre con recapitulación de lo realizado', weight: 10, grade: 'yes' },
    { id: 'professional_tone', label: 'Lenguaje profesional y tono adecuado', weight: 10, grade: 'yes' },
    { id: 'spelling_grammar', label: 'Ortografía/gramática correctas', weight: 10, grade: 'yes' },
    ];

    const CHAT = [
    { id: 'greeting_brand', label: 'Saludo e identificación de la empresa', weight: 8, grade: 'yes' },
    { id: 'acknowledge', label: 'Acknowledgement del problema en texto', weight: 15, grade: 'yes' },
    { id: 'solution', label: 'Solución clara con pasos accionables', weight: 25, grade: 'yes' },
    { id: 'next_steps', label: 'Siguientes pasos y tiempos', weight: 12, grade: 'yes' },
    { id: 'feedback_request', label: 'Petición de feedback (no sesgada)', weight: 10, grade: 'yes' },
    { id: 'recap', label: 'Recap final del chat', weight: 10, grade: 'yes' },
    { id: 'professional_tone', label: 'Lenguaje profesional', weight: 10, grade: 'yes' },
    { id: 'spelling_grammar', label: 'Ortografía/gramática correctas', weight: 10, grade: 'yes' },
    ];

    const gradeFactor = { yes: 1, partial: 0.5, no: 0 };
    let channel = 'call';
    let rubric = JSON.parse(JSON.stringify(CALL));

    // --------- Helpers ---------
    function calc() {
    const totalWeight = rubric.reduce((s, c) => s + Number(c.weight || 0), 0);
    const earned = rubric.reduce(
        (s, c) => s + Number(c.weight || 0) * gradeFactor[c.grade],
        0
    );
    const pct = totalWeight ? (earned / totalWeight) * 100 : 0;
    const score = Math.round(pct * 10) / 10;

    document.getElementById('weightBadge').textContent = totalWeight + '%';

    const badge = document.getElementById('scoreBadge');
    badge.textContent = score + '%';
    badge.className = 'badge ' + (score >= 90 ? 'ok' : score >= 75 ? 'warn' : 'bad');

    document.getElementById('scoreBar').style.width =
        Math.max(0, Math.min(100, score)) + '%';
    }

    function renderRubric() {
    const root = document.getElementById('rubricContainer');
    root.innerHTML = '';
    rubric.forEach((item) => {
        const div = document.createElement('div');
        div.className = 'crit';
        div.innerHTML = `
        <div>
            <div style="font-weight:600">${item.label}</div>
        </div>
        <div>
            <label>Peso (%)</label>
            <input type="number" min="0" max="100" value="${item.weight}" data-id="${
        item.id
        }" data-field="weight"/>
        </div>
        <div>
            <label>Calificación</label>
            <select data-id="${item.id}" data-field="grade">
            <option value="yes" ${
                item.grade === 'yes' ? 'selected' : ''
            }>Sí (100%)</option>
            <option value="partial" ${
                item.grade === 'partial' ? 'selected' : ''
            }>Parcial (50%)</option>
            <option value="no" ${
                item.grade === 'no' ? 'selected' : ''
            }>No (0%)</option>
            </select>
        </div>
        <div style="grid-column:1/-1">
            <label>Notas</label>
            <textarea rows="2" data-id="${item.id}" data-field="notes">${
        item.notes || ''
        }</textarea>
        </div>`;
        root.appendChild(div);
    });

    // Wire inputs
    root.querySelectorAll('input,select,textarea').forEach((el) => {
        el.addEventListener('input', (e) => {
        const id = e.target.getAttribute('data-id');
        const field = e.target.getAttribute('data-field');
        const val = field === 'weight' ? Number(e.target.value) : e.target.value;
        rubric = rubric.map((c) => (c.id === id ? { ...c, [field]: val } : c));
        calc();
        });
    });

    calc();
    }

    // --------- Channel tabs ---------
    document.querySelectorAll('.tab').forEach((btn) => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        channel = btn.dataset.channel;
        rubric = JSON.parse(JSON.stringify(channel === 'call' ? CALL : CHAT));
        renderRubric();
    });
    });

    // --------- Submit ---------
    document.getElementById('submitBtn').addEventListener('click', async () => {
    const payload = {
        channel,
        agentId: document.getElementById('agent').value || null,
        evaluatorEmail: document.getElementById('evaluatorEmail').value || null,
        items: rubric,
        score: Number(
        document.getElementById('scoreBadge').textContent.replace('%', '')
        ),
        generalNotes: document.getElementById('generalNotes').value,
        evaluatedAt: new Date().toISOString(),
    };

    try {
        const res = await fetch('/evaluations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        });

        const data = await res.json();
        if (data.ok) {
        alert('✓ Evaluación guardada con id ' + data.id);
        } else {
        alert('Error al guardar evaluación: ' + (data.error || ''));
        }
    } catch (err) {
        console.error('Error en fetch /evaluations:', err);
        alert('Error de red al guardar evaluación');
    }
    });

    // First render
    renderRubric();