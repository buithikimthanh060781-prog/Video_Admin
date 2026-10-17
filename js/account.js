// Trang Tài khoản: thông tin cá nhân + ảnh đại diện (ADMIN và USER đều truy cập được)
import { supabase } from './supabase.js?v=202610171951';
import { MEMBER_STATUSES, ROLE_LABELS } from './auth.js?v=202610171951';
import { initLayout, createAvatar } from './layout.js?v=202610171951';
import { createBadge, showToast } from './components.js?v=202610171951';
import {
  BUCKETS,
  FILE_RULES,
  buildStoragePath,
  getFriendlyStorageError,
  getPathFromPublicUrl,
  getPublicUrl,
  removeFiles,
  uploadFile,
  validateFile,
} from './storage.js?v=202610171951';
import { formatDate } from './utils.js?v=202610171951';

let profile = null;
const elements = {};

// ---------- Data ----------

async function updateAvatarUrl(avatarUrl) {
  const { data, error } = await supabase
    .from('profiles')
    .update({ avatar_url: avatarUrl })
    .eq('id', profile.id)
    .select('avatar_url')
    .single();
  if (error) throw error;
  return data.avatar_url;
}

// ---------- Render ----------

function replaceAvatar(target, className) {
  target.replaceWith(Object.assign(createAvatar(profile, className), { id: target.id }));
}

// Cập nhật ảnh đại diện ở trang Tài khoản và ở header
function renderAvatars() {
  replaceAvatar(document.getElementById('account-avatar'), 'avatar avatar-xl');
  document.querySelectorAll('.user-menu-trigger .avatar').forEach((avatar) => {
    avatar.replaceWith(createAvatar(profile));
  });
  elements.removeButton.hidden = !profile.avatar_url;
}

function renderAccount() {
  document.getElementById('account-username').textContent = profile.username;
  document.getElementById('account-email').textContent = profile.email;
  const role = ROLE_LABELS[profile.role] || { label: profile.role, badge: 'default' };
  const status = MEMBER_STATUSES[profile.status] || { label: profile.status, badge: 'default' };
  document.getElementById('account-role').replaceChildren(createBadge(role.label, role.badge));
  document.getElementById('account-status').replaceChildren(createBadge(status.label, status.badge));
  document.getElementById('account-created-at').textContent = formatDate(profile.created_at);
  renderAvatars();
}

function setBusy(isBusy) {
  elements.input.disabled = isBusy;
  elements.removeButton.disabled = isBusy;
  elements.uploadLabel.classList.toggle('is-disabled', isBusy);
  elements.uploadLabel.textContent = isBusy ? 'Đang xử lý...' : 'Đổi ảnh đại diện';
}

// ---------- Actions ----------

async function changeAvatar(file) {
  const oldPath = getPathFromPublicUrl(BUCKETS.avatars, profile.avatar_url);
  const newPath = buildStoragePath(profile.id, file);
  setBusy(true);
  try {
    await uploadFile(BUCKETS.avatars, newPath, file);
    try {
      profile.avatar_url = await updateAvatarUrl(getPublicUrl(BUCKETS.avatars, newPath));
    } catch (error) {
      await removeFiles(BUCKETS.avatars, [newPath]);
      throw error;
    }
    await removeFiles(BUCKETS.avatars, [oldPath]);
    renderAvatars();
    showToast('Đã cập nhật ảnh đại diện.', 'success');
  } catch (error) {
    showToast(error?.name?.startsWith('Storage') ? getFriendlyStorageError(error) : 'Không thể cập nhật ảnh đại diện.', 'error');
  } finally {
    setBusy(false);
  }
}

async function removeAvatar() {
  const oldPath = getPathFromPublicUrl(BUCKETS.avatars, profile.avatar_url);
  setBusy(true);
  try {
    profile.avatar_url = await updateAvatarUrl(null);
    await removeFiles(BUCKETS.avatars, [oldPath]);
    renderAvatars();
    showToast('Đã xóa ảnh đại diện.', 'success');
  } catch {
    showToast('Không thể xóa ảnh đại diện.', 'error');
  } finally {
    setBusy(false);
  }
}

function handleAvatarSelected() {
  const file = elements.input.files[0];
  elements.input.value = '';
  if (!file) return;
  const error = validateFile(file, FILE_RULES.avatar);
  elements.error.textContent = error;
  if (!error) changeAvatar(file);
}

// ---------- Init ----------

async function initAccountPage() {
  profile = await initLayout('Tài khoản', { adminOnly: false });
  if (!profile) return;

  elements.input = document.getElementById('avatar-input');
  elements.removeButton = document.getElementById('avatar-remove');
  elements.uploadLabel = document.querySelector('label[for="avatar-input"]');
  elements.error = document.getElementById('avatar-error');

  elements.input.addEventListener('change', handleAvatarSelected);
  elements.removeButton.addEventListener('click', removeAvatar);
  renderAccount();
}

initAccountPage();
