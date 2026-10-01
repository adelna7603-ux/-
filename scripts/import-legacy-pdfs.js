import { readdir, readFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const root = process.cwd();
const projectUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!projectUrl || !serviceRoleKey) {
  throw new Error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.migration first.");
}

const supabase = createClient(projectUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

const categoryFor = filename => {
  const name = filename.toLocaleLowerCase();
  if (name.includes("مذكرة") || name.includes("مذاكرة") || name.includes("الشوبكي")) return {
    slug: "centers", ar: "سناتر", en: "Study Centers"
  };
  if (name.includes("financial management") || name.includes("مالية")) return {
    slug: "finance", ar: "إدارة مالية", en: "Financial Management"
  };
  if (name.includes("منشات") || name.includes("منشآت")) return {
    slug: "establishments", ar: "منشآت", en: "Business Establishments"
  };
  return { slug: "review", ar: "مراجعة", en: "Revision" };
};

const pdfNames = (await readdir(root, { withFileTypes: true }))
  .filter(entry => entry.isFile() && extname(entry.name).toLocaleLowerCase() === ".pdf")
  .map(entry => entry.name);

for (const filename of pdfNames) {
  const { data: existing, error: lookupError } = await supabase
    .from("library_items")
    .select("id")
    .eq("source_filename", filename)
    .maybeSingle();
  if (lookupError) throw lookupError;
  if (existing) {
    console.log(`Skipped existing: ${filename}`);
    continue;
  }

  const filePath = join(root, filename);
  const fileBuffer = await readFile(filePath);
  const category = categoryFor(filename);
  const storagePath = `legacy/${randomUUID()}/${basename(filename)}`;
  const { error: uploadError } = await supabase.storage.from("pdfs").upload(storagePath, fileBuffer, {
    contentType: "application/pdf",
    cacheControl: "3600",
    upsert: false
  });
  if (uploadError) throw uploadError;

  const { data: publicUrl } = supabase.storage.from("pdfs").getPublicUrl(storagePath);
  const title = basename(filename, extname(filename));
  const { error: insertError } = await supabase.from("library_items").insert({
    content_type: "file",
    title_ar: title,
    title_en: title,
    description_ar: "",
    description_en: "",
    category: category.slug,
    category_ar: category.ar,
    category_en: category.en,
    pdf_url: publicUrl.publicUrl,
    pdf_path: storagePath,
    pdf_size: fileBuffer.byteLength,
    is_published: true,
    allow_download: true,
    source_filename: filename
  });

  if (insertError) {
    await supabase.storage.from("pdfs").remove([storagePath]);
    throw insertError;
  }
  console.log(`Imported: ${filename}`);
}

console.log(`Finished. Processed ${pdfNames.length} local PDF file(s).`);