// types/pdfjs-worker.d.ts
declare module "pdfjs-dist" {
  const lib: {
    getDocument: (src: unknown) => { promise: Promise<unknown> };
    GlobalWorkerOptions: { workerSrc: string };
  };
  export default lib;
}

declare module "pdfjs-dist/build/pdf.mjs" {
  const lib: {
    getDocument: (src: unknown) => { promise: Promise<unknown> };
    GlobalWorkerOptions: { workerSrc: string };
  };
  export default lib;
}

declare module "pdfjs-dist/build/pdf.js" {
  const lib: {
    getDocument: (src: unknown) => { promise: Promise<unknown> };
    GlobalWorkerOptions: { workerSrc: string };
  };
  export default lib;
}

declare module "pdfjs-dist/build/pdf.worker.min.js" {
  const src: string;
  export default src;
}
declare module "pdfjs-dist/build/pdf.worker.js" {
  const src: string;
  export default src;
}
declare module "pdfjs-dist/build/pdf.worker.min.mjs" {
  const src: string;
  export default src;
}
declare module "pdfjs-dist/build/pdf.worker.mjs" {
  const src: string;
  export default src;
}