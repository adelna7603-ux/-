import { supabase, configurationError } from "../src/supabase.js";

const loginPanel = document.getElementById("loginPanel");
const dashboard = document.getElementById("dashboard");
const loginForm = document.getElementById("loginForm");
const loginMessage = document.getElementById("loginMessage");
const form = document.getElementById("itemForm");
const formMessage = document.getElementById("formMessage");
const rows = document.getElementById("manageRows");
const categoryFilter = document.getElementById("categoryFilter");
let items = [];
let toastTimer;
let contentChannel = null;

function showMessage(element, message, isError = false) {
  element.textContent = message;
  element.classList.toggle("error", isError);
}

function notify(message) {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("visible"), 2800);
}

function setView(name) {
  for (const view of ["overview", "editor", "manage"]) {
    document.getElementById(`${view}View`).hidden = view !== name;
  }
  for (const button of document.querySelectorAll(".nav-button")) {
    button.classList.toggle("active", button.dataset.view === name);
  }
  if (name === "editor" && !document.getElementById("itemId").value) resetForm();
}

function showLogin(message = "") {
    if (contentChannel && supabase) {
      supabase.removeChannel(contentChannel);
      contentChannel = null;
    }
  dashboard.hidden = true;
  loginPanel.hidden = false;
  showMessage(loginMessage, message, Boolean(message));
}

async function authorize(session) {
  if (!session || !supabase) {
    showLogin();
    return;
  }
  const { data, error } = await supabase.rpc("is_admin");
  if (error || data !== true) {
    await supabase.auth.signOut();
    showLogin("هذا الحساب غير مخوّل لإدارة المحتوى.");
    return;
  }
  loginPanel.hidden = true;
  dashboard.hidden = false;
  if (!contentChannel) {
    contentChannel = supabase.channel("admin-library-items-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "library_items" }, loadItems)
      .subscribe();
  }
  await loadItems();
}

async function loadItems() {
  const { data, error } = await supabase.from("library_items").select("*").order("created_at", { ascending: false });
  if (error) {
    notify("تعذر تحميل المحتوى. تحقق من اتصال Supabase وصلاحيات RLS.");
    return;
  }
  items = data || [];
  renderDashboard();
  renderManageList();
}

function renderDashboard() {
  const published = items.filter(item => item.is_published);
  document.getElementById("fileMetric").textContent = items.filter(item => item.content_type === "file").length;
  document.getElementById("courseMetric").textContent = items.filter(item => item.content_type === "course").length;
  document.getElementById("publishedMetric").textContent = published.length;
  document.getElementById("hiddenMetric").textContent = items.length - published.length;
  const container = document.getElementById("recentRows");
  container.replaceChildren();
  document.getElementById("recentEmpty").hidden = items.length > 0;
  for (const item of items.slice(0, 6)) {
    const row = document.createElement("tr");
    const title = document.createElement("td");
    title.textContent = item.title_ar;
    const type = document.createElement("td");
    type.textContent = item.content_type === "course" ? "كورس" : "PDF";
    const category = document.createElement("td");
    category.textContent = item.category_ar;
    const date = document.createElement("td");
    date.textContent = formatDate(item.created_at);
    const status = document.createElement("td");
    status.append(statusBadge(item.is_published));
    row.append(title, type, category, date, status);
    container.append(row);
  }
}

function statusBadge(isPublished) {
  const badge = document.createElement("span");
  badge.className = `status${isPublished ? "" : " hidden-status"}`;
  badge.textContent = isPublished ? "منشور" : "مخفي";
  return badge;
}

function formatDate(date) {
  return new Date(date).toLocaleDateString("ar-EG", { year: "numeric", month: "short", day: "numeric" });
}

function renderManageList() {
  const query = document.getElementById("manageSearch").value.trim().toLocaleLowerCase();
  const category = categoryFilter.value;
  const type = document.getElementById("typeFilter").value;
  const filtered = items.filter(item => {
    const searchable = `${item.title_ar} ${item.title_en} ${item.category_ar} ${item.category_en}`.toLocaleLowerCase();
    return searchable.includes(query) && (!category || item.category === category) && (!type || item.content_type === type);
  });
  rows.replaceChildren();
  document.getElementById("manageEmpty").hidden = filtered.length > 0;
  for (const item of filtered) {
    const row = document.createElement("tr");
    const imageCell = document.createElement("td");
    if (item.thumbnail_url) {
      const image = document.createElement("img");
      image.className = "thumb";
      image.src = item.thumbnail_url;
      image.alt = "";
      image.loading = "lazy";
      imageCell.append(image);
    } else {
      imageCell.textContent = "—";
    }
    const title = document.createElement("td");
    title.textContent = item.title_ar;
    const categoryCell = document.createElement("td");
    categoryCell.textContent = item.category_ar;
    const date = document.createElement("td");
    date.textContent = formatDate(item.created_at);
    const status = document.createElement("td");
    status.append(statusBadge(item.is_published));
    const actions = document.createElement("td");
    const actionGroup = document.createElement("div");
    actionGroup.className = "row-actions";
    actionGroup.append(
      actionButton("تعديل", () => editItem(item)),
      actionButton(item.is_published ? "إخفاء" : "نشر", () => togglePublished(item)),
      actionButton("حذف", () => deleteItem(item), "danger")
    );
    actions.append(actionGroup);
    row.append(imageCell, title, categoryCell, date, status, actions);
    rows.append(row);
  }

  const selected = categoryFilter.value;
  const categories = [...new Map(items.map(item => [item.category, item])).values()];
  categoryFilter.replaceChildren(new Option("كل التصنيفات", ""));
  for (const item of categories) categoryFilter.add(new Option(item.category_ar, item.category));
  categoryFilter.value = categories.some(item => item.category === selected) ? selected : "";
}

function actionButton(label, handler, style = "") {
  const button = document.createElement("button");
  button.className = `button${style ? ` ${style}` : ""}`;
  button.type = "button";
  button.textContent = label;
  button.addEventListener("click", handler);
  return button;
}

function makeCategorySlug(value) {
  return value.trim().toLocaleLowerCase().normalize("NFKC").replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "");
}

