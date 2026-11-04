import React, { useState, useEffect } from 'react';
import {
  Folder,
  FileCode,
  Flame,
  CheckCircle2,
  Copy,
  ChevronRight,
  ChevronDown,
} from 'lucide-react';

interface FileNode {
  name: string;
  path: string;
  type: 'dir' | 'file';
  size?: number;
  children?: FileNode[];
}

export const CodeExplorerView: React.FC = () => {
  const [fileTree, setFileTree] = useState<FileNode[]>([]);
  const [selectedFile, setSelectedFile] = useState<string>('engine/risk_firewall.py');
  const [fileContent, setFileContent] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [copied, setCopied] = useState<boolean>(false);
  const [openDirs, setOpenDirs] = useState<Record<string, boolean>>({
    config: true,
    core: true,
    engine: true,
    ingestor: true,
    intelligence: true,
    ai_arena: true,
    trainer_forge: true,
    tests: true,
  });

  const toggleDir = (dirPath: string) => {
    setOpenDirs((prev) => ({ ...prev, [dirPath]: !prev[dirPath] }));
  };

  useEffect(() => {
    fetch('/api/code/files')
      .then((res) => res.json())
      .then((data) => {
        setFileTree(data || []);
        setLoading(false);
      })
      .catch((err) => console.error(err));
  }, []);

  useEffect(() => {
    if (!selectedFile) return;
    fetch(`/api/code/content?path=${encodeURIComponent(selectedFile)}`)
      .then((res) => res.json())
      .then((data) => {
        setFileContent(data.content || '');
      })
      .catch((err) => console.error(err));
  }, [selectedFile]);

  const handleCopy = () => {
    navigator.clipboard.writeText(fileContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const renderTree = (nodes: FileNode[]) => {
    return (
      <div className="space-y-0.5">
        {nodes.map((node) => {
          if (node.type === 'dir') {
            const isOpen = !!openDirs[node.name];
            return (
              <div key={node.path}>
                <button
                  onClick={() => toggleDir(node.name)}
                  className="w-full flex items-center gap-1.5 px-2 py-1 rounded text-left text-xs font-mono text-slate-300 hover:bg-slate-800/60"
                >
                  {isOpen ? (
                    <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
                  ) : (
                    <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
                  )}
                  <Folder className="w-3.5 h-3.5 text-amber-400" />
                  <span className="font-semibold text-slate-200">{node.name}/</span>
                </button>
                {isOpen && node.children && (
                  <div className="pl-4 border-l border-slate-800/80 ml-3">
                    {renderTree(node.children)}
                  </div>
                )}
              </div>
            );
          } else {
            const isSelected = selectedFile === node.path;
            return (
              <button
                key={node.path}
                onClick={() => setSelectedFile(node.path)}
                className={`w-full flex items-center justify-between px-2 py-1 rounded text-left text-xs font-mono transition ${
                  isSelected
                    ? 'bg-cyan-950/80 text-cyan-300 font-bold border border-cyan-800/40'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                }`}
              >
                <div className="flex items-center gap-1.5 truncate">
                  <FileCode className="w-3.5 h-3.5 text-cyan-400 flex-shrink-0" />
                  <span className="truncate">{node.name}</span>
                </div>
                {node.size && (
                  <span className="text-[10px] text-slate-500 font-normal pl-2">
                    {(node.size / 1024).toFixed(1)}k
                  </span>
                )}
              </button>
            );
          }
        })}
      </div>
    );
  };

  return (
    <div className="p-4 space-y-4 max-w-[1600px] mx-auto">
      {/* Banner */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 text-slate-950 flex items-center justify-center font-bold">
            <Flame className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-extrabold text-white">Проводник репозитория ZimaTrade AI</h2>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-500/30">
                zima_trade_ai/
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Боевое дерево исходного кода Python 3.11+ для OpenCode с базой SQLite WAL, кольцевым буфером SharedMemory и процедурным Риск-Файрволом.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs font-mono">
          <span className="px-3 py-1 bg-emerald-950/80 text-emerald-300 border border-emerald-500/30 rounded-lg flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5" /> Все 9 модульных тестов пройдены
          </span>
        </div>
      </div>

      {/* Explorer Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* File Tree (4 cols) */}
        <div className="lg:col-span-4 bg-slate-900/80 border border-slate-800 rounded-xl p-3 max-h-[700px] overflow-y-auto">
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800 text-xs font-mono text-slate-400">
            <span>Дерево файлов проекта</span>
            <span>zima_trade_ai/</span>
          </div>
          {loading ? (
            <div className="text-center py-6 text-slate-500 text-xs font-mono">Загрузка дерева файлов...</div>
          ) : (
            renderTree(fileTree)
          )}
        </div>

        {/* Code Content Viewer (8 cols) */}
        <div className="lg:col-span-8 bg-slate-900/80 border border-slate-800 rounded-xl p-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <FileCode className="w-4 h-4 text-cyan-400" />
                <span className="font-mono text-xs font-bold text-white">{selectedFile}</span>
              </div>
              <button
                onClick={handleCopy}
                className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-mono transition flex items-center gap-1"
              >
                {copied ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Скопировано!' : 'Копировать код'}</span>
              </button>
            </div>

            <pre className="bg-slate-950 p-4 rounded-xl border border-slate-800/80 text-[11px] font-mono text-slate-200 overflow-x-auto max-h-[600px] scrollbar-thin">
              <code>{fileContent}</code>
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
};
