import fs from "fs";
import path from "path";

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

async function extractPptx(filePath: string): Promise<string> {
  const JSZip = (await import("jszip")).default;
  const data = fs.readFileSync(filePath);
  const zip = await JSZip.loadAsync(data);

  const slides: { index: number; xml: string }[] = [];
  const notes: { index: number; xml: string }[] = [];

  zip.forEach((relativePath, entry) => {
    const mSlide = relativePath.match(/^ppt\/slides\/slide(\d+)\.xml$/);
    const mNotes = relativePath.match(/^ppt\/notesSlides\/notesSlide(\d+)\.xml$/);
    if (mSlide && !entry.dir) {
      slides.push({ index: parseInt(mSlide[1], 10), xml: "" });
    } else if (mNotes && !entry.dir) {
      notes.push({ index: parseInt(mNotes[1], 10), xml: "" });
    }
  });

  await Promise.all(
    slides.map(async (s) => {
      const file = zip.file(`ppt/slides/slide${s.index}.xml`);
      s.xml = file ? await file.async("string") : "";
    }),
  );
  await Promise.all(
    notes.map(async (n) => {
      const file = zip.file(`ppt/notesSlides/notesSlide${n.index}.xml`);
      n.xml = file ? await file.async("string") : "";
    }),
  );

  slides.sort((a, b) => a.index - b.index);
  notes.sort((a, b) => a.index - b.index);

  const extractText = (xml: string): string => {
    const runs: string[] = [];
    const re = /<a:t[^>]*>([\s\S]*?)<\/a:t>/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(xml))) runs.push(decodeXmlEntities(m[1].trim()));
    return runs.filter(Boolean).join("");
  };

  const parts: string[] = [];
  slides.forEach((s, i) => {
    const text = extractText(s.xml);
    const noteText = extractText(notes.find((n) => n.index === s.index)?.xml || "");
    parts.push(`【第 ${i + 1} 页】${text}${noteText ? `（演讲者备注：${noteText}）` : ""}`);
  });

  return parts.join("\n");
}

async function extractPdf(filePath: string): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdfjs: any = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const data = new Uint8Array(fs.readFileSync(filePath));
  const doc = await pdfjs.getDocument({ data, disableWorker: true }).promise;
  const parts: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const line = content.items
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((it: any) => (typeof it.str === "string" ? it.str : ""))
      .join(" ");
    parts.push(`【第 ${i} 页】${line}`);
  }
  await doc.destroy();
  return parts.join("\n");
}

export async function extractPptText(filePath: string): Promise<string> {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".pptx") return extractPptx(filePath);
  if (ext === ".pdf") return extractPdf(filePath);
  throw new Error(`暂不支持的文件格式: ${ext}（请上传 .pptx 或 .pdf）`);
}