function resetForm() {
  form.reset();
  document.getElementById("itemId").value = "";
  document.getElementById("editorTitle").textContent = "إضافة محتوى";
  document.getElementById("saveButton").textContent = "إضافة المحتوى";
  document.getElementById("cancelEditButton").hidden = true;
  document.getElementById("isPublished").checked = true;
  document.getElementById("allowDownload").checked = true;
  document.getElementById("contentType").value = "file";
  document.getElementById("pdfFile").required = true;
  showMessage(formMessage, "");
}

function editItem(item) {
  setView("editor");
  document.getElementById("itemId").value = item.id;
  document.getElementById("contentType").value = item.content_type;
  document.getElementById("titleAr").value = item.title_ar;
  document.getElementById("titleEn").value = item.title_en;
  document.getElementById("descriptionAr").value = item.description_ar || "";
  document.getElementById("descriptionEn").value = item.description_en || "";
  document.getElementById("categoryAr").value = item.category_ar;
  document.getElementById("categoryEn").value = item.category_en;
  document.getElementById("isPublished").checked = item.is_published;
  document.getElementById("allowDownload").checked = item.allow_download;
  document.getElementById("pdfFile").required = item.content_type === "file" && !item.pdf_url;
  document.getElementById("editorTitle").textContent = "تعديل المحتوى";
  document.getElementById("saveButton").textContent = "حفظ التعديلات";
  document.getElementById("cancelEditButton").hidden = false;
  showMessage(formMessage, "اترك حقول الملفات فارغة للاحتفاظ بالملفات الحالية.");
}

async function uploadFile(bucket, file, userId) {
  if (!file) return null;
  const extension = file.name.split(".").pop().toLocaleLowerCase();
  const path = `${userId}/${crypto.randomUUID()}.${extension}`;
  const { error } = await supabase.storage.from(bucket).upload(path, file, {
    contentType: file.type,
    cacheControl: "3600",
    upsert: false
  });
  if (error) throw error;
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return { path, url: data.publicUrl };
}

