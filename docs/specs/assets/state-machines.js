/**
 * State Machines — Interactive SVG Renderer
 * Self-contained IIFE, zero external dependencies, dark theme.
 *
 * API:
 *   renderStateMachine(containerId, machineType)
 *     containerId  – DOM id of the host element for the SVG
 *     machineType  – 'task' | 'aiSuggestion' | 'integration'
 *
 * The function only needs a container element with id="myDiv".
 * It creates an SVG inside that container and wires all interaction.
 */

;(function (global) {
  'use strict';

  /* ═══════════════════════════════════════════════════════════════════
   *  Colour palette
   * ═══════════════════════════════════════════════════════════════════ */
  const C = {
    bg:     '#1a1a2e',
    fill:   '#16213e',
    border: '#0f3460',
    text:   '#e0e0e0',
    dim:    '#7a7a9a',
    accent: '#e94560',
    arrow:  '#556688',
  };

  /* ═══════════════════════════════════════════════════════════════════
   *  State-machine definitions
   * ═══════════════════════════════════════════════════════════════════ */
  const MACHINES = {

    task: {
      states: [
        { id: 'todo',        label: '待办'     },
        { id: 'in_progress', label: '进行中'   },
        { id: 'blocked',     label: '阻塞'     },
        { id: 'review',      label: '审核中'   },
        { id: 'done',        label: '已完成'   },
        { id: 'archived',    label: '已归档'   },
      ],
      edges: [
        { from: 'todo',        to: 'in_progress', label: '开始工作'     },
        { from: 'todo',        to: 'todo',        label: '认领/改派', selfLoop: true },
        { from: 'in_progress', to: 'blocked',     label: '遇到阻塞'     },
        { from: 'in_progress', to: 'review',      label: '提交 review' },
        { from: 'blocked',     to: 'in_progress', label: '解除阻塞'     },
        { from: 'review',      to: 'done',        label: '审核通过'     },
        { from: 'review',      to: 'in_progress', label: '退回'         },
        { from: 'done',        to: 'archived',    label: '归档'         },
        { from: 'archived',    to: 'todo',        label: '恢复'         },
      ],
    },

    aiSuggestion: {
      states: [
        { id: 'pending',  label: '待处理' },
        { id: 'accepted', label: '已接受' },
        { id: 'rejected', label: '已拒绝' },
        { id: 'expired',  label: '已过期' },
      ],
      edges: [
        { from: 'pending', to: 'accepted', label: '用户接受' },
        { from: 'pending', to: 'rejected', label: '用户拒绝' },
        { from: 'pending', to: 'expired',  label: '超时7天'  },
      ],
    },

    integration: {
      states: [
        { id: 'enabled',  label: '已启用' },
        { id: 'disabled', label: '已禁用' },
      ],
      edges: [
        { from: 'enabled',  to: 'disabled', label: '连续失败≥3次' },
        { from: 'disabled', to: 'enabled',  label: '用户重新授权'  },
      ],
    },
  };

  /* ═══════════════════════════════════════════════════════════════════
   *  Layout engine — Sugiyama-style layered layout with force polish
   * ═══════════════════════════════════════════════════════════════════ */
  const NODE_W = 140;
  const NODE_H = 52;

  /**
   * Assign integer layers to nodes using longest-path-from-sources
   * then order within each layer to reduce crossings (barycentre),
   * then assign x/y coordinates, then run a few force-directed passes
   * to polish spacing.
   *
   * Returns { stateId → { cx, cy, w, h } }
   */
  function computeLayout(states, edges) {
    const n = states.length;
    const id2idx = {};
    states.forEach((s, i) => { id2idx[s.id] = i; });

    const idxEdges = edges.map(e => ({
      fi: id2idx[e.from],
      ti: id2idx[e.to],
      selfLoop: !!e.selfLoop,
    }));

    // ── 1. Longest-path layering ──
    const adj = Array.from({ length: n }, () => []);
    const indeg = new Uint8Array(n);
    idxEdges.forEach(e => {
      if (!e.selfLoop && e.fi !== e.ti) {
        adj[e.fi].push(e.ti);
        indeg[e.ti]++;
      }
    });

    // Topological order via Kahn
    const queue = [];
    for (let i = 0; i < n; i++) {
      if (!indeg[i]) queue.push(i);
    }
    const layer = new Int32Array(n);
    let processed = 0;
    while (queue.length) {
      const u = queue.shift();
      processed++;
      for (const v of adj[u]) {
        layer[v] = Math.max(layer[v], layer[u] + 1);
        if (--indeg[v] === 0) queue.push(v);
      }
    }
    // If graph had cycles (self-loops won't cause issues), break ties
    if (processed < n) {
      // fallback: assign remaining layers by BFS from processed
      // In our case there are no cycles except self-loops, so skip.
    }

    // Collect layers
    const maxLayer = Math.max(...Array.from(layer), 0);
    const layers = Array.from({ length: maxLayer + 1 }, () => []);
    for (let i = 0; i < n; i++) layers[layer[i]].push(i);

    // ── 2. Order within layers via barycentre heuristic (1 pass) ──
    // For each adjacent layer, sort by average position of neighbors
    // in the previous layer.  Quick for our tiny graphs.
    const pos = new Float64Array(n);
    const layerNodes = layers.map(l => [...l]);

    // Initial ordering: by layer then by id
    for (let L = 0; L < layerNodes.length; L++) {
      layerNodes[L].sort((a, b) => {
        // sort by barycentre of edges to previous layer
        const neighbours = (node) => {
          const neigh = [];
          idxEdges.forEach(e => {
            if (e.ti === node && !e.selfLoop && e.fi !== node) neigh.push(e.fi);
          });
          return neigh;
        };
        const na = neighbours(a), nb = neighbours(b);
        const ba = na.length ? na.reduce((s, v) => s + layer.indexOf(v) * 1000 + v, 0) / na.length : a;
        const bb = nb.length ? nb.reduce((s, v) => s + layer.indexOf(v) * 1000 + v, 0) / nb.length : b;
        return ba - bb;
      });
    }

    // ── 3. Assign coordinates from layers ──
    const H_PAD = 100;
    const V_PAD = 100;
    const H_SPACING = NODE_W + 60;
    const V_SPACING = NODE_H + 80;

    const cx = new Float64Array(n);
    const cy = new Float64Array(n);

    layerNodes.forEach((nodes, L) => {
      const layerWidth = nodes.length * H_SPACING;
      const startX = -layerWidth / 2;
      nodes.forEach((nodeIdx, posInLayer) => {
        cx[nodeIdx] = startX + posInLayer * H_SPACING + H_SPACING / 2;
        cy[nodeIdx] = L * V_SPACING + V_PAD;
      });
    });

    // ── 4. Force-directed polish (80 iterations) ──
    const ITER  = 80;
    const K_REP = 5000;
    const K_SPR = 0.015;
    const IDEAL = Math.max(H_SPACING, V_SPACING) * 1.1;
    const damp  = 0.35;

    for (let iter = 0; iter < ITER; iter++) {
      const fx = new Float64Array(n), fy = new Float64Array(n);

      // repulsion (all pairs)
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          const dx = cx[j] - cx[i], dy = cy[j] - cy[i];
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const f = K_REP / (dist * dist);
          const ux = dx / dist, uy = dy / dist;
          fx[i] -= ux * f; fy[i] -= uy * f;
          fx[j] += ux * f; fy[j] += uy * f;
        }
      }

      // attraction (edges)
      idxEdges.forEach(e => {
        if (e.selfLoop) return;
        const dx = cx[e.ti] - cx[e.fi], dy = cy[e.ti] - cy[e.fi];
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const f = (dist - IDEAL) * K_SPR;
        const ux = dx / dist, uy = dy / dist;
        fx[e.fi] += ux * f; fy[e.fi] += uy * f;
        fx[e.ti] -= ux * f; fy[e.ti] -= uy * f;
      });

      // apply + containment
      const temp = (1 - iter / ITER) * damp;
      for (let i = 0; i < n; i++) {
        cx[i] += fx[i] * temp;
        cy[i] += fy[i] * temp;
        // keep inside reasonable bounds
        cy[i] = Math.max(NODE_H / 2, cy[i]);
      }
    }

    // Build result map
    const map = {};
    states.forEach((s, i) => {
      map[s.id] = { cx: cx[i], cy: cy[i], w: NODE_W, h: NODE_H };
    });
    return map;
  }

  /* ═══════════════════════════════════════════════════════════════════
   *  SVG helper
   * ═══════════════════════════════════════════════════════════════════ */
  function svg(tag, attrs = {}) {
    const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    return el;
  }

  /* ═══════════════════════════════════════════════════════════════════
   *  Tooltip singleton (HTML div, absolute-positioned)
   * ═══════════════════════════════════════════════════════════════════ */
  let _tip = null;
  function tip() {
    if (_tip) return _tip;
    _tip = document.createElement('div');
    Object.assign(_tip.style, {
      position: 'fixed', display: 'none',
      padding: '10px 14px', background: '#16213e',
      border: '1px solid #0f3460', borderRadius: '8px',
      color: '#e0e0e0', fontSize: '13px',
      fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
      boxShadow: '0 4px 24px rgba(0,0,0,0.55)',
      zIndex: '99999', maxWidth: '300px', lineHeight: '1.6',
      pointerEvents: 'none',
    });
    document.body.appendChild(_tip);
    return _tip;
  }

  function showTip(e, html) {
    const t = tip();
    t.innerHTML = html;
    t.style.display = 'block';
    let x = e.clientX + 16, y = e.clientY + 16;
    // Defer measurement to next frame so innerHTML is rendered
    requestAnimationFrame(() => {
      const r = t.getBoundingClientRect();
      if (x + r.width  > window.innerWidth)  x = e.clientX - r.width  - 12;
      if (y + r.height > window.innerHeight) y = e.clientY - r.height - 12;
      t.style.left = x + 'px';
      t.style.top  = y + 'px';
    });
    t.style.left = x + 'px';
    t.style.top  = y + 'px';
  }

  function hideTip() { if (_tip) _tip.style.display = 'none'; }

  /* ═══════════════════════════════════════════════════════════════════
   *  Geometry: intersection of line (a→b) with rounded-rect centred at a
   * ═══════════════════════════════════════════════════════════════════ */
  function rectEdgePoint(ax, ay, bx, by, hw, hh) {
    const dx = bx - ax, dy = by - ay;
    if (dx === 0 && dy === 0) return { x: ax + hw, y: ay };
    const absDx = Math.abs(dx), absDy = Math.abs(dy);
    let t;
    if (absDx * hh > absDy * hw) {
      // hits left/right
      t = hw / absDx;
    } else {
      // hits top/bottom
      t = hh / absDy;
    }
    return { x: ax + dx * t, y: ay + dy * t };
  }

  /* ═══════════════════════════════════════════════════════════════════
   *  Main render function
   * ═══════════════════════════════════════════════════════════════════ */
  function renderStateMachine(containerId, machineType) {
    const machine = MACHINES[machineType];
    if (!machine) { console.error('[state-machines] Unknown type:', machineType); return; }

    const container = document.getElementById(containerId);
    if (!container) { console.error('[state-machines] Container not found:', containerId); return; }

    const states = machine.states;
    const edges  = machine.edges;
    const layout = computeLayout(states, edges);

    // ── viewBox ──
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const s of states) {
      const p = layout[s.id];
      minX = Math.min(minX, p.cx - p.w / 2);
      minY = Math.min(minY, p.cy - p.h / 2);
      maxX = Math.max(maxX, p.cx + p.w / 2);
      maxY = Math.max(maxY, p.cy + p.h / 2);
    }
    const PAD = 60;
    const vbX = minX - PAD, vbY = minY - PAD;
    const vbW = maxX - minX + PAD * 2, vbH = maxY - minY + PAD * 2;

    // ── SVG root ──
    const svgEl = svg('svg', {
      xmlns: 'http://www.w3.org/2000/svg',
      viewBox: `${vbX} ${vbY} ${vbW} ${vbH}`,
      style: `width:100%;height:auto;display:block;background:${C.bg};border-radius:8px;`,
    });

    // ── defs (arrow markers) ──
    const mid = containerId.replace(/[^a-zA-Z0-9_-]/g, '_');
    const defs = svg('defs');
    defs.innerHTML = `
      <marker id="arr-${mid}" markerWidth="10" markerHeight="7" refX="9" refY="3.5"
        orient="auto" markerUnits="userSpaceOnUse">
        <polygon points="0 0, 10 3.5, 0 7" fill="${C.arrow}"/>
      </marker>
      <marker id="arrh-${mid}" markerWidth="10" markerHeight="7" refX="9" refY="3.5"
        orient="auto" markerUnits="userSpaceOnUse">
        <polygon points="0 0, 10 3.5, 0 7" fill="${C.accent}"/>
      </marker>
    `;
    svgEl.appendChild(defs);

    const edgeG   = svg('g');
    const labelG  = svg('g');
    const nodeG   = svg('g');
    svgEl.appendChild(edgeG);
    svgEl.appendChild(labelG);
    svgEl.appendChild(nodeG);

    // ── draw edges ──
    const edgeEls = [];
    edges.forEach((e, idx) => {
      const sp = layout[e.from];
      const tp = layout[e.to];

      if (e.selfLoop) {
        // Self-loop arc below the node
        const r = 24;
        const startX = sp.cx - r, startY = sp.cy + sp.h / 2;
        const endX   = sp.cx + r, endY   = sp.cy + sp.h / 2;
        const path = svg('path', {
          d: `M ${startX} ${startY} A ${r} ${r} 0 1 1 ${endX} ${endY}`,
          fill: 'none', stroke: C.arrow, 'stroke-width': 1.8,
          'marker-end': `url(#arr-${mid})`,
          'data-from': e.from, 'data-to': e.to, 'data-idx': idx,
        });
        edgeG.appendChild(path);
        edgeEls.push(path);

        const lbl = svg('text', {
          x: sp.cx, y: sp.cy + sp.h / 2 + r + 18,
          'text-anchor': 'middle', fill: C.dim, 'font-size': 11,
          'font-family': 'system-ui, -apple-system, sans-serif',
          'data-idx': idx,
        });
        lbl.textContent = e.label;
        labelG.appendChild(lbl);

        path.addEventListener('mouseenter', () => highlight(e.from, e.to));
        path.addEventListener('mouseleave', () => unhighlight());
        return;
      }

      const a = rectEdgePoint(sp.cx, sp.cy, tp.cx, tp.cy, sp.w / 2, sp.h / 2);
      const b = rectEdgePoint(tp.cx, tp.cy, sp.cx, sp.cy, tp.w / 2, tp.h / 2);

      // Curve offset for bidirectional edges
      const dx = tp.cx - sp.cx, dy = tp.cy - sp.cy;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const hasRev = edges.some(oe => oe !== e && oe.from === e.to && oe.to === e.from);
      const off = hasRev ? 22 : 0;
      const nx = -dy / dist, ny = dx / dist;
      const mx = (a.x + b.x) / 2 + nx * off;
      const my = (a.y + b.y) / 2 + ny * off;

      const path = svg('path', {
        d: `M ${a.x} ${a.y} Q ${mx} ${my} ${b.x} ${b.y}`,
        fill: 'none', stroke: C.arrow, 'stroke-width': 1.8,
        'marker-end': `url(#arr-${mid})`,
        'data-from': e.from, 'data-to': e.to, 'data-idx': idx,
      });
      edgeG.appendChild(path);
      edgeEls.push(path);

      // Edge label at t=0.5 of quadratic bezier
      const lx = 0.25 * a.x + 0.5 * mx + 0.25 * b.x + nx * off * 0.15;
      const ly = 0.25 * a.y + 0.5 * my + 0.25 * b.y + ny * off * 0.15;
      const lbl = svg('text', {
        x: lx, y: ly - 7,
        'text-anchor': 'middle', fill: C.dim, 'font-size': 11,
        'font-family': 'system-ui, -apple-system, sans-serif',
        'data-idx': idx,
      });
      lbl.textContent = e.label;
      labelG.appendChild(lbl);

      path.addEventListener('mouseenter', () => highlight(e.from, e.to));
      path.addEventListener('mouseleave', () => unhighlight());
    });

    // ── draw nodes ──
    const nodeEls = [];
    states.forEach(s => {
      const p = layout[s.id];
      const g = svg('g', { 'data-id': s.id, style: 'cursor:pointer' });

      const rect = svg('rect', {
        x: p.cx - p.w / 2, y: p.cy - p.h / 2,
        width: p.w, height: p.h, rx: 10, ry: 10,
        fill: C.fill, stroke: C.border, 'stroke-width': 2,
      });

      const txt = svg('text', {
        x: p.cx, y: p.cy,
        'text-anchor': 'middle',
        fill: C.text, 'font-size': 14, 'font-weight': '600',
        'font-family': 'system-ui, -apple-system, sans-serif',
      });
      // Manual vertical centre (dominant-baseline support varies)
      txt.setAttribute('dy', '0.35em');
      txt.textContent = s.label;

      g.appendChild(rect);
      g.appendChild(txt);
      nodeG.appendChild(g);
      nodeEls.push(g);

      // Build tooltip data
      const outgoing = edges.filter(ed => ed.from === s.id);
      g._tipData = {
        state: s.label,
        id: s.id,
        outgoing: outgoing.map(o => {
          const tgt = states.find(ss => ss.id === o.to);
          return { target: tgt ? tgt.label : o.to, action: o.label };
        }),
      };

      g.addEventListener('mouseenter', () => highlight(s.id, null));
      g.addEventListener('mouseleave', () => unhighlight());

      g.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const td = g._tipData;
        let html = `<strong style="color:${C.accent};font-size:14px">${td.state}</strong><br>`;
        html += `<span style="color:${C.dim};font-size:11px">状态: ${td.id}</span><br><br>`;
        if (!td.outgoing.length) {
          html += `<span style="color:${C.dim}">无可用操作（终态）</span>`;
        } else {
          html += '<strong>可执行操作:</strong><br>';
          td.outgoing.forEach(o => {
            html += `<span style="color:${C.accent}">→</span> ${o.action} → <em>${o.target}</em><br>`;
          });
        }
        showTip(ev, html);
      });
    });

    // Close tooltip on outside click
    const closeHandler = (ev) => {
      if (!svgEl.contains(ev.target)) hideTip();
    };
    document.addEventListener('click', closeHandler, true);

    // ── highlight helpers ──
    function highlight(fromId, toId) {
      unhighlight(true);

      // Highlight nodes
      nodeEls.forEach(ng => {
        const nid = ng.getAttribute('data-id');
        const match = toId ? (nid === fromId || nid === toId) : (nid === fromId);
        if (match) {
          ng.querySelector('rect').setAttribute('stroke', C.accent);
          ng.querySelector('rect').setAttribute('stroke-width', 3);
          ng.querySelector('rect').setAttribute('fill', '#1e2d4a');
        }
      });

      // Highlight edges
      edgeG.querySelectorAll('path').forEach(path => {
        const f = path.getAttribute('data-from');
        const t = path.getAttribute('data-to');
        const match = toId
          ? ((f === fromId && t === toId) || (f === toId && t === fromId))
          : (f === fromId || t === fromId);
        if (match) {
          path.setAttribute('stroke', C.accent);
          path.setAttribute('stroke-width', 2.5);
          path.setAttribute('marker-end', `url(#arrh-${mid})`);
          const idx = path.getAttribute('data-idx');
          labelG.querySelectorAll('text').forEach(lbl => {
            if (lbl.getAttribute('data-idx') === idx) {
              lbl.setAttribute('fill', C.accent);
              lbl.setAttribute('font-weight', '600');
            }
          });
        }
      });
    }

    function unhighlight(silent) {
      nodeEls.forEach(ng => {
        ng.querySelector('rect').setAttribute('stroke', C.border);
        ng.querySelector('rect').setAttribute('stroke-width', 2);
        ng.querySelector('rect').setAttribute('fill', C.fill);
      });
      edgeG.querySelectorAll('path').forEach(path => {
        path.setAttribute('stroke', C.arrow);
        path.setAttribute('stroke-width', 1.8);
        path.setAttribute('marker-end', `url(#arr-${mid})`);
      });
      labelG.querySelectorAll('text').forEach(lbl => {
        lbl.setAttribute('fill', C.dim);
        lbl.setAttribute('font-weight', 'normal');
      });
    }

    // ── mount ──
    container.innerHTML = '';
    container.appendChild(svgEl);
  }

  /* ═══════════════════════════════════════════════════════════════════
   *  Export
   * ═══════════════════════════════════════════════════════════════════ */
  global.renderStateMachine = renderStateMachine;

})(typeof window !== 'undefined' ? window : globalThis);
