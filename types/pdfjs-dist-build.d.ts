declare module 'pdfjs-dist/build/pdf.min.mjs' {
  export const GlobalWorkerOptions: { workerSrc?: string };
  export function getDocument(options: any): any;
  export function setPDFNetworkStreamFactory(factory: any): void;
}