async function handleSave(event) {
  event.preventDefault();
  const button = document.getElementById("saveButton");
  const originalLabel = button.textContent;
  button.disabled = true;
  button.textContent = "جارٍ الحفظ والرفع...";
  showMessage(formMessage, "");
  const newPaths = { pdf: null, thumbnail: null };
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session.user.id;
    const id = document.getElementById("itemId").value;
    const existing = items.find(item => item.id === id);
    const contentType = document.getElementById("contentType").value;
    const pdfFile = document.getElementById("pdfFile").files[0];
    const thumbnailFile = document.getElementById("thumbnailFile").files[0];
    if (pdfFile && (pdfFile.type !== "application/pdf" || pdfFile.size > 50 * 1024 * 1024)) throw new Error("ملف PDF يجب أن يكون صالحًا وألا يتجاوز 50 ميجابايت.");
    if (thumbnailFile && (!/^image\/(jpeg|png|webp)$/.test(thumbnailFile.type) || thumbnailFile.size > 5 * 1024 * 1024)) throw new Error("الصورة يجب أن تكون JPG أو PNG أو WebP وألا تتجاوز 5 ميجابايت.");
    if (contentType === "file" && !pdfFile && !existing?.pdf_url) throw new Error("اختر ملف PDF لإضافته.");

    if (pdfFile) newPaths.pdf = await uploadFile("pdfs", pdfFile, userId);
    if (thumbnailFile) newPaths.thumbnail = await uploadFile("thumbnails", thumbnailFile, userId);
    const categoryAr = document.getElementById("categoryAr").value.trim();
    const categoryEn = document.getElementById("categoryEn").value.trim();
    const record = {
      content_type: contentType,
      title_ar: document.getElementById("titleAr").value.trim(),
      title_en: document.getElementById("titleEn").value.trim(),
      description_ar: document.getElementById("descriptionAr").value.trim(),
      description_en: document.getElementById("descriptionEn").value.trim(),
      category: makeCategorySlug(categoryEn || categoryAr),
      category_ar: categoryAr,
      category_en: categoryEn,
      pdf_url: newPaths.pdf?.url || existing?.pdf_url || null,
      pdf_path: newPaths.pdf?.path || existing?.pdf_path || null,
      pdf_size: pdfFile?.size || existing?.pdf_size || null,
      thumbnail_url: newPaths.thumbnail?.url || existing?.thumbnail_url || null,
      thumbnail_path: newPaths.thumbnail?.path || existing?.thumbnail_path || null,
      is_published: document.getElementById("isPublished").checked,
      allow_download: document.getElementById("allowDownload").checked
    };
    const result = id
      ? await supabase.from("library_items").update(record).eq("id", id).select().single()
      : await supabase.from("library_items").insert(record).select().single();
    if (result.error) throw result.error;

    if (existing) {
      const removed = [];
      if (newPaths.pdf && existing.pdf_path) removed.push(supabase.storage.from("pdfs").remove([existing.pdf_path]));
      if (newPaths.thumbnail && existing.thumbnail_path) removed.push(supabase.storage.from("thumbnails").remove([existing.thumbnail_path]));
      await Promise.allSettled(removed);
    }
    resetForm();
    await loadItems();
    showToast(id ? "تم حفظ التعديلات بنجاح." : "تمت إضافة المحتوى بنجاح.");
    setView("manage");
  } catch (error) {
    const uploadedRemovals = [];
    if (newPaths.pdf) uploadedRemovals.push(supabase.storage.from("pdfs").remove([newPaths.pdf.path]));
    if (newPaths.thumbnail) uploadedRemovals.push(supabase.storage.from("thumbnails").remove([newPaths.thumbnail.path]));
    await Promise.allSettled(uploadedRemovals);
    showMessage(formMessage, error.message || "تعذر حفظ المحتوى.", true);
  } finally {
    button.disabled = false;
    button.textContent = originalLabel;
  }
}

