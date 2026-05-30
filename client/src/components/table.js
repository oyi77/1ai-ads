/**
 * Table component with sorting and pagination.
 *
 * Usage:
 *   Table({
 *     columns: [
 *       { key: 'name', label: 'Name', sortable: true },
 *       { key: 'status', label: 'Status', render: (v) => Badge(v) },
 *     ],
 *     data: campaigns,
 *     onRowClick: (row) => viewCampaign(row.id),
 *   })
 */
export function Table({ columns, data = [], onRowClick, emptyMessage = 'No data found' }) {
  if (!data.length) {
    return `<div class="p-8 text-center text-slate-400">${escapeHtml(emptyMessage)}</div>`;
  }

  const headers = columns.map(col =>
    `<th class="text-left p-3 ${col.sortable ? 'cursor-pointer hover:text-white' : ''}" data-sort-key="${col.key}">${escapeHtml(col.label)}</th>`
  ).join('');

  const rows = data.map(row => {
    const cells = columns.map(col => {
      const value = row[col.key];
      const rendered = col.render ? col.render(value, row) : escapeHtml(String(value ?? '-'));
      return `<td class="p-3">${rendered}</td>`;
    }).join('');
    return `<tr class="border-t border-slate-700 hover:bg-slate-750 ${onRowClick ? 'cursor-pointer' : ''}" data-id="${row.id || ''}">${cells}</tr>`;
  }).join('');

  return `
    <div class="overflow-x-auto">
      <table class="w-full text-sm">
        <thead class="bg-slate-900"><tr>${headers}</tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
