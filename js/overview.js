// Trang Tổng quan (index.html): checklist "Bắt đầu quản trị" cho admin mới.
// Thống kê và biểu đồ nằm ở trang Dashboard (dashboard.html, js/dashboard.js).
import { initLayout } from './layout.js?v=202610180851';
import { renderAdminChecklist } from './admin-checklist.js?v=202610180851';

async function initOverviewPage() {
  const profile = await initLayout('Tổng quan');
  if (!profile) return;
  await renderAdminChecklist(document.getElementById('admin-checklist'));
}

initOverviewPage();
