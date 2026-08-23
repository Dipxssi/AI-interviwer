import {PDFParse} from "pdf-parse";
import mammoth from "mammoth";

export async function extractResumeText(
    buffer: Buffer,
    mimetype: string,
): Promise<string> {
    if (mimetype === "application/pdf") {
        const parser = new PDFParse({ data: buffer})
        const result = await parser.getText()
        return result.text;
    }

    if (mimetype === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
        const res = await mammoth.extractRawText({ buffer})
        return res.value
    
    }

    throw new Error(`Unsupported file type: ${mimetype}`);
}