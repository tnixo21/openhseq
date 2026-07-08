/* ==========================================================================
   OpenHSEQ — i18n.js
   Lightweight UI translation. Translates static chrome via [data-i18n]
   attributes and exposes t() for selected dynamic strings. Data entered by
   users (report titles etc.) is never translated.
   Languages: English, Español, 简体中文. Extend DICT to add more.
   ========================================================================== */
(function (global) {
  'use strict';

  var LANGS = [{ code: 'en', name: 'English' }, { code: 'es', name: 'Español' }, { code: 'zh', name: '简体中文' }];

  var DICT = {
    en: {
      'nav.dashboard': 'Dashboard', 'nav.new': 'Raise Report', 'nav.cases': 'Cases',
      'nav.actions': 'Actions', 'nav.risk': 'Risk Matrix', 'nav.audits': 'Audits',
      'nav.documents': 'Documents', 'nav.qr': 'QR Codes', 'nav.reports': 'Reports', 'nav.settings': 'Settings',
      'app.tagline': 'Reports & Analytics', 'safety.days': 'days since last recordable incident',
      'dash.title': 'Dashboard', 'dash.sub': 'Live overview of all HSEQ reports.',
      'new.title': 'Raise a Report', 'cases.title': 'Cases', 'actions.title': 'Action Register',
      'risk.title': 'Risk Matrix', 'audits.title': 'Audits', 'docs.title': 'Document Centre',
      'reports.title': 'Report Builder', 'settings.title': 'Settings',
      'btn.submit': 'Submit report', 'btn.clear': 'Clear', 'btn.reset': 'Reset', 'btn.save': 'Save',
      'status.open': 'Open', 'status.inprogress': 'In Progress', 'status.closed': 'Closed'
    },
    es: {
      'nav.dashboard': 'Panel', 'nav.new': 'Crear informe', 'nav.cases': 'Casos',
      'nav.actions': 'Acciones', 'nav.risk': 'Matriz de riesgo', 'nav.audits': 'Auditorías',
      'nav.documents': 'Documentos', 'nav.qr': 'Códigos QR', 'nav.reports': 'Informes', 'nav.settings': 'Ajustes',
      'app.tagline': 'Informes y análisis', 'safety.days': 'días desde el último incidente registrable',
      'dash.title': 'Panel', 'dash.sub': 'Resumen en vivo de todos los informes HSEQ.',
      'new.title': 'Crear un informe', 'cases.title': 'Casos', 'actions.title': 'Registro de acciones',
      'risk.title': 'Matriz de riesgo', 'audits.title': 'Auditorías', 'docs.title': 'Centro de documentos',
      'reports.title': 'Generador de informes', 'settings.title': 'Ajustes',
      'btn.submit': 'Enviar informe', 'btn.clear': 'Limpiar', 'btn.reset': 'Restablecer', 'btn.save': 'Guardar',
      'status.open': 'Abierto', 'status.inprogress': 'En curso', 'status.closed': 'Cerrado'
    },
    zh: {
      'nav.dashboard': '仪表板', 'nav.new': '上报', 'nav.cases': '案例',
      'nav.actions': '行动', 'nav.risk': '风险矩阵', 'nav.audits': '审核',
      'nav.documents': '文档', 'nav.qr': '二维码', 'nav.reports': '报告', 'nav.settings': '设置',
      'app.tagline': '报告与分析', 'safety.days': '距上次可记录事故的天数',
      'dash.title': '仪表板', 'dash.sub': '所有 HSEQ 报告的实时概览。',
      'new.title': '上报记录', 'cases.title': '案例', 'actions.title': '行动登记',
      'risk.title': '风险矩阵', 'audits.title': '审核', 'docs.title': '文档中心',
      'reports.title': '报告生成器', 'settings.title': '设置',
      'btn.submit': '提交报告', 'btn.clear': '清除', 'btn.reset': '重置', 'btn.save': '保存',
      'status.open': '待处理', 'status.inprogress': '处理中', 'status.closed': '已关闭'
    }
  };

  var current = 'en';

  function t(key) { return (DICT[current] && DICT[current][key]) || DICT.en[key] || key; }

  function apply(lang) {
    if (lang) current = DICT[lang] ? lang : 'en';
    document.documentElement.setAttribute('lang', current);
    Array.prototype.forEach.call(document.querySelectorAll('[data-i18n]'), function (el) {
      var v = t(el.getAttribute('data-i18n'));
      if (v) el.textContent = v;
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-i18n-ph]'), function (el) {
      var v = t(el.getAttribute('data-i18n-ph'));
      if (v) el.setAttribute('placeholder', v);
    });
  }

  function setLang(lang) {
    current = DICT[lang] ? lang : 'en';
    if (global.HSEQStore) global.HSEQStore.saveSettings({ lang: current });
    apply();
  }

  function init() {
    if (global.HSEQStore) current = global.HSEQStore.getSettings().lang || 'en';
    apply();
  }

  global.HSEQI18n = { t: t, apply: apply, setLang: setLang, init: init, LANGS: LANGS, current: function () { return current; } };
})(window);
