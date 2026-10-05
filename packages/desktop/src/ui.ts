/**
 * The desktop GUI.
 *
 * One self-contained HTML document with no build step, no CDN and no framework:
 * the interface ships as a string, so `complisme-desktop` starts instantly on any
 * machine with Node. Everything runs against the local server; nothing is
 * fetched from the internet.
 */

import { BRAND_CSS } from './styles';

export function renderApp(): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>CompliSME</title>
<style>${BRAND_CSS}</style>
</head>
<body>
<div id="app">
  <aside class="rail">
    <div class="logo"><span>C</span> CompliSME</div>
    <nav>
      <button data-view="dashboard" class="nav active">Dashboard</button>
      <button data-view="company" class="nav">Company</button>
      <button data-view="questionnaire" class="nav">Questionnaire</button>
      <button data-view="scan" class="nav">Scan codebase</button>
      <button data-view="roadmap" class="nav">Roadmap</button>
      <button data-view="documents" class="nav">Documents</button>
    </nav>
    <div class="rail-foot">
      <div id="rail-status" class="muted small">connecting…</div>
    </div>
  </aside>

  <main>
    <header class="topbar">
      <h1 id="view-title">Dashboard</h1>
      <div class="topbar-right">
        <span id="score-pill" class="pill">—</span>
        <button id="refresh" class="btn ghost" title="Reload data">Refresh</button>
      </div>
    </header>
    <section id="view" class="view"><div class="loading">Loading…</div></section>
  </main>
</div>

<div id="toast" class="toast" hidden></div>

