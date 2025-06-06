declare module 'pdf.js-extract' {
  export interface PDFExtractOptions {
    firstPage?: number;
    lastPage?: number;
    password?: string;
    verbosity?: number;
    normalizeWhitespace?: boolean;
    disableCombineTextItems?: boolean;
  }

  export interface PDFExtractContentItem {
    str: string;
    x: number;
    y: number;
    w: number;
    h: number;
    fontName: string;
  }

  export interface PDFExtractPage {
    pageInfo: {
      num: number;
      scale: number;
      rotation: number;
      offsetX: number;
      offsetY: number;
      width: number;
      height: number;
    };
    content: PDFExtractContentItem[];
  }

  export interface PDFExtractResult {
    filename?: string;
    meta?: any;
    pages: PDFExtractPage[];
  }

  export class PDFExtract {
    constructor();
    extract(filename: string, options?: PDFExtractOptions): Promise<PDFExtractResult>;
  }
}
