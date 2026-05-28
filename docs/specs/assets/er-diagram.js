/**
 * ER Diagram — Interactive Entity-Relationship SVG Renderer
 * Zero dependencies, dark theme, draggable entities, zoomable canvas.
 * API: renderERDiagram(containerId)
 */
var ERDiagram = (function() {
  'use strict';

  const COLORS = {
    bg: '#1a1a2e',
    entityFill: '#16213e',
    entityHeader: '#0f3460',
    entityBorder: '#0a2342',
    textPrimary: '#e0e0e0',
    textField: '#b0b0b0',
    textPK: '#e94560',
    textFK: '#7c3aed',
    textType: '#5a6a8a',
    linkLine: '#4a5568',
    linkHighlight: '#e94560',
    linkDim: '#2a3a4a',
    entityDimFill: '#111827'
  };

  const ENTITIES = [
    {
      name: 'Tenant',
      pk: 'id',
      fields: [
        { name: 'id', type: 'UUID', isPK: true },
        { name: 'name', type: 'TEXT' },
        { name: 'created_at', type: 'TIMESTAMPTZ' }
      ]
    },
    {
      name: 'User',
      pk: 'id',
      fk: ['tenant_id'],
      fields: [
        { name: 'id', type: 'UUID', isPK: true },
        { name: 'tenant_id', type: 'UUID', isFK: true },
        { name: 'email', type: 'TEXT', unique: true },
        { name: 'display_name', type: 'TEXT' },
        { name: 'password_hash', type: 'TEXT' },
        { name: 'sso_subject', type: 'TEXT' },
        { name: 'is_pm', type: 'BOOLEAN' },
        { name: 'capture_preferences', type: 'JSONB' },
        { name: 'created_at', type: 'TIMESTAMPTZ' },
        { name: 'last_seen_at', type: 'TIMESTAMPTZ' }
      ]
    },
    {
      name: 'EventCache',
      pk: 'id',
      fk: ['tenant_id', 'actor_user_id'],
      fields: [
        { name: 'id', type: 'UUID', isPK: true },
        { name: 'tenant_id', type: 'UUID', isFK: true },
        { name: 'source', type: 'TEXT' },
        { name: 'event_type', type: 'TEXT' },
        { name: 'actor_user_id', type: 'UUID', isFK: true },
        { name: 'external_id', type: 'TEXT' },
        { name: 'payload', type: 'JSONB' },
        { name: 'occurred_at', type: 'TIMESTAMPTZ' },
        { name: 'ingested_at', type: 'TIMESTAMPTZ' },
        { name: 'expires_at', type: 'TIMESTAMPTZ' }
      ]
    },
    {
      name: 'Task',
      pk: 'id',
      fk: ['tenant_id', 'owner_user_id', 'source_event_id', 'parent_task_id'],
      fields: [
        { name: 'id', type: 'UUID', isPK: true },
        { name: 'tenant_id', type: 'UUID', isFK: true },
        { name: 'title', type: 'TEXT' },
        { name: 'description', type: 'TEXT' },
        { name: 'status', type: 'TEXT' },
        { name: 'priority', type: 'INT' },
        { name: 'owner_user_id', type: 'UUID', isFK: true },
        { name: 'created_by', type: 'TEXT' },
        { name: 'source_event_id', type: 'UUID', isFK: true },
        { name: 'parent_task_id', type: 'UUID', isFK: true, selfRef: true },
        { name: 'tags', type: 'JSONB' },
        { name: 'due_date', type: 'DATE' },
        { name: 'estimated_hours', type: 'NUMERIC' },
        { name: 'created_at', type: 'TIMESTAMPTZ' },
        { name: 'updated_at', type: 'TIMESTAMPTZ' }
      ]
    },
    {
      name: 'AiSuggestion',
      pk: 'id',
      fk: ['tenant_id', 'target_user_id'],
      fields: [
        { name: 'id', type: 'UUID', isPK: true },
        { name: 'tenant_id', type: 'UUID', isFK: true },
        { name: 'suggestion_type', type: 'TEXT' },
        { name: 'target_user_id', type: 'UUID', isFK: true },
        { name: 'target_ref', type: 'JSONB' },
        { name: 'rationale', type: 'TEXT' },
        { name: 'confidence', type: 'NUMERIC' },
        { name: 'based_on_events', type: 'UUID[]' },
        { name: 'status', type: 'TEXT' },
        { name: 'handled_by', type: 'UUID' },
        { name: 'handled_at', type: 'TIMESTAMPTZ' },
        { name: 'created_at', type: 'TIMESTAMPTZ' }
      ]
    },
    {
      name: 'Report',
      pk: 'id',
      fk: ['tenant_id', 'user_id'],
      fields: [
        { name: 'id', type: 'UUID', isPK: true },
        { name: 'tenant_id', type: 'UUID', isFK: true },
        { name: 'user_id', type: 'UUID', isFK: true },
        { name: 'kind', type: 'TEXT' },
        { name: 'date_range', type: 'DATERANGE' },
        { name: 'content', type: 'TEXT' },
        { name: 'raw_activities', type: 'JSONB' },
        { name: 'model_used', type: 'TEXT' },
        { name: 'generated_at', type: 'TIMESTAMPTZ' }
      ]
    },
    {
      name: 'ChatSession',
      pk: 'id',
      fk: ['user_id'],
      fields: [
        { name: 'id', type: 'UUID', isPK: true },
        { name: 'user_id', type: 'UUID', isFK: true },
        { name: 'title', type: 'TEXT' },
        { name: 'created_at', type: 'TIMESTAMPTZ' },
        { name: 'last_active_at', type: 'TIMESTAMPTZ' },
        { name: 'archived_at', type: 'TIMESTAMPTZ' }
      ]
    },
    {
      name: 'Integration',
      pk: 'id',
      fk: ['user_id'],
      fields: [
        { name: 'id', type: 'UUID', isPK: true },
        { name: 'user_id', type: 'UUID', isFK: true },
        { name: 'provider', type: 'TEXT' },
        { name: 'credential', type: 'JSONB' },
        { name: 'scope', type: 'TEXT' },
        { name: 'expires_at', type: 'TIMESTAMPTZ' },
        { name: 'last_synced_at', type: 'TIMESTAMPTZ' },
        { name: 'last_error', type: 'TEXT' },
        { name: 'consecutive_failures', type: 'INT' },
        { name: 'sync_cursor', type: 'JSONB' },
        { name: 'enabled', type: 'BOOLEAN' }
      ]
    }
  ];

  const RELATIONS = [
    { from: 'Tenant', to: 'User', label: '1 → N', fromCard: '1', toCard: 'N' },
    { from: 'User', to: 'Integration', label: '1 → N', fromCard: '1', toCard: 'N' },
    { from: 'User', to: 'Task', label: '1 → N', fromCard: '1', toCard: 'N' },
    { from: 'User', to: 'EventCache', label: '1 → N', fromCard: '1', toCard: 'N' },
    { from: 'User', to: 'AiSuggestion', label: '1 → N', fromCard: '1', toCard: 'N' },
    { from: 'User', to: 'ChatSession', label: '1 → N', fromCard: '1', toCard: 'N' },
    { from: 'EventCache', to: 'Task', label: 'N → N', fromCard: 'N', toCard: 'N' },
    { from: 'EventCache', to: 'AiSuggestion', label: 'N → N', fromCard: 'N', toCard: 'N' },
    { from: 'Task', to: 'Task', label: '自引用', fromCard: '1', toCard: 'N', selfRef: true },
    { from: 'Task', to: 'TaskHistory', label: '1 → N', hidden: true },
    { from: 'Task', to: 'TaskLink', label: 'N → N', hidden: true },
    { from: 'ChatSession', to: 'ChatMessage', label: '1 → N', hidden: true }
  ];

  const FIELD_H = 20;
  const HEADER_H = 28;
  const ENTITY_MIN_W = 210;
  const COLS = 4;
  const COL_GAP = 50;
  const ROW_GAP = 60;

  let svg, svgGroup, entityMap, linkGroup, entityGroup;
  let zoom = 1, panX = 0, panY = 0;
  let isPanning = false, panStartX, panStartY;
  let hoveredEntity = null;

  function getTextWidth(text, bold) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    ctx.font = (bold ? 'bold ' : '') + '12px Inter, system-ui, sans-serif';
    return ctx.measureText(text).width;
  }

  function calcEntityHeight(entity) {
    return HEADER_H + entity.fields.length * FIELD_H + 8;
  }

  function calcEntityWidth(entity) {
    let maxW = getTextWidth(entity.name, true) + 20;
    entity.fields.forEach(f => {
      const nameW = getTextWidth(f.name + (f.isPK ? ' ●' : ''), f.isPK || f.isFK);
      const typeW = getTextWidth(f.type, false);
      maxW = Math.max(maxW, nameW + typeW + 32);
    });
    return Math.max(maxW, ENTITY_MIN_W);
  }

  function getEntityCenter(name) {
    const el = entityMap[name];
    if (!el) return { x: 0, y: 0 };
    return { x: el.x + el.w / 2, y: el.y + el.h / 2 };
  }

  function layout() {
    const rows = Math.ceil(ENTITIES.length / COLS);
    const maxHeights = [];
    for (let r = 0; r < rows; r++) {
      let maxH = 0;
      for (let c = 0; c < COLS; c++) {
        const idx = r * COLS + c;
        if (idx < ENTITIES.length) {
          maxH = Math.max(maxH, calcEntityHeight(ENTITIES[idx]));
        }
      }
      maxHeights.push(maxH);
    }

    let curY = 40;
    ENTITIES.forEach((entity, idx) => {
      const row = Math.floor(idx / COLS);
      const col = idx % COLS;
      const w = calcEntityWidth(entity);
      const h = calcEntityHeight(entity);
      let x = 40;
      for (let c = 0; c < col; c++) {
        const prevIdx = row * COLS + c;
        if (prevIdx < ENTITIES.length) {
          x += calcEntityWidth(ENTITIES[prevIdx]) + COL_GAP;
        }
      }
      entityMap[entity.name] = { x, y: curY, w, h, entity };
      if (row < rows - 1) {
        // advance y done via maxHeights
      }
    });

    // Recalculate y for each row
    curY = 40;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < COLS; c++) {
        const idx = r * COLS + c;
        if (idx < ENTITIES.length) {
          entityMap[ENTITIES[idx].name].y = curY;
        }
      }
      curY += maxHeights[r] + ROW_GAP;
    }
  }

  function createSVGElement(tag, attrs) {
    const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
    Object.entries(attrs).forEach(([k, v]) => {
      if (v !== undefined && v !== null) el.setAttribute(k, v);
    });
    return el;
  }

  function renderEntities() {
    ENTITIES.forEach(entity => {
      const rect = entityMap[entity.name];
      const g = createSVGElement('g', {
        class: 'er-entity',
        'data-name': entity.name,
        transform: `translate(${rect.x}, ${rect.y})`
      });

      // Shadow
      const shadow = createSVGElement('rect', {
        x: 3, y: 3, width: rect.w, height: rect.h,
        rx: 8, ry: 8,
        fill: 'rgba(0,0,0,0.3)', class: 'er-shadow'
      });
      g.appendChild(shadow);

      // Body
      const body = createSVGElement('rect', {
        width: rect.w, height: rect.h,
        rx: 8, ry: 8,
        fill: COLORS.entityFill,
        stroke: COLORS.entityBorder,
        'stroke-width': 1.5,
        class: 'er-entity-body'
      });
      g.appendChild(body);

      // Header
      const header = createSVGElement('rect', {
        width: rect.w, height: HEADER_H,
        rx: 8, ry: 8,
        fill: COLORS.entityHeader,
        class: 'er-entity-header'
      });
      g.appendChild(header);
      // Fix bottom corners of header
      const headerFix = createSVGElement('rect', {
        y: HEADER_H - 8, width: rect.w, height: 8,
        fill: COLORS.entityHeader
      });
      g.appendChild(headerFix);

      // Title
      const title = createSVGElement('text', {
        x: rect.w / 2, y: HEADER_H / 2 + 5,
        'text-anchor': 'middle',
        fill: COLORS.textPrimary,
        'font-size': 13, 'font-weight': 'bold',
        'font-family': 'Inter, system-ui, sans-serif',
        class: 'er-entity-title'
      });
      title.textContent = entity.name;
      g.appendChild(title);

      // Fields
      entity.fields.forEach((field, fi) => {
        const fy = HEADER_H + 14 + fi * FIELD_H;
        let color = COLORS.textField;
        let weight = 'normal';
        let prefix = '';
        if (field.isPK) { color = COLORS.textPK; weight = 'bold'; prefix = '● '; }
        else if (field.isFK) { color = COLORS.textFK; }

        const fname = createSVGElement('text', {
          x: 10, y: fy,
          fill: color, 'font-size': 11, 'font-weight': weight,
          'font-family': 'Inter, system-ui, monospace, sans-serif',
          class: 'er-field-name'
        });
        fname.textContent = prefix + field.name;
        g.appendChild(fname);

        const ftype = createSVGElement('text', {
          x: rect.w - 10, y: fy,
          'text-anchor': 'end',
          fill: COLORS.textType, 'font-size': 10,
          'font-family': 'Inter, monospace, sans-serif',
          class: 'er-field-type'
        });
        ftype.textContent = field.type;
        g.appendChild(ftype);

        // separator line
        if (fi < entity.fields.length - 1) {
          const line = createSVGElement('line', {
            x1: 6, y1: fy + 6, x2: rect.w - 6, y2: fy + 6,
            stroke: '#1e293b', 'stroke-width': 0.5
          });
          g.appendChild(line);
        }
      });

      // Drag events
      g.addEventListener('mousedown', onEntityDragStart);
      g.addEventListener('mouseenter', () => onEntityHover(entity.name));
      g.addEventListener('mouseleave', () => onEntityLeave());

      entityGroup.appendChild(g);
    });
  }

  function renderLinks() {
    RELATIONS.forEach(rel => {
      if (rel.hidden) return;
      if (rel.selfRef) {
        // Self-reference: draw loop
        const rect = entityMap[rel.from];
        if (!rect) return;
        const g = createSVGElement('g', { class: 'er-link', 'data-from': rel.from, 'data-to': rel.to });
        const path = createSVGElement('path', {
          d: `M${rect.x + rect.w},${rect.y + 40} C${rect.x + rect.w + 50},${rect.y + 40} ${rect.x + rect.w + 50},${rect.y - 20} ${rect.x + rect.w - 30},${rect.y}`,
          fill: 'none',
          stroke: COLORS.linkLine,
          'stroke-width': 1.5,
          'stroke-dasharray': rel.fromCard === 'N' ? '6,4' : 'none',
          class: 'er-link-line'
        });
        g.appendChild(path);

        // Arrow
        const arrow = createSVGElement('polygon', {
          points: `${rect.x + rect.w - 30},${rect.y - 2} ${rect.x + rect.w - 38},${rect.y + 6} ${rect.x + rect.w - 38},${rect.y - 10}`,
          fill: COLORS.linkLine,
          class: 'er-link-arrow'
        });
        g.appendChild(arrow);

        // Label
        const label = createSVGElement('text', {
          x: rect.x + rect.w + 10, y: rect.y - 25,
          fill: COLORS.textType, 'font-size': 10,
          'font-family': 'Inter, system-ui, sans-serif',
          class: 'er-link-label'
        });
        label.textContent = rel.label;
        g.appendChild(label);

        linkGroup.appendChild(g);
        return;
      }

      const from = entityMap[rel.from];
      const to = entityMap[rel.to];
      if (!from || !to) return;

      const fromPt = { x: from.x + from.w / 2, y: from.y + from.h / 2 };
      const toPt = { x: to.x + to.w / 2, y: to.y + to.h / 2 };

      const g = createSVGElement('g', { class: 'er-link', 'data-from': rel.from, 'data-to': rel.to });

      let d;
      const dx = toPt.x - fromPt.x;
      const dy = toPt.y - fromPt.y;
      if (Math.abs(dx) > Math.abs(dy)) {
        // Horizontal-ish
        const c1x = fromPt.x + dx * 0.5;
        const c2x = fromPt.x + dx * 0.5;
        d = `M${from.x + from.w},${from.y + from.h / 2} C${c1x},${from.y + from.h / 2} ${c2x},${to.y + to.h / 2} ${to.x},${to.y + to.h / 2}`;
      } else {
        const c1y = fromPt.y + dy * 0.5;
        const c2y = fromPt.y + dy * 0.5;
        d = `M${from.x + from.w / 2},${from.y + from.h} C${from.x + from.w / 2},${c1y} ${to.x + to.w / 2},${c2y} ${to.x + to.w / 2},${to.y}`;
      }

      const path = createSVGElement('path', {
        d,
        fill: 'none',
        stroke: COLORS.linkLine,
        'stroke-width': 1.5,
        'stroke-dasharray': rel.toCard === 'N' ? '6,4' : 'none',
        class: 'er-link-line'
      });
      g.appendChild(path);

      // Cardinality labels
      const labelFrom = createSVGElement('text', {
        x: from.x + from.w + 4, y: from.y + from.h / 2 + 4,
        fill: COLORS.textType, 'font-size': 10,
        'font-family': 'Inter, system-ui, sans-serif',
        class: 'er-cardinality'
      });
      labelFrom.textContent = rel.fromCard;
      g.appendChild(labelFrom);

      const labelTo = createSVGElement('text', {
        x: to.x - 12, y: to.y + to.h / 2 + 4,
        fill: COLORS.textType, 'font-size': 10,
        'font-family': 'Inter, system-ui, sans-serif',
        class: 'er-cardinality'
      });
      labelTo.textContent = rel.toCard;
      g.appendChild(labelTo);

      linkGroup.appendChild(g);
    });
  }

  // --- Interaction ---
  let dragEntity = null, dragOffsetX, dragOffsetY;

  function onEntityDragStart(e) {
    e.stopPropagation();
    const g = e.currentTarget;
    dragEntity = g;
    const rect = entityMap[g.dataset.name];
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const svgP = pt.matrixTransform(svgGroup.getCTM().inverse());
    dragOffsetX = svgP.x - rect.x;
    dragOffsetY = svgP.y - rect.y;
    g.style.cursor = 'grabbing';
    document.addEventListener('mousemove', onEntityDragMove);
    document.addEventListener('mouseup', onEntityDragEnd);
  }

  function onEntityDragMove(e) {
    if (!dragEntity) return;
    const rect = entityMap[dragEntity.dataset.name];
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const svgP = pt.matrixTransform(svgGroup.getCTM().inverse());
    rect.x = svgP.x - dragOffsetX;
    rect.y = svgP.y - dragOffsetY;
    dragEntity.setAttribute('transform', `translate(${rect.x}, ${rect.y})`);
    updateLinks();
  }

  function onEntityDragEnd() {
    if (dragEntity) {
      dragEntity.style.cursor = 'grab';
      dragEntity = null;
    }
    document.removeEventListener('mousemove', onEntityDragMove);
    document.removeEventListener('mouseup', onEntityDragEnd);
  }

  function getLinksForEntity(name) {
    return Array.from(linkGroup.querySelectorAll('.er-link')).filter(g => {
      return g.dataset.from === name || g.dataset.to === name;
    });
  }

  function onEntityHover(name) {
    hoveredEntity = name;
    // Dim all entities
    entityGroup.querySelectorAll('.er-entity').forEach(g => {
      if (g.dataset.name !== name) {
        g.querySelector('.er-entity-body').setAttribute('fill', COLORS.entityDimFill);
        g.style.opacity = '0.4';
      }
    });
    // Highlight related links
    const related = getLinksForEntity(name);
    linkGroup.querySelectorAll('.er-link').forEach(g => {
      const isRelated = related.includes(g);
      const line = g.querySelector('.er-link-line');
      const arrow = g.querySelector('.er-link-arrow');
      if (isRelated) {
        line.setAttribute('stroke', COLORS.linkHighlight);
        line.setAttribute('stroke-width', 2.5);
        if (arrow) arrow.setAttribute('fill', COLORS.linkHighlight);
      } else {
        line.setAttribute('stroke', COLORS.linkDim);
        line.setAttribute('opacity', '0.2');
      }
    });
  }

  function onEntityLeave() {
    hoveredEntity = null;
    entityGroup.querySelectorAll('.er-entity').forEach(g => {
      g.querySelector('.er-entity-body').setAttribute('fill', COLORS.entityFill);
      g.style.opacity = '1';
    });
    linkGroup.querySelectorAll('.er-link').forEach(g => {
      const line = g.querySelector('.er-link-line');
      const arrow = g.querySelector('.er-link-arrow');
      line.setAttribute('stroke', COLORS.linkLine);
      line.setAttribute('stroke-width', 1.5);
      line.setAttribute('opacity', '1');
      if (arrow) arrow.setAttribute('fill', COLORS.linkLine);
    });
  }

  function updateLinks() {
    // Re-render links (simplest approach)
    while (linkGroup.firstChild) linkGroup.removeChild(linkGroup.firstChild);
    renderLinks();
  }

  // --- Zoom & Pan ---
  function onWheel(e) {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    zoom = Math.max(0.3, Math.min(2.5, zoom * delta));
    updateTransform();
  }

  function onMouseDown(e) {
    if (e.button !== 0) return;
    // Only pan if clicking on SVG background
    if (e.target.tagName === 'svg' || e.target.classList.contains('er-bg')) {
      isPanning = true;
      panStartX = e.clientX - panX;
      panStartY = e.clientY - panY;
      svg.style.cursor = 'grabbing';
      document.addEventListener('mousemove', onPanMove);
      document.addEventListener('mouseup', onPanEnd);
    }
  }

  function onPanMove(e) {
    if (!isPanning) return;
    panX = e.clientX - panStartX;
    panY = e.clientY - panStartY;
    updateTransform();
  }

  function onPanEnd() {
    isPanning = false;
    document.removeEventListener('mousemove', onPanMove);
    document.removeEventListener('mouseup', onPanEnd);
    svg.style.cursor = 'default';
  }

  function updateTransform() {
    svgGroup.setAttribute('transform', `translate(${panX}, ${panY}) scale(${zoom})`);
  }

  function resetView() {
    zoom = 1; panX = 0; panY = 0;
    updateTransform();
  }

  // --- Public API ---
  function render(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    // Wrapper
    const wrapper = document.createElement('div');
    wrapper.className = 'er-diagram-wrapper';
    wrapper.style.cssText = 'position:relative;width:100%;height:620px;border-radius:12px;overflow:hidden;background:' + COLORS.bg + ';border:1px solid #0a2342;font-family:Inter,system-ui,sans-serif;';

    // Controls
    const controls = document.createElement('div');
    controls.style.cssText = 'position:absolute;top:12px;right:12px;z-index:10;display:flex;gap:6px;';
    controls.innerHTML = `
      <button class="er-btn" onclick="ERDiagram.zoomIn()" title="放大" style="background:${COLORS.entityHeader};border:1px solid ${COLORS.entityBorder};color:${COLORS.textPrimary};width:32px;height:32px;border-radius:6px;cursor:pointer;font-size:16px;display:flex;align-items:center;justify-content:center;">+</button>
      <button class="er-btn" onclick="ERDiagram.zoomOut()" title="缩小" style="background:${COLORS.entityHeader};border:1px solid ${COLORS.entityBorder};color:${COLORS.textPrimary};width:32px;height:32px;border-radius:6px;cursor:pointer;font-size:16px;display:flex;align-items:center;justify-content:center;">−</button>
      <button class="er-btn" onclick="ERDiagram.resetView()" title="重置" style="background:${COLORS.entityHeader};border:1px solid ${COLORS.entityBorder};color:${COLORS.textPrimary};padding:0 10px;height:32px;border-radius:6px;cursor:pointer;font-size:12px;display:flex;align-items:center;">重置</button>
    `;
    wrapper.appendChild(controls);

    // Hint
    const hint = document.createElement('div');
    hint.style.cssText = 'position:absolute;bottom:10px;left:50%;transform:translateX(-50%);z-index:10;color:#5a6a8a;font-size:11px;pointer-events:none;white-space:nowrap;';
    hint.textContent = '滚轮缩放 · 拖拽空白平移 · 拖拽实体框移动 · 悬停高亮关系';
    wrapper.appendChild(hint);

    // SVG
    svg = createSVGElement('svg', {
      width: '100%', height: '100%',
      viewBox: '0 0 1200 620',
      style: 'display:block;cursor:grab;'
    });

    const bg = createSVGElement('rect', { width: '100%', height: '100%', fill: COLORS.bg, class: 'er-bg' });
    svg.appendChild(bg);

    svgGroup = createSVGElement('g', { class: 'er-transform-group' });
    linkGroup = createSVGElement('g', { class: 'er-link-group' });
    entityGroup = createSVGElement('g', { class: 'er-entity-group' });
    svgGroup.appendChild(linkGroup);
    svgGroup.appendChild(entityGroup);
    svg.appendChild(svgGroup);
    wrapper.appendChild(svg);
    container.appendChild(wrapper);

    // Init
    entityMap = {};
    layout();
    renderLinks();
    renderEntities();
    updateTransform();

    // Events
    svg.addEventListener('wheel', onWheel, { passive: false });
    svg.addEventListener('mousedown', onMouseDown);

    // Store entityMap for drag updates
    svgGroup._entityMap = entityMap;
  }

  return {
    render,
    zoomIn: function() { zoom = Math.min(2.5, zoom * 1.2); updateTransform(); },
    zoomOut: function() { zoom = Math.max(0.3, zoom * 0.8); updateTransform(); },
    resetView
  };
})();
