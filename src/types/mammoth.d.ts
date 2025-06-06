declare module 'mammoth' {
  export interface MammothOptions {
    buffer?: Buffer;
    path?: string;
    styleMap?: string | string[];
    includeDefaultStyleMap?: boolean;
    includeEmbeddedStyleMap?: boolean;
    convertImage?: (image: ImageElement) => Promise<ImageResult>;
    ignoreEmptyParagraphs?: boolean;
    idPrefix?: string;
    transformDocument?: (document: Document) => Document;
  }

  export interface ImageElement {
    contentType: string;
    buffer: Buffer;
    read: () => Promise<Buffer>;
  }

  export interface ImageResult {
    src: string;
  }

  export interface Document {
    children: any[];
  }

  export interface ExtractedResult {
    value: string;
    messages: { type: string; message: string }[];
  }

  export function extractRawText(options: MammothOptions): Promise<ExtractedResult>;
  export function convertToHtml(options: MammothOptions): Promise<ExtractedResult>;
  export function convertToMarkdown(options: MammothOptions): Promise<ExtractedResult>;
}
