// ============================================
// FINANÇAS PRO — Chart.js Wrappers
// ============================================

import { formatCurrency, getCategoryColor } from '../utils.js';

let chartInstances = {};

export function destroyChart(canvasId) {
  if (chartInstances[canvasId]) {
    chartInstances[canvasId].destroy();
    delete chartInstances[canvasId];
  }
}

export function destroyAllCharts() {
  Object.keys(chartInstances).forEach(id => {
    chartInstances[id].destroy();
  });
  chartInstances = {};
}

export function createDoughnutChart(canvasId, labels, data, colors) {
  destroyChart(canvasId);
  const canvas = document.getElementById(canvasId);
  if (!canvas) return null;

  const ctx = canvas.getContext('2d');
  const chart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: colors || labels.map((_, i) => getCategoryColor(i)),
        borderWidth: 2,
        borderColor: '#FFFFFF',
        hoverOffset: 8,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '65%',
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            padding: 16,
            usePointStyle: true,
            pointStyleWidth: 10,
            font: { family: 'Inter', size: 12 },
            color: '#525252',
          },
        },
        tooltip: {
          backgroundColor: '#171717',
          titleFont: { family: 'Inter', size: 13, weight: '600' },
          bodyFont: { family: 'Inter', size: 12 },
          padding: 12,
          cornerRadius: 8,
          callbacks: {
            label: function (context) {
              const total = context.dataset.data.reduce((a, b) => a + b, 0);
              const pct = total > 0 ? ((context.raw / total) * 100).toFixed(1) : 0;
              return ` ${context.label}: ${formatCurrency(context.raw)} (${pct}%)`;
            },
          },
        },
      },
      animation: {
        animateRotate: true,
        duration: 800,
      },
    },
  });

  chartInstances[canvasId] = chart;
  return chart;
}

export function createBarChart(canvasId, labels, data, colors, horizontal = false) {
  destroyChart(canvasId);
  const canvas = document.getElementById(canvasId);
  if (!canvas) return null;

  // Support multi-dataset mode: data = [{ label, data, color }, ...]
  const isMultiDataset = Array.isArray(data) && data.length > 0 && typeof data[0] === 'object' && 'data' in data[0];

  const ctx = canvas.getContext('2d');

  const datasets = isMultiDataset
    ? data.map((ds, i) => ({
        label: ds.label,
        data: ds.data,
        backgroundColor: ds.color || getCategoryColor(i),
        borderRadius: 6,
        borderSkipped: false,
        maxBarThickness: 36,
      }))
    : [{
        data,
        backgroundColor: colors || labels.map((_, i) => getCategoryColor(i)),
        borderRadius: 6,
        borderSkipped: false,
        barThickness: horizontal ? 24 : undefined,
        maxBarThickness: 40,
      }];

  const chart = new Chart(ctx, {
    type: 'bar',
    data: { labels, datasets },
    options: {
      indexAxis: horizontal ? 'y' : 'x',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: isMultiDataset,
          position: 'top',
          labels: {
            padding: 16,
            usePointStyle: true,
            font: { family: 'Inter', size: 12 },
            color: '#525252',
          },
        },
        tooltip: {
          backgroundColor: '#171717',
          titleFont: { family: 'Inter', size: 13, weight: '600' },
          bodyFont: { family: 'Inter', size: 12 },
          padding: 12,
          cornerRadius: 8,
          callbacks: {
            label: (ctx) => ` ${ctx.dataset.label ? ctx.dataset.label + ': ' : ''}${formatCurrency(ctx.raw)}`,
          },
        },
      },
      scales: {
        x: {
          grid: { display: !horizontal, color: 'rgba(0,0,0,0.04)' },
          ticks: {
            font: { family: 'Inter', size: 11 },
            color: '#737373',
            callback: horizontal ? (v) => formatCurrency(v) : undefined,
          },
        },
        y: {
          grid: { display: horizontal, color: 'rgba(0,0,0,0.04)' },
          ticks: {
            font: { family: 'Inter', size: 11 },
            color: '#737373',
            callback: !horizontal ? (v) => formatCurrency(v) : undefined,
          },
        },
      },
      animation: { duration: 600 },
    },
  });

  chartInstances[canvasId] = chart;
  return chart;
}

export function createLineChart(canvasId, labels, datasets, extraOptions = {}) {
  destroyChart(canvasId);
  const canvas = document.getElementById(canvasId);
  if (!canvas) return null;

  const ctx = canvas.getContext('2d');

  const processedDatasets = datasets.map((ds, i) => ({
    label: ds.label,
    data: ds.data,
    borderColor: ds.color || getCategoryColor(i),
    backgroundColor: (ds.color || getCategoryColor(i)) + '15',
    borderWidth: 2.5,
    pointRadius: 4,
    pointHoverRadius: 6,
    pointBackgroundColor: '#FFFFFF',
    pointBorderColor: ds.color || getCategoryColor(i),
    pointBorderWidth: 2,
    fill: ds.fill !== undefined ? ds.fill : true,
    tension: 0.4,
  }));

  const chart = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets: processedDatasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          display: datasets.length > 1,
          position: 'top',
          labels: {
            padding: 16,
            usePointStyle: true,
            font: { family: 'Inter', size: 12 },
            color: '#525252',
          },
        },
        tooltip: {
          backgroundColor: '#171717',
          titleFont: { family: 'Inter', size: 13, weight: '600' },
          bodyFont: { family: 'Inter', size: 12 },
          padding: 12,
          cornerRadius: 8,
          callbacks: {
            label: (ctx) => ` ${ctx.dataset.label}: ${formatCurrency(ctx.raw)}`,
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: {
            font: { family: 'Inter', size: 11 },
            color: '#737373',
          },
        },
        y: {
          grid: { color: 'rgba(0,0,0,0.04)' },
          ticks: {
            font: { family: 'Inter', size: 11 },
            color: '#737373',
            callback: (v) => formatCurrency(v),
          },
        },
      },
      animation: { duration: 600 },
      ...(extraOptions.onHover ? { onHover: extraOptions.onHover } : {}),
    },
  });

  chartInstances[canvasId] = chart;
  return chart;
}

export function createComparisonBarChart(canvasId, labels, currentData, previousData) {
  destroyChart(canvasId);
  const canvas = document.getElementById(canvasId);
  if (!canvas) return null;

  const ctx = canvas.getContext('2d');
  const chart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Mês Atual',
          data: currentData,
          backgroundColor: '#3B82F6',
          borderRadius: 6,
          borderSkipped: false,
        },
        {
          label: 'Mês Anterior',
          data: previousData,
          backgroundColor: '#D9D9D9',
          borderRadius: 6,
          borderSkipped: false,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'top',
          labels: {
            padding: 16,
            usePointStyle: true,
            font: { family: 'Inter', size: 12 },
            color: '#525252',
          },
        },
        tooltip: {
          backgroundColor: '#171717',
          titleFont: { family: 'Inter', size: 13, weight: '600' },
          bodyFont: { family: 'Inter', size: 12 },
          padding: 12,
          cornerRadius: 8,
          callbacks: {
            label: (ctx) => ` ${ctx.dataset.label}: ${formatCurrency(ctx.raw)}`,
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { font: { family: 'Inter', size: 11 }, color: '#737373' },
        },
        y: {
          grid: { color: 'rgba(0,0,0,0.04)' },
          ticks: {
            font: { family: 'Inter', size: 11 },
            color: '#737373',
            callback: (v) => formatCurrency(v),
          },
        },
      },
      animation: { duration: 600 },
    },
  });

  chartInstances[canvasId] = chart;
  return chart;
}