<script>
(function () {
  'use strict';

  var state = { overview: null, view: 'dashboard', busy: false };

  // --- tiny DOM helpers ----------------------------------------------------
  function h(tag, attrs, children) {
    var el = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (key) {
        if (key === 'class') el.className = attrs[key];
        else if (key === 'html') el.innerHTML = attrs[key];
        else if (key === 'text') el.textContent = attrs[key];
        else if (key.slice(0, 2) === 'on') el.addEventListener(key.slice(2), attrs[key]);
        else if (attrs[key] !== undefined && attrs[key] !== null) el.setAttribute(key, attrs[key]);
      });
    }
    (children || []).forEach(function (child) {
      if (child === null || child === undefined || child === false) return;
      el.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
    });
    return el;
  }
  var $ = function (sel) { return document.querySelector(sel); };
  function esc(value) {
    return String(value === undefined || value === null ? '' : value).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function euro(value) {
    if (value === undefined || value === null) return '—';
    if (value >= 1000000) return '€' + (value / 1000000).toFixed(value >= 10000000 ? 0 : 1) + 'M';
    if (value >= 1000) return '€' + Math.round(value / 1000) + 'K';
    return '€' + Math.round(value);
  }
  function title(value) {
    return String(value || '').replace(/[-_.]/g, ' ').replace(/\\b\\w/g, function (c) { return c.toUpperCase(); });
  }

  function toast(message, kind) {
    var el = $('#toast');
    el.textContent = message;
    el.className = 'toast ' + (kind || 'ok');
    el.hidden = false;
    clearTimeout(el._timer);
    el._timer = setTimeout(function () { el.hidden = true; }, 4000);
  }

  // --- API ------------------------------------------------------------------
  function api(path, options) {
    return fetch(path, options).then(function (r) {
      return r.json().then(function (body) {
        if (!r.ok) throw new Error(body && body.error ? body.error : 'HTTP ' + r.status);
        return body;
      });
    });
  }
  function post(path, body) {
    return api(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body || {}),
    });
  }

  // --- views ----------------------------------------------------------------
  function scoreColour(score) {
    return score >= 80 ? 'good' : score >= 60 ? 'warn' : 'bad';
  }

  function kpi(label, value, tone) {
    return h('div', { class: 'kpi' }, [
      h('div', { class: 'kpi-value ' + (tone || ''), text: String(value) }),
      h('div', { class: 'kpi-label', text: label }),
    ]);
  }

  function bar(score) {
    return h('div', { class: 'bar' }, [
      h('div', { class: 'bar-fill ' + scoreColour(score), style: 'width:' + Math.max(0, Math.min(100, score)) + '%' }),
    ]);
  }

  function renderDashboard(data) {
    if (!data.hasProfile) {
      return h('div', { class: 'empty' }, [
        h('h2', { text: 'Let’s get started' }),
        h('p', { text: 'Tell us about your company and CompliSME will work out which of the four frameworks apply, what is missing, and what to do first.' }),
        h('button', { class: 'btn primary', text: 'Describe my company', onclick: function () { setView('company'); } }),
      ]);
    }

    var children = [
      h('div', { class: 'kpis' }, [
        kpi('Overall readiness', Math.round(data.overall) + '%', scoreColour(data.overall)),
        kpi('Grade', data.grade || '—'),
        kpi('Open gaps', data.summary ? data.summary.total : 0),
        kpi('Blocking', data.summary ? data.summary.bySeverity.error || 0 : 0, 'bad'),
        kpi('Person-days', data.summary ? Math.round(data.summary.effort) : 0),
        kpi('Evidence', data.evidenceCount),
      ]),
    ];

    children.push(h('h2', { text: 'Deadlines' }));
    children.push(
      h('div', { class: 'grid three' },
        data.countdowns.map(function (event) {
          var urgent = event.daysRemaining > 0 && event.daysRemaining <= 120;
          var passed = event.daysRemaining <= 0;
          return h('div', { class: 'card countdown ' + (urgent ? 'urgent' : '') }, [
            h('div', { class: 'muted small', text: title(event.frameworkId) }),
            h('div', { class: 'cd-label', text: event.label }),
            h('div', { class: 'cd-days ' + (passed ? 'bad' : ''), text: passed ? 'In force' : event.daysRemaining + ' days' }),
            h('div', { class: 'muted small', text: 'Deadline ' + event.date }),
          ]);
        })
      )
    );

    children.push(h('h2', { text: 'Readiness by framework' }));
    children.push(
      h('div', { class: 'grid two' },
        data.scores.map(function (score) {
          return h('div', { class: 'card' }, [
            h('div', { class: 'row' }, [
              h('div', {}, [
                h('h3', { text: title(score.frameworkId) }),
                h('div', { class: 'muted small', text: score.gaps + ' open gaps' }),
              ]),
              h('div', { class: 'row-right' }, [
                h('div', { class: 'score ' + scoreColour(score.score), text: Math.round(score.score) + '%' }),
                h('div', { class: 'muted small', text: 'grade ' + (score.grade || '—') }),
              ]),
            ]),
            bar(score.score),
          ]);
        })
      )
    );

    if (data.applicability && data.applicability.length) {
      children.push(h('h2', { text: 'Why these frameworks' }));
      children.push(
        h('div', { class: 'card' },
          data.applicability.map(function (entry) {
            return h('div', { class: 'scope-row' }, [
              h('span', { class: entry.applies ? 'dot on' : 'dot', text: entry.applies ? '●' : '○' }),
              h('div', {}, [
                h('strong', { text: title(entry.frameworkId) }),
                h('div', { class: 'muted small', text: entry.reason }),
              ]),
            ]);
          })
        )
      );
    }

    if (data.gaps && data.gaps.length) {
      children.push(h('h2', { text: 'What to fix first' }));
      children.push(
        h('div', { class: 'card flush' },
          data.gaps.slice(0, 15).map(function (gap) {
            return h('div', { class: 'gap' }, [
              h('span', { class: 'sev ' + gap.severity, text: gap.severity }),
              h('div', { class: 'gap-body' }, [
                h('div', { class: 'gap-title', text: gap.title || gap.articleId }),
                h('div', { class: 'muted small', text: gap.remediation }),
                h('div', { class: 'muted tiny', text: title(gap.frameworkId) + ' · ' + gap.articleId + ' · ' + gap.effort + 'd' + (gap.deadlineIso ? ' · due ' + gap.deadlineIso : '') }),
              ]),
            ]);
          })
        )
      );
    }

    return h('div', {}, children);
  }

  function renderCompany(data) {
    var profile = (data && data.profile) || {};
    var fields = [
      { key: 'name', label: 'Company name', type: 'text' },
      { key: 'legalName', label: 'Legal name', type: 'text' },
      { key: 'country', label: 'Country (ISO code)', type: 'text' },
      { key: 'sector', label: 'Sector', type: 'text' },
      { key: 'employees', label: 'Employees', type: 'number' },
      { key: 'revenueEUR', label: 'Annual turnover (EUR)', type: 'number' },
      { key: 'usesCookies', label: 'Uses cookies or tracking', type: 'checkbox' },
      { key: 'hasRopa', label: 'Maintains a ROPA', type: 'checkbox' },
      { key: 'hasDpo', label: 'Has a data protection officer', type: 'checkbox' },
    ];

    var inputs = {};
    var form = h('div', { class: 'card' }, fields.map(function (field) {
      var node;
      if (field.type === 'checkbox') {
        node = h('input', { type: 'checkbox', id: 'f-' + field.key });
        node.checked = !!profile[field.key];
      } else {
        node = h('input', { type: field.type, id: 'f-' + field.key, value: profile[field.key] === undefined ? '' : profile[field.key] });
      }
      inputs[field.key] = node;
      return h('label', { class: 'field' + (field.type === 'checkbox' ? ' check' : '') }, [
        h('span', { text: field.label }),
        node,
      ]);
    }));

    var sizeField = h('div', { class: 'muted small', id: 'size-hint' });

    return h('div', {}, [
      h('h2', { text: 'Your company' }),
      h('p', { class: 'muted', text: 'These five answers decide which frameworks apply to you. You can change them later.' }),
      form,
      sizeField,
      h('div', { class: 'row gap-top' }, [
        h('button', {
          class: 'btn primary',
          text: 'Save and assess',
          onclick: function () {
            var payload = {};
            fields.forEach(function (field) {
              var node = inputs[field.key];
              payload[field.key] = field.type === 'checkbox' ? node.checked : (field.type === 'number' ? Number(node.value || 0) : node.value);
            });
            if (!payload.name) return toast('A company name is required', 'warn');
            post('/api/profile', payload).then(function () {
              toast('Saved. Scoring your frameworks…');
              return reload().then(function () { setView('dashboard'); });
            }).catch(function (e) { toast(e.message, 'warn'); });
          },
        }),
      ]),
      data && data.applicability && data.applicability.length
        ? h('div', {}, [
            h('h2', { text: 'Frameworks in scope' }),
            h('div', { class: 'card' }, data.applicability.map(function (entry) {
              return h('div', { class: 'scope-row' }, [
                h('span', { class: entry.applies ? 'dot on' : 'dot', text: entry.applies ? '●' : '○' }),
                h('div', {}, [
                  h('strong', { text: title(entry.frameworkId) }),
                  h('div', { class: 'muted small', text: entry.reason }),
                ]),
              ]);
            })),
          ])
        : null,
    ]);
  }

  function renderQuestionnaire(data) {
    if (!data.hasProfile) {
      return h('div', { class: 'empty' }, [h('p', { text: 'Set up your company first.' })]);
    }
    var ids = (data.scores || []).map(function (s) { return s.frameworkId; });
    var frameworkId = state.framework || ids[0];
    var body = h('div', { class: 'loading', text: 'Loading questions…' });

    var tabs = h('div', { class: 'tabs' }, ids.map(function (id) {
      return h('button', {
        class: 'tab' + (id === frameworkId ? ' active' : ''),
        text: title(id),
        onclick: function () { state.framework = id; setView('questionnaire'); },
      });
    }));

    api('/api/framework?id=' + encodeURIComponent(frameworkId)).then(function (framework) {
      body.innerHTML = '';
      framework.articles.forEach(function (article) {
        var rows = article.questionnaire.map(function (q) {
          var select = h('select', { 'data-q': q.id, 'data-f': frameworkId });
          (q.options || [{ value: '', label: '— not answered —' }]).forEach(function (option) {
            select.appendChild(h('option', { value: option.value, text: option.label }));
          });
          var row = h('div', { class: 'q' }, [
            h('div', { class: 'q-text', text: q.text }),
            q.citation ? h('div', { class: 'muted tiny', text: q.citation }) : null,
            select,
          ]);
          return row;
        });
        body.appendChild(h('div', { class: 'card article' }, [
          h('h3', { text: article.title }),
          article.reference ? h('div', { class: 'muted small', text: article.reference }) : null,
          h('div', {}, rows),
        ]));
      });
    });

    return h('div', {}, [tabs, h('p', { class: 'muted', text: 'Answer honestly. Unanswered questions count against you — which is the point.' }), body,
      h('div', { class: 'row gap-top' }, [
        h('button', {
          class: 'btn primary',
          text: 'Save answers and rescore',
          onclick: function () {
            var updates = {};
            document.querySelectorAll('select[data-q]').forEach(function (select) {
              var f = select.getAttribute('data-f');
              updates[f] = updates[f] || {};
              updates[f][select.getAttribute('data-q')] = select.value || null;
            });
            post('/api/answers', updates).then(function (result) {
              toast('Saved — readiness is now ' + Math.round(result.overall) + '%');
              return reload();
            }).catch(function (e) { toast(e.message, 'warn'); });
          },
        }),
      ]),
    ]);
  }

  function renderScan() {
    var input = h('input', { class: 'input', id: 'scan-path', placeholder: './src or an absolute path inside your project' });
    var out = h('div', {});
    return h('div', {}, [
      h('h2', { text: 'Scan your codebase' }),
      h('p', { class: 'muted', text: 'The scan runs locally and reads files only. It never executes your code and makes no network calls.' }),
      h('div', { class: 'card' }, [
        h('label', { class: 'field' }, [h('span', { text: 'Path' }), input]),
        h('button', {
          class: 'btn primary',
          text: 'Scan',
          onclick: function () {
            out.innerHTML = '<div class="loading">Scanning…</div>';
            post('/api/scan', { path: input.value || '.' }).then(function (result) {
              out.innerHTML = '';
              if (result.error) {
                out.appendChild(h('div', { class: 'card bad', text: result.error + (result.detail ? ' — ' + result.detail : '') }));
                return;
              }
              out.appendChild(h('div', { class: 'kpis' }, [
                kpi('Files scanned', result.filesScanned),
                kpi('Findings', result.summary.total),
                kpi('Gaps created', result.gaps.length),
              ]));
              out.appendChild(h('div', { class: 'card flush' }, result.findings.map(function (f) {
                return h('div', { class: 'gap' }, [
                  h('span', { class: 'sev ' + f.severity, text: f.severity }),
                  h('div', { class: 'gap-body' }, [
                    h('div', { class: 'gap-title', text: f.message }),
                    h('div', { class: 'muted small', text: f.file + ':' + f.line + '  ·  confidence ' + Math.round(f.confidence * 100) + '%' }),
                    h('div', { class: 'muted small', text: f.remediation }),
                    h('div', { class: 'muted tiny', text: f.mappings.map(function (m) { return title(m.frameworkId) + ' ' + m.articleId; }).join(', ') }),
                  ]),
                ]);
              })));
            }).catch(function (e) { out.innerHTML = ''; toast(e.message, 'warn'); });
          },
        }),
      ]),
      out,
    ]);
  }

  function renderRoadmap(data) {
    if (!data.hasProfile) return h('div', { class: 'empty' }, [h('p', { text: 'Set up your company first.' })]);
    var body = h('div', { class: 'loading', text: 'Building the plan…' });
    api('/api/roadmap').then(function (result) {
      body.innerHTML = '';
      if (result.error) { body.appendChild(h('p', { text: 'No company yet.' })); return; }
      var plan = result.roadmap;
      body.appendChild(h('div', { class: 'kpis' }, [
        kpi('Items', plan.items.length),
        kpi('Person-days', Math.round(plan.totalEffort)),
        kpi('Projected score', plan.projectedScore ? Math.round(plan.projectedScore) + '%' : '—'),
      ]));
      plan.phases.forEach(function (phase) {
        if (!phase.items.length) return;
        body.appendChild(h('h3', { text: phase.label }));
        body.appendChild(h('div', { class: 'muted small', text: phase.window + ' · ' + phase.items.length + ' items · ' + phase.effort + ' person-days' }));
        body.appendChild(h('div', { class: 'card flush' }, phase.items.map(function (item) {
          return h('div', { class: 'gap' }, [
            h('span', { class: 'sev ' + item.severity, text: item.severity }),
            h('div', { class: 'gap-body' }, [
              h('div', { class: 'gap-title', text: item.title }),
              h('div', { class: 'muted small', text: item.description || '' }),
              h('div', { class: 'muted tiny', text: item.frameworkIds.map(title).join(', ') + ' · ' + item.effort + 'd · ' + item.startDate + ' → ' + item.dueDate }),
            ]),
          ]);
        })));
      });
    });
    return h('div', {}, [h('h2', { text: '90-day roadmap' }), body]);
  }

  function renderDocuments(data) {
    var kinds = [
      ['compliance-roadmap', '90-day roadmap', 'Start here'],
      ['gdpr-ropa', 'ROPA (Art. 30)', 'Personal data processing record'],
      ['gdpr-dpia', 'DPIA (Art. 35)', 'Impact assessment'],
      ['ai-act-annex-iv', 'Annex IV documentation', 'Technical documentation'],
      ['ai-act-risk-register', 'AI risk register', 'Art. 9 risk management'],
      ['csrd-report', 'Sustainability statement', 'ESRS reporting pack'],
      ['einvoice-validation-report', 'E-invoicing report', 'EN 16931 / NF-e readiness'],
    ];
    var list = h('div', {}, (data.documents || []).map(function (doc) {
      return h('div', { class: 'card doc' }, [
        h('div', { class: 'row' }, [
          h('div', {}, [
            h('h3', { text: doc.title }),
            h('div', { class: 'muted small', text: title(doc.kind) + ' · ' + doc.format.toUpperCase() + ' · ' + doc.sections + ' sections · ' + doc.words + ' words' }),
            h('div', { class: 'muted tiny', text: doc.path }),
          ]),
        ]),
      ]);
    }));

    return h('div', {}, [
      h('h2', { text: 'Documents' }),
      h('p', { class: 'muted', text: 'Generated as print-ready PDFs into your workspace folder. Everything is editable in Word afterwards.' }),
      h('div', { class: 'grid two' }, kinds.map(function (entry) {
        return h('div', { class: 'card' }, [
          h('h3', { text: entry[1] }),
          h('div', { class: 'muted small', text: entry[2] }),
          h('button', {
            class: 'btn primary',
            text: 'Generate PDF',
            onclick: function () {
              toast('Generating ' + entry[1] + '…');
              post('/api/generate', { kind: entry[0] }).then(function (doc) {
                if (doc.error) return toast('Failed: ' + doc.error, 'warn');
                toast('Saved to ' + doc.path);
                reload();
              }).catch(function (e) { toast(e.message, 'warn'); });
            },
          }),
        ]);
      })),
      list.children.length ? h('h3', { text: 'Generated so far' }) : null,
      list,
    ]);
  }

  var VIEWS = {
    dashboard: { title: 'Dashboard', render: renderDashboard },
    company: { title: 'Company', render: renderCompany },
    questionnaire: { title: 'Questionnaire', render: renderQuestionnaire },
    scan: { title: 'Scan codebase', render: renderScan },
    roadmap: { title: 'Roadmap', render: renderRoadmap },
    documents: { title: 'Documents', render: renderDocuments },
  };

  function setView(name) {
    state.view = name;
    location.hash = name;
    document.querySelectorAll('.nav').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-view') === name);
    });
    render();
  }

  function render() {
    var view = VIEWS[state.view] || VIEWS.dashboard;
    $('#view-title').textContent = view.title;
    var target = $('#view');
    target.innerHTML = '';
    target.appendChild(view.render(state.overview));
  }

  function reload() {
    return api('/api/overview').then(function (data) {
      state.overview = data;
      $('#rail-status').textContent = data.hasProfile
        ? data.profile.name + ' · ' + Math.round(data.overall) + '%'
        : 'no company yet';
      $('#score-pill').textContent = data.hasProfile ? Math.round(data.overall) + '% · ' + (data.grade || '') : '—';
      $('#score-pill').className = 'pill ' + scoreColour(data.overall);
      render();
    }).catch(function (error) {
      $('#view').innerHTML = '<div class="card bad">' + esc(error.message) + '</div>';
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('.nav').forEach(function (button) {
      button.addEventListener('click', function () { setView(button.getAttribute('data-view')); });
    });
    $('#refresh').addEventListener('click', function () { reload(); });
    var initial = (location.hash || '#dashboard').slice(1);
    if (VIEWS[initial]) state.view = initial;
    reload();
  });
})();
</script>
</body>
</html>`;
}