async function togglePublished(item) {
  const { error } = await supabase.from("library_items").update({ is_published: !item.is_published }).eq("id", item.id);
  if (error) {
    notify("تعذر تحديث حالة النشر.");
    return;
  }
  await loadItems();
  notify(item.is_published ? "تم إخفاء المحتوى." : "تم نشر المحتوى.");
}

async function deleteItem(item) {
  if (!window.confirm(`هل تريد حذف «${item.title_ar}» نهائيًا؟`)) return;
  const { error } = await supabase.from("library_items").delete().eq("id", item.id);
  if (error) {
    notify("تعذر حذف المحتوى.");
    return;
  }
  const removals = [];
  if (item.pdf_path) removals.push(supabase.storage.from("pdfs").remove([item.pdf_path]));
  if (item.thumbnail_path) removals.push(supabase.storage.from("thumbnails").remove([item.thumbnail_path]));
  await Promise.allSettled(removals);
  await loadItems();
  notify("تم حذف المحتوى.");
}

loginForm.addEventListener("submit", async event => {
  event.preventDefault();
  if (!supabase) {
    showMessage(loginMessage, configurationError, true);
    return;
  }
  const button = loginForm.querySelector("button[type=submit]");
  button.disabled = true;
  showMessage(loginMessage, "جارٍ تسجيل الدخول...");
  const { data, error } = await supabase.auth.signInWithPassword({
    email: document.getElementById("loginEmail").value,
    password: document.getElementById("loginPassword").value
  });
  button.disabled = false;
  if (error) {
    showMessage(loginMessage, "تعذر تسجيل الدخول. تحقق من البيانات وإعداد Auth.", true);
    return;
  }
  await authorize(data.session);
});

form.addEventListener("submit", handleSave);
document.getElementById("cancelEditButton").addEventListener("click", () => { resetForm(); setView("manage"); });
document.getElementById("contentType").addEventListener("change", event => {
  document.getElementById("pdfFile").required = event.target.value === "file" && !document.getElementById("itemId").value;
});
document.getElementById("signOutButton").addEventListener("click", async () => {
  await supabase.auth.signOut();
  showLogin();
});
document.getElementById("refreshButton").addEventListener("click", loadItems);
document.getElementById("manageSearch").addEventListener("input", renderManageList);
categoryFilter.addEventListener("change", renderManageList);
document.getElementById("typeFilter").addEventListener("change", renderManageList);
for (const button of document.querySelectorAll("[data-view]")) button.addEventListener("click", () => setView(button.dataset.view));
for (const button of document.querySelectorAll("[data-go]")) button.addEventListener("click", () => setView(button.dataset.go));

document.getElementById("pdfFile").addEventListener("change", event => {
  const file = event.target.files[0];
  if (file && (file.type !== "application/pdf" || file.size > 50 * 1024 * 1024)) {
    event.target.value = "";
    showMessage(formMessage, "ملف PDF يجب أن يكون صالحًا وألا يتجاوز 50 ميجابايت.", true);
  }
});

document.getElementById("thumbnailFile").addEventListener("change", event => {
  const file = event.target.files[0];
  if (file && (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size > 5 * 1024 * 1024)) {
    event.target.value = "";
    showMessage(formMessage, "الصورة يجب أن تكون JPG أو PNG أو WebP وألا تتجاوز 5 ميجابايت.", true);
  }
});

document.getElementById("pdfHint").textContent = "PDF حتى 50 ميجابايت. مطلوب للملف ويمكن إضافته للكورس.";
document.getElementById("isPublished").addEventListener("change", event => {
  document.getElementById("saveButton").textContent = event.target.checked ? "حفظ ونشر" : "حفظ كمسودة";
});

if (!supabase) showLogin(configurationError);
else {
  supabase.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_OUT") showLogin();
  });
  supabase.auth.getSession().then(({ data }) => authorize(data.session));
}