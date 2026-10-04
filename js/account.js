// account module: thông tin cá nhân + avatar (ADMIN và USER đều truy cập được)
import { supabase } from './supabase.js';
import { initLayout, createAvatar } from './layout.js';
import { createBadge, showToast } from './components.js';
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
} from './storage.js';
import { formatDate } from './utils.js';

const ROLE_BADGES = { ADMIN: 'primary', USER: 'default' };
const STATUS_BADGES = { ACTIVE: 'success', INACTIVE: 'danger' };

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

// Cập nhật avatar ở trang Account và ở header
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
  document.getElementById('account-role').replaceChildren(createBadge(profile.role, ROLE_BADGES[profile.role] || 'default'));
  document.getElementById('account-status').replaceChildren(createBadge(profile.status, STATUS_BADGES[profile.status] || 'default'));
  document.getElementById('account-created-at').textContent = formatDate(profile.created_at);
  renderAvatars();
}

function setBusy(isBusy) {
  elements.input.disabled = isBusy;
  elements.removeButton.disabled = isBusy;
  elements.uploadLabel.classList.toggle('is-disabled', isBusy);
  elements.uploadLabel.textContent = isBusy ? 'Đang xử lý...' : 'Đổi avatar';
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
    showToast('Đã cập nhật avatar.', 'success');
  } catch (error) {
    showToast(error?.name?.startsWith('Storage') ? getFriendlyStorageError(error) : 'Không thể cập nhật avatar.', 'error');
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
    showToast('Đã xóa avatar.', 'success');
  } catch {
    showToast('Không thể xóa avatar.', 'error');
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
  profile = await initLayout('Account', { adminOnly: false });
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
