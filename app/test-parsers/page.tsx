'use client';

import { useState } from 'react';

interface StructuredContent {
  type?: string;
  scenes?: Array<{
    heading?: string;
    action?: string;
    dialogue?: Array<{ character: string; line: string }>;
    transitions?: string[];
  }>;
  metadata?: {
    title?: string;
    author?: string;
    totalScenes?: number;
  };
}

interface ParseMetadata {
  title?: string;
  author?: string;
  pageCount?: number;
  wordCount?: number;
  charCount?: number;
  language?: string;
  formatVersion?: string;
  custom?: Record<string, unknown>;
}

interface ParseResult {
  success: boolean;
  textContent?: string;
  structuredContent?: StructuredContent;
  metadata?: ParseMetadata;
  warnings?: string[];
  error?: string;
  processingTime?: number;
}

export default function TestParsersPage() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [result, setResult] = useState<ParseResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setResult(null);
    }
  };

  const testParser = async () => {
    if (!selectedFile) return;

    setIsLoading(true);
    const startTime = Date.now();

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);

      const response = await fetch('/api/test-ingestion', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();
      const processingTime = Date.now() - startTime;

      setResult({
        success: response.ok,
        textContent: data.textContent,
        structuredContent: data.structuredContent,
        metadata: data.metadata,
        warnings: data.warnings,
        error: data.error,
        processingTime,
      });
    } catch (error) {
      setResult({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        processingTime: Date.now() - startTime,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">
            Manthan OS Parser Test Suite
          </h1>
          <p className="text-slate-300">
            Test individual file parsers for the ingestion engine
          </p>
        </div>

        {/* File Upload Section */}
        <div className="backdrop-blur-md bg-white/10 border border-white/20 rounded-2xl p-6 mb-8 shadow-2xl">
          <h2 className="text-xl font-semibold text-white mb-4">Upload Test File</h2>
          
          <div className="space-y-4">
            <div>
              <input
                type="file"
                onChange={handleFileSelect}
                accept=".txt,.pdf,.fdx,.celtx,.docx,.pptx,.ppt"
                className="block w-full text-sm text-slate-300
                           file:mr-4 file:py-2 file:px-4
                           file:rounded-full file:border-0
                           file:text-sm file:font-semibold
                           file:bg-violet-600 file:text-white
                           hover:file:bg-violet-700
                           file:cursor-pointer cursor-pointer"
              />
              <p className="text-xs text-slate-400 mt-2">
                Supported formats: .txt, .pdf, .fdx, .celtx, .docx, .pptx, .ppt (Max 10MB)
              </p>
            </div>

            {selectedFile && (
              <div className="p-4 bg-slate-800/50 rounded-lg">
                <h3 className="text-sm font-medium text-white mb-2">Selected File</h3>
                <div className="text-sm text-slate-300 space-y-1">
                  <p><span className="font-medium">Name:</span> {selectedFile.name}</p>
                  <p><span className="font-medium">Size:</span> {formatFileSize(selectedFile.size)}</p>
                  <p><span className="font-medium">Type:</span> {selectedFile.type || 'Unknown'}</p>
                  <p><span className="font-medium">Extension:</span> {selectedFile.name.split('.').pop()?.toUpperCase() || 'Unknown'}</p>
                </div>
              </div>
            )}

            <button
              onClick={testParser}
              disabled={!selectedFile || isLoading}
              className="w-full py-3 px-6 bg-gradient-to-r from-violet-600 to-purple-600 
                         hover:from-violet-700 hover:to-purple-700 disabled:from-gray-600 
                         disabled:to-gray-600 disabled:cursor-not-allowed text-white 
                         font-semibold rounded-lg transition-all duration-200 shadow-lg"
            >
              {isLoading ? 'Processing...' : 'Test Parser'}
            </button>
          </div>
        </div>

        {/* Results Section */}
        {result && (
          <div className="backdrop-blur-md bg-white/10 border border-white/20 rounded-2xl p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-white">Parse Results</h2>
              <div className="flex items-center space-x-4">
                <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                  result.success 
                    ? 'bg-green-600/20 text-green-300 border border-green-500/30'
                    : 'bg-red-600/20 text-red-300 border border-red-500/30'
                }`}>
                  {result.success ? 'Success' : 'Failed'}
                </span>
                {result.processingTime && (
                  <span className="text-xs text-slate-400">
                    {result.processingTime}ms
                  </span>
                )}
              </div>
            </div>

            {result.error && (
              <div className="mb-6 p-4 bg-red-900/30 border border-red-500/30 rounded-lg">
                <h3 className="text-sm font-medium text-red-300 mb-2">Error</h3>
                <pre className="text-xs text-red-200 whitespace-pre-wrap">{result.error}</pre>
              </div>
            )}

            {result.warnings && result.warnings.length > 0 && (
              <div className="mb-6 p-4 bg-yellow-900/30 border border-yellow-500/30 rounded-lg">
                <h3 className="text-sm font-medium text-yellow-300 mb-2">Warnings</h3>
                <ul className="text-xs text-yellow-200 space-y-1">
                  {result.warnings.map((warning, index) => (
                    <li key={index}>• {warning}</li>
                  ))}
                </ul>
              </div>
            )}

            {result.metadata && (
              <div className="mb-6 p-4 bg-blue-900/30 border border-blue-500/30 rounded-lg">
                <h3 className="text-sm font-medium text-blue-300 mb-2">Metadata</h3>
                <pre className="text-xs text-blue-200 whitespace-pre-wrap overflow-x-auto">
                  {JSON.stringify(result.metadata, null, 2)}
                </pre>
              </div>
            )}

            {result.structuredContent && (
              <div className="mb-6 p-4 bg-purple-900/30 border border-purple-500/30 rounded-lg">
                <h3 className="text-sm font-medium text-purple-300 mb-2">Structured Content</h3>
                <pre className="text-xs text-purple-200 whitespace-pre-wrap overflow-x-auto max-h-60 overflow-y-auto">
                  {JSON.stringify(result.structuredContent, null, 2)}
                </pre>
              </div>
            )}

            {result.textContent && (
              <div className="p-4 bg-slate-800/50 rounded-lg">
                <h3 className="text-sm font-medium text-white mb-2">
                  Extracted Text Content ({result.textContent.length} characters)
                </h3>
                <pre className="text-xs text-slate-300 whitespace-pre-wrap overflow-x-auto max-h-60 overflow-y-auto">
                  {result.textContent.substring(0, 2000)}{result.textContent.length > 2000 && '...'}
                </pre>
              </div>
            )}
          </div>
        )}

        {/* Parser Info */}
        <div className="mt-8 backdrop-blur-md bg-white/5 border border-white/10 rounded-2xl p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Supported Parsers</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
            <div className="p-3 bg-slate-800/30 rounded-lg">
              <h3 className="font-medium text-white mb-1">.txt Files</h3>
              <p className="text-slate-400">Plain text extraction with encoding detection</p>
            </div>
            <div className="p-3 bg-slate-800/30 rounded-lg">
              <h3 className="font-medium text-white mb-1">.pdf Files</h3>
              <p className="text-slate-400">PDF content extraction using pdf-parse</p>
            </div>
            <div className="p-3 bg-slate-800/30 rounded-lg">
              <h3 className="font-medium text-white mb-1">.fdx Files</h3>
              <p className="text-slate-400">Final Draft screenplay with structured parsing</p>
            </div>
            <div className="p-3 bg-slate-800/30 rounded-lg">
              <h3 className="font-medium text-white mb-1">.celtx Files</h3>
              <p className="text-slate-400">Celtx screenplay with scene extraction</p>
            </div>
            <div className="p-3 bg-slate-800/30 rounded-lg">
              <h3 className="font-medium text-white mb-1">.docx Files</h3>
              <p className="text-slate-400">Word documents using mammoth.js</p>
            </div>
            <div className="p-3 bg-slate-800/30 rounded-lg">
              <h3 className="font-medium text-white mb-1">.pptx/.ppt Files</h3>
              <p className="text-slate-400">PowerPoint presentations</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}